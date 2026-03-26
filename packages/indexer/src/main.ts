import { loadEnv } from "@clustec/common/env";
loadEnv();
import "./instrument.ts";
import * as Sentry from "@sentry/node";
import { readFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { createAztecNodeClient } from "@aztec/aztec.js/node";
import { L2BlockStream } from "@aztec/stdlib/block";
import { eq } from "drizzle-orm";
import { createDb, networks, syncCursors } from "@clustec/common";
import { BlockProcessor } from "./block-processor.ts";
import { MempoolWatcher } from "./mempool-watcher.ts";
import { startReconciler } from "./reconciler.ts";

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
      proposedBlock: 0,
      checkpointedBlock: 0,
      provenBlock: 0,
      finalizedBlock: 0,
    });
    console.log(`[${config.id}] Network registered in DB.`);
  }

  // 1. Reconcile non-finalized txs on startup + periodically (every 60s)
  console.log(`[${config.id}] Starting reconciler...`);
  await startReconciler(config.id, node, db);

  // 2. Mempool watcher — catches pending txs with full Tx data
  const mempoolWatcher = new MempoolWatcher(
    config.id,
    node,
    db,
    config.mempoolPollIntervalMs ?? 500
  );

  // 3. Block stream — processes blocks (source of truth) and status lifecycle
  // We must never process finalized blocks — getTxByHash won't have them.
  // On restart: resume from where we left off (proposedBlock cursor).
  // On fresh DB: start from the current node tip (only index going forward).
  const [cursor] = await db
    .select()
    .from(syncCursors)
    .where(eq(syncCursors.networkId, config.id))
    .limit(1);

  const cursorBlock = cursor?.proposedBlock ?? 0;
  const currentNodeBlock = await node.getBlockNumber();
  // If cursor is 0 (fresh DB), start from current tip so we only index new blocks.
  // Otherwise resume from where we left off.
  const startingBlock = cursorBlock === 0 ? currentNodeBlock + 1 : cursorBlock + 1;
  console.log(
    `[${config.id}] Block stream starting from block ${startingBlock} ` +
    `(cursor: ${cursorBlock}, node tip: ${currentNodeBlock})`
  );

  const blockProcessor = new BlockProcessor(config.id, node, db);

  const blockStream = new L2BlockStream(
    node,
    blockProcessor,
    blockProcessor,
    undefined,
    {
      pollIntervalMS: config.blockPollIntervalMs ?? 2000,
      skipFinalized: true,
      startingBlock,
    }
  );

  // Graceful shutdown
  const shutdown = async () => {
    console.log(`\n[${config.id}] Shutting down...`);
    mempoolWatcher.stop();
    await blockStream.stop();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  // Start both concurrently
  mempoolWatcher.start();
  blockStream.start();

  console.log(`[${config.id}] Indexer running (mempool watcher + block stream).`);

  // Keep process alive
  await new Promise(() => {});
}

main().catch(async (err) => {
  console.error("Fatal error:", err);
  Sentry.captureException(err);
  await Sentry.flush(2000);
  process.exit(1);
});
