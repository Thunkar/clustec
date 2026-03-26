import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { eq } from "drizzle-orm";
import * as Sentry from "@sentry/node";
import type { FastifyInstance } from "fastify";
import { type Db, analysisConfig } from "@clustec/common";
import { requireAdmin } from "../middleware/auth.ts";

const execFileAsync = promisify(execFile);

// Resolve monorepo root: server lives at packages/server/src/routes/
const __dirname = dirname(fileURLToPath(import.meta.url));
const MONOREPO_ROOT = resolve(__dirname, "..", "..", "..", "..");

interface AnalysisConfig {
  minClusterSize: number;
  nNeighbors: number;
  minDist: number;
}

const DEFAULT_CONFIG: AnalysisConfig = {
  minClusterSize: 5,
  nNeighbors: 15,
  minDist: 0.1,
};

async function getConfig(db: Db, networkId: string): Promise<AnalysisConfig> {
  const [row] = await db
    .select()
    .from(analysisConfig)
    .where(eq(analysisConfig.networkId, networkId));
  return row
    ? { minClusterSize: row.minClusterSize, nNeighbors: row.nNeighbors, minDist: row.minDist }
    : { ...DEFAULT_CONFIG };
}

async function persistConfig(db: Db, networkId: string, cfg: AnalysisConfig): Promise<void> {
  await db
    .insert(analysisConfig)
    .values({ networkId, ...cfg })
    .onConflictDoUpdate({
      target: analysisConfig.networkId,
      set: { minClusterSize: cfg.minClusterSize, nNeighbors: cfg.nNeighbors, minDist: cfg.minDist, updatedAt: new Date() },
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

  const { stdout, stderr } = await execFileAsync(
    "uv",
    [
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
    ],
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

type ConfigBody = { minClusterSize?: number; nNeighbors?: number; minDist?: number };

export function registerAnalyzeRoutes(app: FastifyInstance, db: Db) {
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
      runningNetworks.add(networkId);
      const start = Date.now();
      try {
        const config = await getConfig(db, networkId);
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
