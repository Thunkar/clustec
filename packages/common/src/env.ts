import { config } from "dotenv";
import { existsSync } from "node:fs";
import { resolve, dirname } from "node:path";

/**
 * Load .env from the monorepo root, searching upward from cwd.
 * No-op if DATABASE_URL is already set (e.g. in Docker via environment).
 */
export function loadEnv(): void {
  if (process.env.DATABASE_URL) return;

  let dir = process.cwd();
  while (dir !== dirname(dir)) {
    const envPath = resolve(dir, ".env");
    if (existsSync(envPath)) {
      config({ path: envPath });
      return;
    }
    dir = dirname(dir);
  }
}
