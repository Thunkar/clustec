import type { FastifyInstance } from "fastify";
import { eq, and } from "drizzle-orm";
import { type Db, contractLabels } from "@clustec/common";

export function registerLabelRoutes(app: FastifyInstance, db: Db) {
  app.get<{ Params: { id: string } }>("/api/networks/:id/labels", async (request) => {
    const { id } = request.params;
    return db
      .select()
      .from(contractLabels)
      .where(eq(contractLabels.networkId, id));
  });

  app.post<{
    Params: { id: string };
    Body: { address: string; label: string; contractType?: string };
  }>("/api/networks/:id/labels", async (request, reply) => {
    const { id } = request.params;
    const { address, label, contractType } = request.body;

    const [inserted] = await db
      .insert(contractLabels)
      .values({ networkId: id, address, label, contractType })
      .onConflictDoUpdate({
        target: [contractLabels.networkId, contractLabels.address],
        set: { label, contractType },
      })
      .returning();

    reply.status(201);
    return inserted;
  });

  app.delete<{
    Params: { id: string; labelId: string };
  }>("/api/networks/:id/labels/:labelId", async (request, reply) => {
    const labelId = parseInt(request.params.labelId, 10);
    await db.delete(contractLabels).where(eq(contractLabels.id, labelId));
    reply.status(204).send();
  });
}
