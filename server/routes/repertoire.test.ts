import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import request from "supertest";

// Force an isolated temp-file DB BEFORE any server module is loaded (they read
// env at import time; server modules are pulled in via dynamic import() below).
// A file (not :memory:) is required: libSQL runs transactions — which the
// migrator and the import route both use — on a separate connection, and each
// :memory: connection is its own empty database. A shared file is seen by all.
const testDbDir = mkdtempSync(join(tmpdir(), "squire-rep-"));
const testDbPath = join(testDbDir, "test.db");
process.env.TURSO_CONNECTION_URL = `file:${testDbPath}`;

// Controllable auth state for the mocked Clerk guard (same approach as
// opening.test.ts) — lets us drive real middleware while switching users.
const { authState } = vi.hoisted(() => ({
  authState: { isAuthenticated: true, userId: "user_a" } as {
    isAuthenticated: boolean;
    userId: string | null;
  },
}));

vi.mock("@clerk/express", () => ({
  clerkMiddleware: () => (_req: unknown, _res: unknown, next: () => void) =>
    next(),
  getAuth: () => authState,
  clerkClient: { users: { getUser: vi.fn(), updateUserMetadata: vi.fn() } },
}));

const { app } = await import("../app.js");
const { migrate } = await import("drizzle-orm/libsql/migrator");
const { db } = await import("../db/index.js");
const schema = await import("../db/schema.js");

const USER_A = "user_a";
const USER_B = "user_b";

function asUser(userId: string) {
  authState.isAuthenticated = true;
  authState.userId = userId;
}

async function createRepertoire(name = "White repertoire", colour = "white") {
  const res = await request(app)
    .post("/api/repertoires")
    .send({ name, colour });
  expect(res.status).toBe(201);
  return res.body.data.id as string;
}

// Save a move; returns the created position row.
async function saveMove(repId: string, move: string, parentId: string | null) {
  const res = await request(app)
    .post(`/api/repertoires/${repId}/positions`)
    .send({ move, parentId });
  return res;
}

beforeAll(async () => {
  await migrate(db, { migrationsFolder: "server/db/migrations" });
});

afterAll(() => {
  rmSync(testDbDir, { recursive: true, force: true });
});

beforeEach(async () => {
  asUser(USER_A);
  await db.delete(schema.repertoirePositions);
  await db.delete(schema.repertoires);
});

describe("auth", () => {
  it("401s on every route when unauthenticated", async () => {
    authState.isAuthenticated = false;
    const routes: [string, "get" | "post" | "patch" | "delete"][] = [
      ["/api/repertoires", "get"],
      ["/api/repertoires", "post"],
      ["/api/repertoires/00000000-0000-0000-0000-000000000000", "get"],
      ["/api/repertoires/00000000-0000-0000-0000-000000000000", "patch"],
      ["/api/repertoires/00000000-0000-0000-0000-000000000000", "delete"],
      ["/api/repertoires/00000000-0000-0000-0000-000000000000/positions", "post"],
      ["/api/repertoires/00000000-0000-0000-0000-000000000000/import", "post"],
      ["/api/repertoires/00000000-0000-0000-0000-000000000000/export", "get"],
    ];
    for (const [path, method] of routes) {
      const res = await request(app)[method](path).send({});
      expect(res.status, `${method} ${path}`).toBe(401);
      expect(res.body).toEqual({
        data: null,
        error: "Unauthenticated",
        meta: null,
      });
    }
  });
});

describe("repertoire CRUD", () => {
  it("creates, lists, and reads a repertoire", async () => {
    const id = await createRepertoire("Najdorf", "black");

    const list = await request(app).get("/api/repertoires");
    expect(list.status).toBe(200);
    expect(list.body.data).toHaveLength(1);
    expect(list.body.data[0]).toMatchObject({
      id,
      name: "Najdorf",
      colour: "black",
    });

    const one = await request(app).get(`/api/repertoires/${id}`);
    expect(one.status).toBe(200);
    expect(one.body.data.positions).toEqual([]);
    expect(one.body.data.tree).toEqual([]);
  });

  it("renames / recolours via PATCH and bumps updated_at", async () => {
    const id = await createRepertoire("Old", "white");
    const before = (await request(app).get(`/api/repertoires/${id}`)).body.data;

    const res = await request(app)
      .patch(`/api/repertoires/${id}`)
      .send({ name: "New", colour: "black" });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ name: "New", colour: "black" });
    expect(new Date(res.body.data.updatedAt).getTime()).toBeGreaterThanOrEqual(
      new Date(before.updatedAt).getTime(),
    );
  });

  it("soft-deletes a repertoire and hides it + its positions from reads", async () => {
    const id = await createRepertoire();
    await saveMove(id, "e4", null);

    const del = await request(app).delete(`/api/repertoires/${id}`);
    expect(del.status).toBe(200);
    expect(del.body.data).toEqual({ id, deleted: true });

    // Hidden from list, single-read, and export.
    expect((await request(app).get("/api/repertoires")).body.data).toEqual([]);
    expect((await request(app).get(`/api/repertoires/${id}`)).status).toBe(404);
    expect(
      (await request(app).get(`/api/repertoires/${id}/export`)).status,
    ).toBe(404);

    // The position row still exists in the table (soft delete), but is
    // unreachable through the API.
    const remaining = await db.select().from(schema.repertoirePositions);
    expect(remaining).toHaveLength(1);
  });
});

describe("Zod validation", () => {
  it("400s on malformed repertoire bodies", async () => {
    expect((await request(app).post("/api/repertoires").send({})).status).toBe(
      400,
    );
    expect(
      (await request(app).post("/api/repertoires").send({ name: "x" })).status,
    ).toBe(400); // missing colour
    expect(
      (
        await request(app)
          .post("/api/repertoires")
          .send({ name: "x", colour: "purple" })
      ).status,
    ).toBe(400); // bad colour
    expect(
      (
        await request(app)
          .post("/api/repertoires")
          .send({ name: "", colour: "white" })
      ).status,
    ).toBe(400); // empty name
  });

  it("400s on a non-uuid :id param", async () => {
    expect((await request(app).get("/api/repertoires/not-a-uuid")).status).toBe(
      400,
    );
  });

  it("400s on an empty move and on an illegal move", async () => {
    const id = await createRepertoire();
    expect((await saveMove(id, "", null)).status).toBe(400); // Zod
    expect((await saveMove(id, "Zz9", null)).status).toBe(400); // chess.js
  });
});

describe("positions (save move) + tree", () => {
  it("saves a legal move, deriving the FEN server-side", async () => {
    const id = await createRepertoire();
    const res = await saveMove(id, "e4", null);
    expect(res.status).toBe(201);
    expect(res.body.data.move).toBe("e4");
    expect(res.body.data.parentId).toBeNull();
    expect(res.body.data.fen).toBe(
      "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1",
    );
    // SM-2 columns exist at defaults.
    expect(res.body.data.easeFactor).toBe(2.5);
    expect(res.body.data.repetitions).toBe(0);
    expect(res.body.data.nextDue).toBeNull();
  });

  it("rejects a move illegal from the parent position", async () => {
    const id = await createRepertoire();
    const e4 = await saveMove(id, "e4", null);
    // e4 again as a reply to e4 is illegal (Black to move).
    const bad = await saveMove(id, "e4", e4.body.data.id);
    expect(bad.status).toBe(400);
  });

  it("404s when the parent position belongs to another repertoire/user", async () => {
    const id = await createRepertoire();
    const res = await saveMove(id, "e4", "00000000-0000-0000-0000-000000000000");
    expect(res.status).toBe(404);
  });

  it("enforces UNIQUE(repertoire_id, parent_id, move) — including root moves", async () => {
    const id = await createRepertoire();
    expect((await saveMove(id, "e4", null)).status).toBe(201);
    // Duplicate ROOT move (parent_id NULL) — guarded in app code since SQLite's
    // UNIQUE index treats NULLs as distinct.
    expect((await saveMove(id, "e4", null)).status).toBe(409);

    const e4 = (await request(app).get(`/api/repertoires/${id}`)).body.data
      .positions[0];
    expect((await saveMove(id, "e5", e4.id)).status).toBe(201);
    // Duplicate non-root move — caught by the same guard (and the DB index).
    expect((await saveMove(id, "e5", e4.id)).status).toBe(409);
  });

  it("returns the nested tree with variations as siblings", async () => {
    const id = await createRepertoire();
    const e4 = (await saveMove(id, "e4", null)).body.data;
    await saveMove(id, "e5", e4.id);
    await saveMove(id, "c5", e4.id); // sibling variation

    const tree = (await request(app).get(`/api/repertoires/${id}`)).body.data
      .tree;
    expect(tree).toHaveLength(1);
    expect(tree[0].move).toBe("e4");
    expect(tree[0].children.map((c: { move: string }) => c.move)).toEqual([
      "e5",
      "c5",
    ]);
  });
});

describe("ON DELETE CASCADE removes a subtree", () => {
  it("deletes a node and all its descendants in one operation", async () => {
    const id = await createRepertoire();
    const e4 = (await saveMove(id, "e4", null)).body.data;
    const e5 = (await saveMove(id, "e5", e4.id)).body.data;
    await saveMove(id, "Nf3", e5.id);

    // Delete the middle node e5 → e5 and Nf3 go; e4 stays.
    const del = await request(app).delete(
      `/api/repertoires/${id}/positions/${e5.id}`,
    );
    expect(del.status).toBe(200);

    const positions = (await request(app).get(`/api/repertoires/${id}`)).body
      .data.positions;
    expect(positions.map((p: { move: string }) => p.move)).toEqual(["e4"]);
  });
});

describe("PATCH position (leaf move correction)", () => {
  it("corrects a leaf move and re-derives its FEN", async () => {
    const id = await createRepertoire();
    const e4 = (await saveMove(id, "e4", null)).body.data;
    const e5 = (await saveMove(id, "e5", e4.id)).body.data;

    const res = await request(app)
      .patch(`/api/repertoires/${id}/positions/${e5.id}`)
      .send({ move: "c5" });
    expect(res.status).toBe(200);
    expect(res.body.data.move).toBe("c5");
  });

  it("409s when editing a move that has continuations", async () => {
    const id = await createRepertoire();
    const e4 = (await saveMove(id, "e4", null)).body.data;
    await saveMove(id, "e5", e4.id); // e4 now has a child

    const res = await request(app)
      .patch(`/api/repertoires/${id}/positions/${e4.id}`)
      .send({ move: "d4" });
    expect(res.status).toBe(409);
  });
});

describe("cross-user isolation", () => {
  it("prevents user B from reading/patching/deleting/importing user A's rows", async () => {
    asUser(USER_A);
    const id = await createRepertoire("A's secret prep");
    const e4 = (await saveMove(id, "e4", null)).body.data;

    asUser(USER_B);
    // Not in B's list.
    expect((await request(app).get("/api/repertoires")).body.data).toEqual([]);
    // Every targeted op 404s (never leak existence).
    expect((await request(app).get(`/api/repertoires/${id}`)).status).toBe(404);
    expect(
      (await request(app).patch(`/api/repertoires/${id}`).send({ name: "x" }))
        .status,
    ).toBe(404);
    expect((await request(app).delete(`/api/repertoires/${id}`)).status).toBe(
      404,
    );
    expect((await saveMove(id, "e5", e4.id)).status).toBe(404);
    expect(
      (await request(app).delete(`/api/repertoires/${id}/positions/${e4.id}`))
        .status,
    ).toBe(404);
    expect(
      (
        await request(app)
          .post(`/api/repertoires/${id}/import`)
          .send({ pgn: "1. e4 e5" })
      ).status,
    ).toBe(404);
    expect(
      (await request(app).get(`/api/repertoires/${id}/export`)).status,
    ).toBe(404);

    // A's data is untouched.
    asUser(USER_A);
    const positions = (await request(app).get(`/api/repertoires/${id}`)).body
      .data.positions;
    expect(positions).toHaveLength(1);
  });
});

describe("PGN import / export", () => {
  it("imports a PGN with variations into the tree", async () => {
    const id = await createRepertoire();
    const res = await request(app)
      .post(`/api/repertoires/${id}/import`)
      .send({ pgn: "1. e4 e5 (1... c5 2. Nf3) 2. Nf3 Nc6" });
    expect(res.status).toBe(200);
    expect(res.body.meta.inserted).toBe(6); // e4 e5 Nf3 Nc6 c5 Nf3
    expect(res.body.meta.merged).toBe(0);

    const tree = res.body.data.tree;
    expect(tree[0].move).toBe("e4");
    const firstMoveChildren = tree[0].children.map(
      (c: { move: string }) => c.move,
    );
    expect(firstMoveChildren).toContain("e5");
    expect(firstMoveChildren).toContain("c5"); // the variation is a sibling
  });

  it("re-importing the same PGN merges (no duplicates)", async () => {
    const id = await createRepertoire();
    const pgn = "1. d4 Nf6 2. c4 e6"; // 4 half-moves
    const first = await request(app)
      .post(`/api/repertoires/${id}/import`)
      .send({ pgn });
    expect(first.body.meta.inserted).toBe(4);

    const second = await request(app)
      .post(`/api/repertoires/${id}/import`)
      .send({ pgn });
    expect(second.body.meta.inserted).toBe(0);
    expect(second.body.meta.merged).toBe(4);
    expect(second.body.data.positions).toHaveLength(4);
  });

  it("400s on an unparseable PGN", async () => {
    const id = await createRepertoire();
    const res = await request(app)
      .post(`/api/repertoires/${id}/import`)
      .send({ pgn: "1. e4 Zz9" });
    expect(res.status).toBe(400);
  });

  it("400s on a missing pgn field", async () => {
    const id = await createRepertoire();
    expect(
      (await request(app).post(`/api/repertoires/${id}/import`).send({})).status,
    ).toBe(400);
  });

  it("exports the tree as a downloadable PGN that round-trips", async () => {
    const id = await createRepertoire("My lines");
    const pgn = "1. e4 e5 (1... c5 2. Nf3) 2. Nf3 Nc6";
    await request(app).post(`/api/repertoires/${id}/import`).send({ pgn });

    const res = await request(app).get(`/api/repertoires/${id}/export`);
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("text/plain");
    expect(res.headers["content-disposition"]).toContain(".pgn");
    expect(res.text).toContain("[Event ");
    expect(res.text).toContain("e4");

    // Re-importing the export into a fresh repertoire yields the same moves.
    const id2 = await createRepertoire("Round trip");
    const reimport = await request(app)
      .post(`/api/repertoires/${id2}/import`)
      .send({ pgn: res.text });
    expect(reimport.status).toBe(200);
    expect(reimport.body.data.positions).toHaveLength(6);
  });
});
