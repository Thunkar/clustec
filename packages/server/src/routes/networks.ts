import type { FastifyInstance } from "fastify";
import { eq, sql } from "drizzle-orm";
import { type Db, networks, blocks, transactions, syncCursors } from "@clustec/common";

export function registerNetworkRoutes(app: FastifyInstance, db: Db, enabledNetworks?: Set<string>) {
  app.get("/api/networks", async () => {
    const rows = await db.select().from(networks);
    return enabledNetworks ? rows.filter((r) => enabledNetworks.has(r.id)) : rows;
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
      proposedBlock: cursor?.proposedBlock ?? 0,
      checkpointedBlock: cursor?.checkpointedBlock ?? 0,
      provenBlock: cursor?.provenBlock ?? 0,
      finalizedBlock: cursor?.finalizedBlock ?? 0,
    };
  });
}
