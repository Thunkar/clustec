import { defineConfig } from "drizzle-kit";
import { loadEnv } from "./src/env.js";
loadEnv();

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
});
