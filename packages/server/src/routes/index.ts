import type { FastifyInstance } from "fastify";
import type { Db } from "@clustec/common";
import { registerNetworkRoutes } from "./networks.ts";
import { registerBlockRoutes } from "./blocks.ts";
import { registerTxRoutes } from "./txs.ts";
import { registerClusterRoutes } from "./clusters.ts";
import { registerLabelRoutes } from "./labels.ts";
import { registerAnalyzeRoutes } from "./analyze.ts";
import { registerGraphRoutes } from "./graph.ts";

export function registerRoutes(app: FastifyInstance, db: Db) {
  registerNetworkRoutes(app, db);
  registerBlockRoutes(app, db);
  registerTxRoutes(app, db);
  registerClusterRoutes(app, db);
  registerLabelRoutes(app, db);
  registerAnalyzeRoutes(app, db);
  registerGraphRoutes(app, db);
}
