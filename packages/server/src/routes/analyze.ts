import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { FastifyInstance } from "fastify";
import type { Db } from "@clustec/common";

const execFileAsync = promisify(execFile);

// Resolve monorepo root: server lives at packages/server/src/routes/
const __dirname = dirname(fileURLToPath(import.meta.url));
const MONOREPO_ROOT = resolve(__dirname, "..", "..", "..", "..");

interface AnalysisConfig {
  minClusterSize: number;
  nNeighbors: number;
  minDist: number;
  dimensions: number;
}

const DEFAULT_CONFIG: AnalysisConfig = {
  minClusterSize: 5,
  nNeighbors: 15,
  minDist: 0.1,
  dimensions: 3,
};

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
      String(config.dimensions),
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

export function registerAnalyzeRoutes(app: FastifyInstance, _db: Db) {
  // GET endpoint to check last analysis status (no mutation)
  app.get<{ Params: { id: string } }>(
    "/api/networks/:id/analyze/status",
    async () => {
      return { scheduled: true, intervalMinutes: 10 };
    }
  );
}

/**
 * Start a periodic analysis scheduler.
 * Runs every `intervalMs` for each network that has indexed transactions.
 */
export function startAnalysisScheduler(
  app: FastifyInstance,
  networks: string[],
  intervalMs = 10 * 60 * 1000
): NodeJS.Timeout {
  const timer = setInterval(async () => {
    for (const networkId of networks) {
      try {
        app.log.info({ networkId }, "Scheduled analysis starting");
        await runAnalysis(networkId, DEFAULT_CONFIG, app.log);
      } catch (err) {
        app.log.error({ err, networkId }, "Scheduled analysis failed");
      }
    }
  }, intervalMs);

  // Run once immediately on startup (after a short delay to let indexer catch up)
  setTimeout(async () => {
    for (const networkId of networks) {
      try {
        app.log.info({ networkId }, "Initial analysis starting");
        await runAnalysis(networkId, DEFAULT_CONFIG, app.log);
      } catch (err) {
        app.log.error({ err, networkId }, "Initial analysis failed");
      }
    }
  }, 5_000);

  return timer;
}
