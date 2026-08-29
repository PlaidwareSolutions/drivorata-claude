import { defineConfig } from "drizzle-kit";

// `drizzle-kit generate` only needs the schema; `push`/`migrate`/`studio`
// need DATABASE_URL and fail with a clear driver error when it is missing.
export default defineConfig({
  out: "./migrations",
  schema: "./shared/schema.ts",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "",
  },
});
