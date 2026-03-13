import { timingSafeEqual } from "node:crypto";
import type { FastifyInstance } from "fastify";

export function registerAuthRoutes(app: FastifyInstance) {
  app.post<{ Body: { password: string } }>(
    "/api/auth/login",
    async (request, reply) => {
      const { password } = request.body;
      const adminPassword = process.env.ADMIN_PASSWORD;

      if (!adminPassword) {
        reply.status(500).send({ error: "Admin auth not configured" });
        return;
      }

      const inputBuf = Buffer.from(password ?? "");
      const expectedBuf = Buffer.from(adminPassword);

      const match =
        inputBuf.length === expectedBuf.length &&
        timingSafeEqual(inputBuf, expectedBuf);

      if (!match) {
        reply.status(401).send({ error: "Unauthorized" });
        return;
      }

      const token = app.jwt.sign({ role: "admin" }, { expiresIn: "24h" });
      return { token };
    }
  );
}
