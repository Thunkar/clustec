import { loadEnv } from "@clustec/common/env";
loadEnv();
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import Fastify from "fastify";
import fjwt from "@fastify/jwt";
import { createDb, networks, contractLabels } from "@clustec/common";
import { registerRoutes } from "./routes/index.ts";
import { startAnalysisScheduler } from "./routes/analyze.ts";
import {
  ProtocolContractAddress,
  protocolContractNames,
} from "@aztec/protocol-contracts";
import { FeePricingService } from "./services/fee-pricing.ts";

interface ContractEntry {
  address: string;
  label: string;
  contractType: string;
}

interface NetworkConfig {
  id: string;
  nodeUrl?: string;
  chainId?: number;
  contracts?: ContractEntry[];
}

const PROTOCOL_CONTRACTS: ContractEntry[] = protocolContractNames.map(
  (name) => ({
    address: ProtocolContractAddress[name].toString(),
    label: name,
    contractType: "Protocol",
  })
);

/**
 * Load network config files from configs/networks/.
 * Returns a map of networkId → full config.
 */
function loadNetworkConfigs(): Map<string, NetworkConfig> {
  const configDir = join(
    import.meta.dirname,
    "..",
    "..",
    "..",
    "configs",
    "networks"
  );
  const result = new Map<string, NetworkConfig>();

  try {
    const files = readdirSync(configDir).filter((f) => f.endsWith(".json"));
    for (const file of files) {
      const raw = readFileSync(join(configDir, file), "utf-8");
      const config = JSON.parse(raw) as NetworkConfig;
      if (config.id) {
        result.set(config.id, config);
      }
    }
  } catch {
    // configs dir may not exist in production
  }

  return result;
}

/**
 * Fetch L1 info (rollup address and chain ID) from an Aztec node via getNodeInfo.
 * Uses a single-shot fetch to avoid the SDK client's aggressive retry behavior.
 */
async function fetchL1Info(nodeUrl: string): Promise<{ rollupAddress: string; l1ChainId: number } | null> {
  try {
    const res = await fetch(nodeUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", method: "node_getNodeInfo", params: [], id: 1 }),
      signal: AbortSignal.timeout(5000),
    });
    const data = (await res.json()) as {
      result?: { l1ChainId?: number; l1ContractAddresses?: { rollupAddress?: string } };
    };
    const rollupAddress = data.result?.l1ContractAddresses?.rollupAddress;
    const l1ChainId = data.result?.l1ChainId;
    if (!rollupAddress || l1ChainId == null) return null;
    return { rollupAddress, l1ChainId };
  } catch {
    return null;
  }
}

const port = parseInt(process.env.PORT ?? "3002", 10);
const host = process.env.HOST ?? "0.0.0.0";
const analysisIntervalMs = parseInt(
  process.env.ANALYSIS_INTERVAL_MS ?? String(10 * 60 * 1000),
  10
);

async function main() {
  const db = createDb();

  const app = Fastify({
    logger: {
      transport:
        process.env.NODE_ENV !== "production"
          ? { target: "pino-pretty" }
          : undefined,
    },
  });

  // CORS for frontend
  app.addHook("onRequest", async (request, reply) => {
    reply.header("Access-Control-Allow-Origin", "*");
    reply.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
    reply.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
    if (request.method === "OPTIONS") {
      reply.status(204).send();
    }
  });

  const jwtSecret = process.env.JWT_SECRET;
  if (!jwtSecret) throw new Error("JWT_SECRET env var is required");
  await app.register(fjwt, { secret: jwtSecret });

  // Load per-network config files
  const networkConfigs = loadNetworkConfigs();

  // Initialize fee pricing services per network
  const l1RpcUrl = process.env.L1_RPC_URL;
  const feePricing = new Map<string, FeePricingService>();

  for (const [id, config] of networkConfigs) {
    if (!config.nodeUrl) continue;
    const l1Info = await fetchL1Info(config.nodeUrl);
    if (!l1Info) continue;
    const service = new FeePricingService(l1RpcUrl, l1Info.l1ChainId);
    service.init(l1Info.rollupAddress);
    if (service.enabled) {
      feePricing.set(id, service);
      app.log.info({ network: id, rollupAddress: l1Info.rollupAddress, l1ChainId: l1Info.l1ChainId }, "Fee pricing enabled");
    }
  }

  registerRoutes(app, db, feePricing);

  await app.listen({ port, host });

  // Wait for the indexer to register networks (they start in parallel via docker-compose).
  // Retry a few times with increasing delay before giving up.
  let networkIds: string[] = [];
  for (let attempt = 0; attempt < 10; attempt++) {
    const rows = await db.select({ id: networks.id }).from(networks);
    networkIds = rows.map((r) => r.id);
    if (networkIds.length > 0) break;
    const delayMs = 3000 * (attempt + 1);
    app.log.info(`No networks in DB yet, retrying in ${delayMs / 1000}s (attempt ${attempt + 1}/10)…`);
    await new Promise((r) => setTimeout(r, delayMs));
  }

  // Seed contract labels for all networks
  for (const networkId of networkIds) {
    // Protocol contracts (same for all networks)
    const allContracts = [...PROTOCOL_CONTRACTS];

    // Network-specific contracts from config
    const config = networkConfigs.get(networkId);
    if (config?.contracts) {
      allContracts.push(...config.contracts);
    }

    for (const contract of allContracts) {
      await db
        .insert(contractLabels)
        .values({ networkId, ...contract })
        .onConflictDoUpdate({
          target: [contractLabels.networkId, contractLabels.address],
          set: { label: contract.label, contractType: contract.contractType },
        });
    }

    app.log.info(
      { network: networkId, count: allContracts.length },
      "Seeded contract labels"
    );
  }

  if (networkIds.length > 0) {
    app.log.info(
      { networks: networkIds, intervalMs: analysisIntervalMs },
      "Starting analysis scheduler"
    );
    startAnalysisScheduler(app, db, networkIds, analysisIntervalMs);
  } else {
    app.log.warn("No networks found in DB after 10 attempts — analysis scheduler not started");
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
