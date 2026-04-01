import type { FastifyInstance } from "fastify";
import { eq, and, desc, sql, inArray } from "drizzle-orm";
import {
  type Db,
  clusterRuns,
  clusterMemberships,
  umapProjections,
  transactions,
} from "@clustec/common";

export function registerClusterRoutes(app: FastifyInstance, db: Db) {
  // List cluster runs for a network
  app.get<{ Params: { id: string } }>("/api/networks/:id/clusters", async (request) => {
    const { id } = request.params;
    return db
      .select()
      .from(clusterRuns)
      .where(eq(clusterRuns.networkId, id))
      .orderBy(desc(clusterRuns.computedAt));
  });

  // Get a specific cluster run with summary
  app.get<{ Params: { id: string; runId: string } }>(
    "/api/networks/:id/clusters/:runId",
    async (request) => {
      const runId = parseInt(request.params.runId, 10);

      const { id } = request.params;
      const [run] = await db
        .select()
        .from(clusterRuns)
        .where(and(eq(clusterRuns.id, runId), eq(clusterRuns.networkId, id)))
        .limit(1);

      if (!run) return { error: "Cluster run not found" };

      // Get cluster sizes
      const clusterSizes = await db
        .select({
          clusterId: clusterMemberships.clusterId,
          count: sql<number>`count(*)`,
          avgOutlierScore: sql<number>`avg(${clusterMemberships.outlierScore})`,
          maxOutlierScore: sql<number>`max(${clusterMemberships.outlierScore})`,
        })
        .from(clusterMemberships)
        .where(eq(clusterMemberships.runId, runId))
        .groupBy(clusterMemberships.clusterId);

      return { run, clusterSizes };
    }
  );

  // Get txs in a specific cluster
  app.get<{ Params: { id: string; runId: string; clusterId: string } }>(
    "/api/networks/:id/clusters/:runId/:clusterId",
    async (request) => {
      const { id } = request.params;
      const runId = parseInt(request.params.runId, 10);
      const clusterId = parseInt(request.params.clusterId, 10);

      // Validate the run belongs to this network
      const [run] = await db
        .select({ id: clusterRuns.id })
        .from(clusterRuns)
        .where(and(eq(clusterRuns.id, runId), eq(clusterRuns.networkId, id)))
        .limit(1);
      if (!run) return { clusterId, members: [] };

      const members = await db
        .select({
          txId: clusterMemberships.txId,
          txHash: transactions.txHash,
          status: transactions.status,
          membershipScore: clusterMemberships.membershipScore,
          outlierScore: clusterMemberships.outlierScore,
          blockNumber: transactions.blockNumber,
          numNoteHashes: transactions.numNoteHashes,
          numNullifiers: transactions.numNullifiers,
          numL2ToL1Msgs: transactions.numL2ToL1Msgs,
          numPrivateLogs: transactions.numPrivateLogs,
          numContractClassLogs: transactions.numContractClassLogs,
          numPublicLogs: transactions.numPublicLogs,
          gasLimitDa: transactions.gasLimitDa,
          gasLimitL2: transactions.gasLimitL2,
          maxFeePerDaGas: transactions.maxFeePerDaGas,
          maxFeePerL2Gas: transactions.maxFeePerL2Gas,
          numSetupCalls: transactions.numSetupCalls,
          numAppCalls: transactions.numAppCalls,
          hasTeardown: transactions.hasTeardown,
          totalPublicCalldataSize: transactions.totalPublicCalldataSize,
          expirationTimestamp: transactions.expirationTimestamp,
          feePayer: transactions.feePayer,
        })
        .from(clusterMemberships)
        .innerJoin(transactions, eq(transactions.id, clusterMemberships.txId))
        .where(
          and(
            eq(clusterMemberships.runId, runId),
            eq(clusterMemberships.clusterId, clusterId)
          )
        );

      return { clusterId, members };
    }
  );

  // UMAP data for scatter plot — pre-aggregated on server
  // Returns cluster centroids (avg x/y/z + count) and individual outlier points
  app.get<{ Params: { id: string; runId: string } }>(
    "/api/networks/:id/clusters/:runId/umap",
    async (request) => {
      const { id } = request.params;
      const runId = parseInt(request.params.runId, 10);

      const [run] = await db
        .select({ id: clusterRuns.id })
        .from(clusterRuns)
        .where(and(eq(clusterRuns.id, runId), eq(clusterRuns.networkId, id)))
        .limit(1);
      if (!run) return { runId, clusters: [], outliers: [] };

      // Aggregate cluster centroids in SQL
      const clusterRows = await db.execute<{
        cluster_id: number;
        cx: number;
        cy: number;
        cz: number;
        count: number;
      }>(sql`
        SELECT
          cm.cluster_id,
          avg(u.x)::real AS cx,
          avg(u.y)::real AS cy,
          avg(coalesce(u.z, 0))::real AS cz,
          count(*)::int AS count
        FROM umap_projections u
        INNER JOIN cluster_memberships cm
          ON cm.run_id = u.run_id AND cm.tx_id = u.tx_id
        WHERE u.run_id = ${runId} AND cm.cluster_id >= 0
        GROUP BY cm.cluster_id
      `);

      // Fetch individual outlier points with txHash
      const outlierRows = await db
        .select({
          x: umapProjections.x,
          y: umapProjections.y,
          z: umapProjections.z,
          txHash: transactions.txHash,
          outlierScore: clusterMemberships.outlierScore,
        })
        .from(umapProjections)
        .innerJoin(
          clusterMemberships,
          and(
            eq(clusterMemberships.runId, umapProjections.runId),
            eq(clusterMemberships.txId, umapProjections.txId)
          )
        )
        .innerJoin(transactions, eq(transactions.id, umapProjections.txId))
        .where(and(
          eq(umapProjections.runId, runId),
          eq(clusterMemberships.clusterId, -1),
        ));

      return {
        runId,
        clusters: clusterRows.map((c) => ({
          clusterId: c.cluster_id,
          cx: c.cx,
          cy: c.cy,
          cz: c.cz,
          count: c.count,
        })),
        outliers: outlierRows.map((o) => ({
          x: o.x,
          y: o.y,
          z: o.z ?? 0,
          txHash: o.txHash,
          outlierScore: o.outlierScore,
        })),
      };
    }
  );

  // Smallest privacy sets
  app.get<{
    Params: { id: string; runId: string };
    Querystring: { limit?: string };
  }>(
    "/api/networks/:id/clusters/:runId/outliers",
    async (request) => {
      const { id } = request.params;
      const runId = parseInt(request.params.runId, 10);
      const limit = Math.min(parseInt(request.query.limit ?? "50", 10), 200);

      // Validate the run belongs to this network
      const [run] = await db
        .select({ id: clusterRuns.id })
        .from(clusterRuns)
        .where(and(eq(clusterRuns.id, runId), eq(clusterRuns.networkId, id)))
        .limit(1);
      if (!run) return { runId, totalTxsAnalyzed: 0, outliers: [] };

      // Total tx count for this run
      const [totalRow] = await db
        .select({ count: sql<number>`count(*)` })
        .from(clusterMemberships)
        .where(eq(clusterMemberships.runId, runId));
      const totalTxsAnalyzed = Number(totalRow.count);

      // Cluster sizes
      const clusterSizeRows = await db
        .select({
          clusterId: clusterMemberships.clusterId,
          size: sql<number>`count(*)`,
        })
        .from(clusterMemberships)
        .where(eq(clusterMemberships.runId, runId))
        .groupBy(clusterMemberships.clusterId);

      const clusterSizeMap = new Map<number, number>();
      for (const row of clusterSizeRows) {
        clusterSizeMap.set(row.clusterId, Number(row.size));
      }

      // All memberships with tx info
      const rows = await db
        .select({
          txId: clusterMemberships.txId,
          txHash: transactions.txHash,
          outlierScore: clusterMemberships.outlierScore,
          clusterId: clusterMemberships.clusterId,
          blockNumber: transactions.blockNumber,
          numNoteHashes: transactions.numNoteHashes,
          numNullifiers: transactions.numNullifiers,
          numPublicDataWrites: transactions.numPublicDataWrites,
          numPrivateLogs: transactions.numPrivateLogs,
          numPublicLogs: transactions.numPublicLogs,
        })
        .from(clusterMemberships)
        .innerJoin(transactions, eq(transactions.id, clusterMemberships.txId))
        .where(eq(clusterMemberships.runId, runId));

      // Enrich with privacy set size
      const outliers = rows.map((row) => ({
        ...row,
        // Outlier points each have a privacy set of 1
        clusterSize: row.clusterId === -1 ? 1 : (clusterSizeMap.get(row.clusterId) ?? 1),
        // Outlier score is only meaningful within a cluster
        outlierScore: row.clusterId === -1 ? null : row.outlierScore,
      }));

      return { runId, totalTxsAnalyzed, outliers };
    }
  );
}
