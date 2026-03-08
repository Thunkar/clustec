import type { FastifyInstance } from "fastify";
import type { Db } from "@clustec/common";
import { registerNetworkRoutes } from "./networks.js";
import { registerBlockRoutes } from "./blocks.js";
import { registerTxRoutes } from "./txs.js";
import { registerClusterRoutes } from "./clusters.js";
import { registerLabelRoutes } from "./labels.js";
import { registerAnalyzeRoutes } from "./analyze.js";
import { registerGraphRoutes } from "./graph.js";

export function registerRoutes(app: FastifyInstance, db: Db) {
  registerNetworkRoutes(app, db);
  registerBlockRoutes(app, db);
  registerTxRoutes(app, db);
  registerClusterRoutes(app, db);
  registerLabelRoutes(app, db);
  registerAnalyzeRoutes(app, db);
  registerGraphRoutes(app, db);
}
