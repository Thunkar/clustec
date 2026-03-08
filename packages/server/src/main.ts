import "dotenv/config";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import Fastify from "fastify";
import { createDb, networks, contractLabels } from "@clustec/common";
import { registerRoutes } from "./routes/index.js";
import { startAnalysisScheduler } from "./routes/analyze.js";
import {
  ProtocolContractAddress,
  protocolContractNames,
} from "@aztec/protocol-contracts";

interface ContractEntry {
  address: string;
  label: string;
  contractType: string;
}

interface NetworkConfig {
  id: string;
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
 * Load contract labels from network config files in configs/networks/.
 * Returns a map of networkId → contract entries.
 */
function loadNetworkContracts(): Map<string, ContractEntry[]> {
  const configDir = join(
    import.meta.dirname,
    "..",
    "..",
    "..",
    "configs",
    "networks"
  );
  const result = new Map<string, ContractEntry[]>();

  try {
    const files = readdirSync(configDir).filter((f) => f.endsWith(".json"));
    for (const file of files) {
      const raw = readFileSync(join(configDir, file), "utf-8");
      const config = JSON.parse(raw) as NetworkConfig;
      if (config.id && config.contracts) {
        result.set(config.id, config.contracts);
      }
    }
  } catch {
    // configs dir may not exist in production
  }

  return result;
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
    reply.header("Access-Control-Allow-Headers", "Content-Type");
    if (request.method === "OPTIONS") {
      reply.status(204).send();
    }
  });

  registerRoutes(app, db);

  await app.listen({ port, host });

  // Start analysis scheduler — query DB for known networks
  const rows = await db.select({ id: networks.id }).from(networks);
  const networkIds = rows.map((r) => r.id);

  // Load per-network contract labels from config files
  const networkContracts = loadNetworkContracts();

  // Seed contract labels for all networks
  for (const networkId of networkIds) {
    // Protocol contracts (same for all networks)
    const allContracts = [...PROTOCOL_CONTRACTS];

    // Network-specific contracts from config
    const extra = networkContracts.get(networkId);
    if (extra) {
      allContracts.push(...extra);
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
    startAnalysisScheduler(app, networkIds, analysisIntervalMs);
  } else {
    app.log.warn("No networks found in DB — analysis scheduler not started");
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
