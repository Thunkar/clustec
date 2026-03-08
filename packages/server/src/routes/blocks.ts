import type { FastifyInstance } from "fastify";
import { eq, desc, and } from "drizzle-orm";
import { type Db, blocks, transactions } from "@clustec/common";

export function registerBlockRoutes(app: FastifyInstance, db: Db) {
  app.get<{
    Params: { id: string };
    Querystring: { page?: string; limit?: string };
  }>("/api/networks/:id/blocks", async (request) => {
    const { id } = request.params;
    const page = parseInt(request.query.page ?? "1", 10);
    const limit = Math.min(parseInt(request.query.limit ?? "50", 10), 100);
    const offset = (page - 1) * limit;

    const rows = await db
      .select()
      .from(blocks)
      .where(eq(blocks.networkId, id))
      .orderBy(desc(blocks.blockNumber))
      .limit(limit)
      .offset(offset);

    return { data: rows, page, limit };
  });

  app.get<{
    Params: { id: string; blockNumber: string };
  }>("/api/networks/:id/blocks/:blockNumber", async (request) => {
    const { id, blockNumber } = request.params;
    const num = parseInt(blockNumber, 10);

    const [block] = await db
      .select()
      .from(blocks)
      .where(and(eq(blocks.networkId, id), eq(blocks.blockNumber, num)))
      .limit(1);

    if (!block) {
      return { error: "Block not found" };
    }

    const txs = await db
      .select()
      .from(transactions)
      .where(and(eq(transactions.networkId, id), eq(transactions.blockNumber, num)));

    return { block, transactions: txs };
  });
}
