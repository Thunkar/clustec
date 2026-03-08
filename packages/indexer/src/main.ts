import "dotenv/config";
import { parseArgs } from "node:util";
import { createAztecNodeClient } from "@aztec/aztec.js/node";
import { createDb } from "@clustec/common";
import { loadConfig } from "./config.js";
import { Poller } from "./poller.js";

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
  if (!config.enabled) {
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
  const poller = new Poller(config, node, db);

  // Graceful shutdown
  const shutdown = () => {
    console.log(`\n[${config.id}] Shutting down...`);
    poller.stop();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  await poller.start();
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
