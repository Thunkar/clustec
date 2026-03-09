import "dotenv/config";
import { readFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { createAztecNodeClient } from "@aztec/aztec.js/node";
import { L2BlockStream } from "@aztec/stdlib/block";
import { eq } from "drizzle-orm";
import { createDb, networks, syncCursors } from "@clustec/common";
import { MempoolPoller } from "./mempool-poller.js";
import { BlockHandler } from "./block-handler.js";

interface NetworkConfig {
  id: string;
  name?: string;
  nodeUrl: string;
  chainId?: number;
  enabled?: boolean;
  mempoolPollIntervalMs?: number;
  blockPollIntervalMs?: number;
}

function loadConfig(configPath: string): NetworkConfig {
  const raw = readFileSync(configPath, "utf-8");
  const config = JSON.parse(raw) as NetworkConfig;
  if (!config.id || !config.nodeUrl) {
    throw new Error(
      `Invalid config at ${configPath}: 'id' and 'nodeUrl' are required`
    );
  }
  return config;
}

async function main() {
  const { values } = parseArgs({
    options: {
      config: { type: "string", short: "c" },
    },
  });

  const configPath = values.config;
  if (!configPath) {
    console.error("Usage: indexer --config <path-to-network-config.json>");
    process.exit(1);
  }

  const config = loadConfig(configPath);
  if (config.enabled === false) {
    console.log(`[${config.id}] Network is disabled. Exiting.`);
    process.exit(0);
  }

  console.log(`[${config.id}] Connecting to node at ${config.nodeUrl}...`);
  const node = createAztecNodeClient(config.nodeUrl);

  // Verify connectivity
  try {
    const blockNumber = await node.getBlockNumber();
    console.log(`[${config.id}] Connected. Current block: ${blockNumber}`);
  } catch (err) {
    console.error(`[${config.id}] Failed to connect to node:`, err);
    process.exit(1);
  }

  const db = createDb();

  // Ensure network is registered
  const existing = await db
    .select()
    .from(networks)
    .where(eq(networks.id, config.id))
    .limit(1);

  if (existing.length === 0) {
    await db.insert(networks).values({
      id: config.id,
      name: config.name ?? config.id,
      nodeUrl: config.nodeUrl,
      chainId: config.chainId ?? 0,
    });
    await db.insert(syncCursors).values({
      networkId: config.id,
      lastBlockNumber: 0,
    });
    console.log(`[${config.id}] Network registered in DB.`);
  }

  // 1. Mempool poller — catches pending txs with full Tx data
  const mempoolPoller = new MempoolPoller(
    config.id,
    node,
    db,
    config.mempoolPollIntervalMs ?? 500
  );

  // 2. Block stream — updates tx status (mined/finalized) and handles reorgs
  // BlockHandler extends L2TipsMemoryStore, so it serves as both the local
  // data provider (tip tracking) and the event handler (DB updates).
  const blockHandler = new BlockHandler(config.id, db);

  const blockStream = new L2BlockStream(node, blockHandler, blockHandler, undefined, {
    pollIntervalMS: config.blockPollIntervalMs ?? 2000,
    skipFinalized: true,
    ignoreCheckpoints: true,
  });

  // Graceful shutdown
  const shutdown = async () => {
    console.log(`\n[${config.id}] Shutting down...`);
    mempoolPoller.stop();
    await blockStream.stop();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  // Start both concurrently
  mempoolPoller.start();
  blockStream.start();

  console.log(`[${config.id}] Indexer running (mempool + block stream).`);

  // Keep process alive
  await new Promise(() => {});
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
