import { loadEnv } from "../env.js";
loadEnv();
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { createDb } from "./client.js";

async function main() {
  const db = createDb();
  console.log("Running migrations...");
  const migrationsFolder = new URL("../../drizzle", import.meta.url).pathname;
  await migrate(db, { migrationsFolder });
  console.log("Migrations complete.");
  process.exit(0);
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
