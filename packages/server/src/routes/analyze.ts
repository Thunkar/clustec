import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { eq } from "drizzle-orm";
import * as Sentry from "@sentry/node";
import type { FastifyInstance } from "fastify";
import { type Db, analysisConfig, featureVectors, transactions } from "@clustec/common";
import { sql } from "drizzle-orm";
import { requireAdmin } from "../middleware/auth.ts";

const execFileAsync = promisify(execFile);

// Resolve monorepo root: server lives at packages/server/src/routes/
const __dirname = dirname(fileURLToPath(import.meta.url));
const MONOREPO_ROOT = resolve(__dirname, "..", "..", "..", "..");

export const FEATURE_NAMES = [
  "numNoteHashes",
  "numNullifiers",
  "numL2ToL1Msgs",
  "numPrivateLogs",
  "numContractClassLogs",
  "numPublicLogs",
  "gasLimitDa",
  "gasLimitL2",
  "maxFeePerDaGas",
  "maxFeePerL2Gas",
  "numSetupCalls",
  "numAppCalls",
  "hasTeardown",
  "totalPublicCalldataSize",
  "expirationDelta",
  "feePayer",
] as const;

export type FeatureWeights = Record<string, number>;

export const DEFAULT_WEIGHTS: FeatureWeights = Object.fromEntries(
  FEATURE_NAMES.map((name) => [
    name,
    name === "maxFeePerDaGas" || name === "maxFeePerL2Gas" ? 0.25 : 1.0,
  ]),
);

export type NormalizationMode = "minmax" | "rank";

interface AnalysisConfig {
  minClusterSize: number;
  nNeighbors: number;
  minDist: number;
  weights: FeatureWeights;
  normalization: NormalizationMode;
}

const DEFAULT_CONFIG: AnalysisConfig = {
  minClusterSize: 5,
  nNeighbors: 15,
  minDist: 0.1,
  weights: DEFAULT_WEIGHTS,
  normalization: "minmax",
};

async function getConfig(db: Db, networkId: string): Promise<AnalysisConfig> {
  const [row] = await db
    .select()
    .from(analysisConfig)
    .where(eq(analysisConfig.networkId, networkId));
  return row
    ? {
        minClusterSize: row.minClusterSize,
        nNeighbors: row.nNeighbors,
        minDist: row.minDist,
        weights: (row.weights as FeatureWeights | null) ?? DEFAULT_WEIGHTS,
        normalization: (row.normalization as NormalizationMode) ?? "minmax",
      }
    : { ...DEFAULT_CONFIG };
}

async function persistConfig(db: Db, networkId: string, cfg: AnalysisConfig): Promise<void> {
  await db
    .insert(analysisConfig)
    .values({ networkId, ...cfg })
    .onConflictDoUpdate({
      target: analysisConfig.networkId,
      set: {
        minClusterSize: cfg.minClusterSize,
        nNeighbors: cfg.nNeighbors,
        minDist: cfg.minDist,
        weights: cfg.weights,
        normalization: cfg.normalization,
        updatedAt: new Date(),
      },
    });
}

async function runAnalysis(
  networkId: string,
  config: AnalysisConfig,
  log: { info: (obj: object, msg: string) => void; error: (obj: object, msg: string) => void }
): Promise<{ status: string; output: string }> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL not configured");
  }

  const args = [
    "run",
    "--project",
    resolve(MONOREPO_ROOT, "packages/analyzer"),
    "python",
    "-m",
    "analyzer",
    networkId,
    "--min-cluster-size",
    String(config.minClusterSize),
    "--n-neighbors",
    String(config.nNeighbors),
    "--min-dist",
    String(config.minDist),
    "--dimensions",
    "3",
  ];
  if (config.weights) {
    args.push("--weights", JSON.stringify(config.weights));
  }
  if (config.normalization && config.normalization !== "minmax") {
    args.push("--normalization", config.normalization);
  }

  const { stdout, stderr } = await execFileAsync(
    "uv",
    args,
    {
      env: { ...process.env, DATABASE_URL: databaseUrl },
      cwd: MONOREPO_ROOT,
      timeout: 300_000,
    }
  );

  log.info({ stdout, stderr }, "Analysis complete");
  return { status: "complete", output: stdout.trim() };
}

// Guard against concurrent trigger runs per network
const runningNetworks = new Set<string>();

type ConfigBody = { minClusterSize?: number; nNeighbors?: number; minDist?: number; weights?: FeatureWeights; normalization?: NormalizationMode };

export function registerAnalyzeRoutes(app: FastifyInstance, db: Db) {
  // GET feature stats for the admin UI
  app.get<{ Params: { id: string } }>(
    "/api/networks/:id/analyze/feature-stats",
    async (request) => {
      const { id } = request.params;

      const rows = await db
        .select({ vector: featureVectors.vector })
        .from(featureVectors)
        .innerJoin(transactions, eq(transactions.id, featureVectors.txId))
        .where(eq(transactions.networkId, id));

      if (rows.length === 0) return { totalVectors: 0, features: [] };

      const vectors = rows.map((r) => r.vector as (number | string)[]);
      const stats = FEATURE_NAMES.map((name, i) => {
        if (i === 14) {
          // Categorical — count unique values
          const vals = vectors.map((v) => String(v[i]));
          const unique = new Set(vals);
          const counts = new Map<string, number>();
          for (const v of vals) counts.set(v, (counts.get(v) ?? 0) + 1);
          const top = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
          return {
            name,
            type: "categorical" as const,
            unique: unique.size,
            topValues: top.map(([value, count]) => ({ value: value.slice(0, 10) + "…", count, pct: +(count / vectors.length * 100).toFixed(1) })),
          };
        }
        const vals = vectors.map((v) => Number(v[i]));
        const sorted = [...vals].sort((a, b) => a - b);
        const unique = new Set(vals).size;
        const sum = vals.reduce((a, b) => a + b, 0);
        const mean = sum / vals.length;
        const std = Math.sqrt(vals.reduce((a, b) => a + (b - mean) ** 2, 0) / vals.length);
        const p = (pct: number) => sorted[Math.min(Math.floor(pct / 100 * sorted.length), sorted.length - 1)];
        // Concentration: % of txs with the most common value
        const counts = new Map<number, number>();
        for (const v of vals) counts.set(v, (counts.get(v) ?? 0) + 1);
        const maxCount = Math.max(...counts.values());
        return {
          name,
          type: "numeric" as const,
          unique,
          min: sorted[0],
          max: sorted[sorted.length - 1],
          mean: +mean.toFixed(4),
          std: +std.toFixed(4),
          p25: p(25),
          p50: p(50),
          p75: p(75),
          p95: p(95),
          dominantPct: +(maxCount / vals.length * 100).toFixed(1),
        };
      });

      return { totalVectors: vectors.length, features: stats };
    },
  );

  // GET endpoint to check last analysis status and current config
  app.get<{ Params: { id: string } }>(
    "/api/networks/:id/analyze/status",
    async (request) => {
      const config = await getConfig(db, request.params.id);
      return { scheduled: true, intervalMinutes: 10, config, running: runningNetworks.has(request.params.id) };
    }
  );

  // POST /config — save config for scheduler (no immediate run)
  app.post<{ Params: { id: string }; Body: ConfigBody }>(
    "/api/networks/:id/analyze/config",
    { preHandler: [requireAdmin] },
    async (request) => {
      const { id } = request.params;
      const current = await getConfig(db, id);
      const next: AnalysisConfig = {
        minClusterSize: request.body.minClusterSize ?? current.minClusterSize,
        nNeighbors: request.body.nNeighbors ?? current.nNeighbors,
        minDist: request.body.minDist ?? current.minDist,
        weights: request.body.weights ?? current.weights,
        normalization: request.body.normalization ?? current.normalization,
      };
      await persistConfig(db, id, next);
      return { config: next };
    }
  );

  // DELETE /config — revert to defaults
  app.delete<{ Params: { id: string } }>(
    "/api/networks/:id/analyze/config",
    { preHandler: [requireAdmin] },
    async (request) => {
      const { id } = request.params;
      await persistConfig(db, id, { ...DEFAULT_CONFIG });
      return { config: DEFAULT_CONFIG };
    }
  );

  // POST /trigger — run analysis on demand (admin only), optionally overriding params
  app.post<{ Params: { id: string }; Body: ConfigBody }>(
    "/api/networks/:id/analyze/trigger",
    { preHandler: [requireAdmin] },
    async (request, reply) => {
      const { id } = request.params;

      if (runningNetworks.has(id)) {
        reply.status(409).send({ error: "Analysis already running for this network" });
        return;
      }

      // Merge any param overrides with current config and persist
      const current = await getConfig(db, id);
      const next: AnalysisConfig = {
        minClusterSize: request.body.minClusterSize ?? current.minClusterSize,
        nNeighbors: request.body.nNeighbors ?? current.nNeighbors,
        minDist: request.body.minDist ?? current.minDist,
        weights: request.body.weights ?? current.weights,
        normalization: request.body.normalization ?? current.normalization,
      };
      await persistConfig(db, id, next);

      runningNetworks.add(id);
      try {
        const result = await runAnalysis(id, next, app.log);
        return result;
      } catch (err: unknown) {
        const message = String(err);
        const stderr = (err as { stderr?: string }).stderr ?? "";
        const stdout = (err as { stdout?: string }).stdout ?? "";
        reply.status(500).send({ error: message, stderr, stdout });
      } finally {
        runningNetworks.delete(id);
      }
    }
  );
}

/**
 * Start a periodic analysis scheduler.
 * Loads config from DB for each network before each run.
 */
export function startAnalysisScheduler(
  app: FastifyInstance,
  db: Db,
  networks: string[],
  intervalMs = 10 * 60 * 1000
): NodeJS.Timeout {
  const SLOW_THRESHOLD_MS = 120_000; // 2 minutes

  const runAll = async (label: string) => {
    for (const networkId of networks) {
      if (runningNetworks.has(networkId)) {
        app.log.info({ networkId }, `${label} skipped — already running`);
        continue;
      }
      // Skip analysis if not enough txs with feature vectors
      const config = await getConfig(db, networkId);
      const [{ count: fvCount }] = await db
        .select({ count: sql<number>`count(*)` })
        .from(featureVectors)
        .innerJoin(transactions, eq(transactions.id, featureVectors.txId))
        .where(eq(transactions.networkId, networkId));

      if (Number(fvCount) < config.minClusterSize) {
        app.log.info({ networkId, fvCount, minClusterSize: config.minClusterSize }, `${label} skipped — not enough txs`);
        continue;
      }

      runningNetworks.add(networkId);
      const start = Date.now();
      try {
        app.log.info({ networkId, config }, `${label} starting`);
        await runAnalysis(networkId, config, app.log);
        const durationMs = Date.now() - start;
        app.log.info({ networkId, durationMs }, `${label} completed`);
        if (durationMs > SLOW_THRESHOLD_MS) {
          Sentry.captureMessage(`Slow analysis: ${networkId} took ${(durationMs / 1000).toFixed(1)}s`, {
            level: "warning",
            tags: { networkId, component: "analyzer" },
            extra: { durationMs, label, thresholdMs: SLOW_THRESHOLD_MS },
          });
        }
      } catch (err) {
        app.log.error({ err, networkId, durationMs: Date.now() - start }, `${label} failed`);
        Sentry.captureException(err, {
          tags: { networkId, component: "analyzer" },
          extra: { label, durationMs: Date.now() - start },
        });
      } finally {
        runningNetworks.delete(networkId);
      }
    }
  };

  const timer = setInterval(() => runAll("Scheduled analysis"), intervalMs);

  // Run once immediately on startup (after a short delay to let indexer catch up)
  setTimeout(() => runAll("Initial analysis"), 5_000);

  return timer;
}
