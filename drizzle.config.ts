import "dotenv/config";
import { defineConfig } from "drizzle-kit";

// drizzle-kit does NOT auto-load .env — the dotenv import above is required or
// the credentials read as undefined (see .claude/context/backend-engineer.md).
//
// Workflow is `drizzle-kit generate` then `drizzle-kit migrate`, never `push`.
const url = process.env.TURSO_CONNECTION_URL || "file:squire.db";
const isLocalFile = url.startsWith("file:");

export default defineConfig({
  dialect: "turso",
  schema: "./server/db/schema.ts",
  out: "./server/db/migrations",
  dbCredentials: {
    url,
    // drizzle-kit's 'turso' dialect requires a non-empty authToken even for a
    // local file: url, which libSQL ignores. Fall back to a placeholder for
    // local files so `drizzle-kit migrate` runs in dev; production supplies the
    // real token via TURSO_AUTH_TOKEN.
    authToken: process.env.TURSO_AUTH_TOKEN || (isLocalFile ? "local" : undefined),
  },
});
