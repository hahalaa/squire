import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";

import { env } from "../env.js";
import * as schema from "./schema.js";

// Drizzle + Turso/libSQL. Pinned to the stable 0.4x line (see
// .claude/context/backend-engineer.md). Local dev / tests use a file: or
// :memory: url with no auth token; production points at Turso via
// TURSO_CONNECTION_URL + TURSO_AUTH_TOKEN.
const url = env.TURSO_CONNECTION_URL || "file:squire.db";

const client = createClient(
  env.TURSO_AUTH_TOKEN ? { url, authToken: env.TURSO_AUTH_TOKEN } : { url },
);

// ON DELETE CASCADE (repertoire_positions.parent_id) is only enforced when
// SQLite's foreign_keys PRAGMA is ON, which defaults OFF and is per-connection.
// libSQL serializes statements over the client's connection, so issuing this
// before any route query guarantees cascade works for the subtree-delete route.
void client.execute("PRAGMA foreign_keys = ON");

export const db = drizzle(client, { schema });
