import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  vi,
} from "vitest";
import request from "supertest";

// Controllable auth state for the mocked Clerk guard. vi.hoisted runs before the
// vi.mock factory and before app.js is imported, so the factory can close over
// it without a TDZ error.
const { authState } = vi.hoisted(() => ({
  authState: { isAuthenticated: true, userId: "user_test" } as {
    isAuthenticated: boolean;
    userId: string | null;
  },
}));

// Replace @clerk/express so the real middleware chain runs but auth is
// controllable and no real Clerk network call happens.
vi.mock("@clerk/express", () => ({
  clerkMiddleware: () => (_req: unknown, _res: unknown, next: () => void) =>
    next(),
  getAuth: () => authState,
  clerkClient: {
    users: { getUser: vi.fn(), updateUserMetadata: vi.fn() },
  },
}));

// Imported after the mock so app.ts's @clerk/express import resolves to it.
const { app } = await import("../app.js");

const START_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
const TOKEN = "test-lichess-token"; // matches server/test/env-setup.ts

// A masters-endpoint-shaped success body.
const MASTERS_BODY = {
  white: 100,
  draws: 50,
  black: 40,
  moves: [{ uci: "e2e4", san: "e4", white: 60, draws: 30, black: 20 }],
  opening: { eco: "B00", name: "King's Pawn" },
};

function okResponse(body: unknown): Response {
  return {
    ok: true,
    status: 200,
    headers: new Headers(),
    json: async () => body,
  } as unknown as Response;
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  authState.isAuthenticated = true;
  authState.userId = "user_test";
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("GET /api/opening", () => {
  it("401s when unauthenticated and never calls upstream", async () => {
    authState.isAuthenticated = false;
    const res = await request(app).get("/api/opening").query({ fen: START_FEN });
    expect(res.status).toBe(401);
    expect(res.body).toEqual({
      data: null,
      error: "Unauthenticated",
      meta: null,
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("400s on a malformed FEN and never calls upstream", async () => {
    const res = await request(app)
      .get("/api/opening")
      .query({ fen: "not-a-fen" });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Invalid FEN");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("proxies with the Bearer token and returns the upstream JSON verbatim", async () => {
    fetchMock.mockResolvedValue(okResponse(MASTERS_BODY));
    const res = await request(app)
      .get("/api/opening")
      .query({ fen: START_FEN });

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual(MASTERS_BODY);
    expect(res.body.error).toBeNull();
    expect(res.body.meta).toEqual({ cached: false });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toContain("explorer.lichess.ovh/masters");
    expect(url).toContain("fen=");
    expect(init.headers.Authorization).toBe(`Bearer ${TOKEN}`);
  });

  it("never leaks the LICHESS_TOKEN in the response", async () => {
    fetchMock.mockResolvedValue(okResponse(MASTERS_BODY));
    const res = await request(app)
      .get("/api/opening")
      .query({ fen: "4k3/8/8/8/8/8/8/4K3 w - - 0 1" });
    expect(JSON.stringify(res.body)).not.toContain(TOKEN);
  });

  it("serves the second identical request from cache (one upstream call)", async () => {
    fetchMock.mockResolvedValue(okResponse(MASTERS_BODY));
    const fen = "rnbqkbnr/pppp1ppp/8/4p3/8/8/PPPPPPPP/RNBQKBNR w KQkq e6 0 2";

    const first = await request(app).get("/api/opening").query({ fen });
    expect(first.body.meta).toEqual({ cached: false });

    const second = await request(app).get("/api/opening").query({ fen });
    expect(second.body.meta).toEqual({ cached: true });
    expect(second.body.data).toEqual(MASTERS_BODY);

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("treats a transposition (different move counters) as the same cache entry", async () => {
    fetchMock.mockResolvedValue(okResponse(MASTERS_BODY));
    const a =
      "r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq - 2 3";
    const b =
      "r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq - 8 12";

    await request(app).get("/api/opening").query({ fen: a });
    const second = await request(app).get("/api/opening").query({ fen: b });

    expect(second.body.meta).toEqual({ cached: true });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("passes an upstream 429 through with its Retry-After header", async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 429,
      headers: new Headers({ "retry-after": "60" }),
      json: async () => ({}),
    } as unknown as Response);

    const res = await request(app)
      .get("/api/opening")
      .query({ fen: "4k3/8/8/8/8/8/8/4KR2 w - - 0 1" });

    expect(res.status).toBe(429);
    expect(res.headers["retry-after"]).toBe("60");
    expect(res.body.error.code).toBe("opening_explorer_rate_limited");
    expect(res.body.data).toBeNull();
  });

  it("returns the graceful-fallback shape (200 + error.code) when upstream fails", async () => {
    fetchMock.mockRejectedValue(new Error("network down"));

    const res = await request(app)
      .get("/api/opening")
      .query({ fen: "4k3/8/8/8/8/8/8/3QK3 w - - 0 1" });

    expect(res.status).toBe(200);
    expect(res.body.data).toBeNull();
    expect(res.body.error.code).toBe("opening_explorer_unavailable");
    expect(res.body.meta).toEqual({ cached: false });
  });
});
