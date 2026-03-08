import type { FastifyInstance } from "fastify";
import { eq, sql } from "drizzle-orm";
import { type Db, networks, blocks, transactions, syncCursors } from "@clustec/common";

export function registerNetworkRoutes(app: FastifyInstance, db: Db) {
  app.get("/api/networks", async () => {
    return db.select().from(networks);
  });

  app.get<{ Params: { id: string } }>("/api/networks/:id/stats", async (request) => {
    const { id } = request.params;

    const [network] = await db
      .select()
      .from(networks)
      .where(eq(networks.id, id))
      .limit(1);

    if (!network) {
      return { error: "Network not found" };
    }

    const [blockCount] = await db
      .select({ count: sql<number>`count(*)` })
      .from(blocks)
      .where(eq(blocks.networkId, id));

    const [txCount] = await db
      .select({ count: sql<number>`count(*)` })
      .from(transactions)
      .where(eq(transactions.networkId, id));

    const [cursor] = await db
      .select()
      .from(syncCursors)
      .where(eq(syncCursors.networkId, id))
      .limit(1);

    return {
      network,
      blockCount: blockCount.count,
      txCount: txCount.count,
      lastIndexedBlock: cursor?.lastBlockNumber ?? 0,
    };
  });
}
