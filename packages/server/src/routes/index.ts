import type { FastifyInstance } from "fastify";
import type { Db } from "@clustec/common";
import type { FeePricingService } from "../services/fee-pricing.ts";
import { registerNetworkRoutes } from "./networks.ts";
import { registerBlockRoutes } from "./blocks.ts";
import { registerTxRoutes } from "./txs.ts";
import { registerClusterRoutes } from "./clusters.ts";
import { registerLabelRoutes } from "./labels.ts";
import { registerAnalyzeRoutes } from "./analyze.ts";
import { registerGraphRoutes } from "./graph.ts";
import { registerMurderBoardRoutes } from "./murder-board.ts";

export function registerRoutes(
  app: FastifyInstance,
  db: Db,
  feePricing?: Map<string, FeePricingService>,
) {
  registerNetworkRoutes(app, db);
  registerBlockRoutes(app, db);
  registerTxRoutes(app, db, feePricing);
  registerClusterRoutes(app, db);
  registerLabelRoutes(app, db);
  registerAnalyzeRoutes(app, db);
  registerGraphRoutes(app, db);
  registerMurderBoardRoutes(app, db);
}
