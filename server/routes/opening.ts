import { Router } from "express";
import rateLimit from "express-rate-limit";

import { env } from "../env.js";
import { logger } from "../logger.js";
import { createCache } from "../cache.js";
import { requireUser } from "../middleware/requireUser.js";
import {
  openingQuerySchema,
  normalizeFenForCache,
} from "../validation/opening.js";

export const openingRouter = Router();

const MASTERS_URL = "https://explorer.lichess.ovh/masters";

// Abort an upstream call that hangs so it can't wedge the serialized queue
// (below) and starve every waiting request. On abort we fall through to the
// graceful-fallback path, same as any other upstream failure.
const UPSTREAM_TIMEOUT_MS = 6000;

// Cache config (CHESS-008 resolved decision): 7-day TTL, 500-entry cap. The
// payload is statistical (master-game counts + W/D/L%) and Lichess ingests
// master games in large ~annual batches, so a week is nowhere near stale; the
// `max` cap — not the TTL — is what bounds memory. Keyed on the NORMALIZED FEN
// (halfmove/fullmove stripped) so transpositions share one entry.
const openingCache = createCache<object>({
  ttl: 1000 * 60 * 60 * 24 * 7,
  max: 500,
});

// Second, coarser rate limiter — in ADDITION to the app-level 100/min-per-IP
// limiter, not instead of it. The per-IP limiter can't see the thing actually
// at risk: one shared LICHESS_TOKEN's global upstream budget, which many users
// on different IPs can collectively exhaust while each staying under 100/min.
// Lichess publishes no numeric per-minute budget for the masters endpoint (only
// "one request at a time" + "wait 60s on a 429"), so this is a deliberately
// loose runaway backstop, NOT the primary control — the serialized queue below
// plus 429/Retry-After passthrough is what actually models Lichess's guidance.
// Keyed globally (constant key), and skipped on cache hits so only requests
// that will really touch the shared budget count against it.
const openingBackstopLimiter = rateLimit({
  windowMs: 60_000,
  limit: 60,
  keyGenerator: () => "opening-explorer-global",
  skip: (req) => {
    const fen = req.query.fen;
    if (typeof fen !== "string") return true; // will 400; never reaches upstream
    const key = normalizeFenForCache(fen);
    if (!key) return true;
    return openingCache.has(key); // cache hits don't spend the shared budget
  },
  handler: (_req, res) => {
    res.status(429).json({
      data: null,
      error: {
        code: "opening_explorer_busy",
        message:
          "Too many opening lookups are hitting the shared explorer budget right now. Please retry shortly.",
      },
      meta: null,
    });
  },
  standardHeaders: true,
  legacyHeaders: false,
  // Our key is intentionally constant (global budget, not per-IP); disable the
  // library's IP-shaped-key validation so it doesn't warn about a non-IP key.
  validate: { ip: false },
});

type UpstreamOutcome =
  | { kind: "ok"; data: unknown; cached: boolean }
  | { kind: "rate_limited"; retryAfter: string | null }
  | { kind: "unavailable" };

// Serialize ALL upstream calls to at most one in flight at a time, per Lichess's
// "only make one request at a time" guidance. This is an in-process chain, which
// is globally effective because the API runs as a single Node process; if this
// is ever horizontally scaled, serialization becomes per-instance and this note
// is where to revisit it.
let upstreamChain: Promise<unknown> = Promise.resolve();
function runSerialized<T>(task: () => Promise<T>): Promise<T> {
  // Run `task` whether the previous call resolved OR rejected — one slow/failed
  // upstream call must not break the chain for everyone behind it.
  const result = upstreamChain.then(task, task);
  upstreamChain = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
}

// Coalesce concurrent requests for the SAME normalized position onto one
// upstream call rather than queueing several identical ones behind the lock.
const inFlight = new Map<string, Promise<UpstreamOutcome>>();

function getUpstream(fen: string, key: string): Promise<UpstreamOutcome> {
  const existing = inFlight.get(key);
  if (existing) return existing;
  const p = runSerialized(() => fetchMasters(fen, key)).finally(() =>
    inFlight.delete(key),
  );
  inFlight.set(key, p);
  return p;
}

async function fetchMasters(
  fen: string,
  key: string,
): Promise<UpstreamOutcome> {
  // Re-check the cache now that we hold the serialization slot: a request that
  // queued ahead of us for the same position may have just populated it, in
  // which case we skip a redundant upstream call entirely.
  const alreadyCached = openingCache.get(key);
  if (alreadyCached) return { kind: "ok", data: alreadyCached, cached: true };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);
  try {
    const url = `${MASTERS_URL}?${new URLSearchParams({ fen }).toString()}`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${env.LICHESS_TOKEN}` },
      signal: controller.signal,
    });

    // 429 is a real, distinguishable upstream signal — pass the status and
    // Retry-After straight through rather than collapsing it into the generic
    // graceful-fallback shape used for outages/timeouts.
    if (res.status === 429) {
      return {
        kind: "rate_limited",
        retryAfter: res.headers.get("retry-after"),
      };
    }
    if (!res.ok) {
      logger.warn(
        { status: res.status },
        "Opening explorer upstream returned non-OK status",
      );
      return { kind: "unavailable" };
    }

    const data = (await res.json()) as object;
    openingCache.set(key, data);
    return { kind: "ok", data, cached: false };
  } catch (err) {
    // Network failure or timeout abort — the explorer has had multi-day
    // outages, so this is a real path, not a hypothetical edge case.
    logger.warn({ err }, "Opening explorer upstream fetch failed");
    return { kind: "unavailable" };
  } finally {
    clearTimeout(timeout);
  }
}

// GET /api/opening?fen=<FEN> — proxies explorer.lichess.ovh/masters with the
// server-only LICHESS_TOKEN Bearer header. requireUser runs before the backstop
// limiter so unauthenticated callers can't spend the shared upstream budget.
openingRouter.get(
  "/opening",
  requireUser,
  openingBackstopLimiter,
  async (req, res) => {
    const parsed = openingQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      // 400s keep the established string-`error` shape (matches every other
      // route + the error handler). The object-`error` shape below is the
      // ticket-specified contract for the fallback/429 cases only.
      res.status(400).json({ data: null, error: "Invalid FEN", meta: null });
      return;
    }

    const fen = parsed.data.fen;
    // A FEN valid enough to pass the schema always has the four leading fields.
    const key = normalizeFenForCache(fen)!;

    const cached = openingCache.get(key);
    if (cached) {
      res.json({ data: cached, error: null, meta: { cached: true } });
      return;
    }

    const outcome = await getUpstream(fen, key);
    switch (outcome.kind) {
      case "ok":
        res.json({
          data: outcome.data,
          error: null,
          meta: { cached: outcome.cached },
        });
        return;
      case "rate_limited":
        if (outcome.retryAfter) res.setHeader("Retry-After", outcome.retryAfter);
        res.status(429).json({
          data: null,
          error: {
            code: "opening_explorer_rate_limited",
            message:
              "The opening explorer is rate limiting requests. Please retry shortly.",
          },
          meta: { cached: false },
        });
        return;
      case "unavailable":
        // Graceful fallback: 200 with a null data + typed error.code, NOT a
        // bare 5xx. The frontend tells "no data yet" from "hard failure" via
        // error.code, not HTTP status.
        res.status(200).json({
          data: null,
          error: {
            code: "opening_explorer_unavailable",
            message: "The opening explorer is temporarily unavailable.",
          },
          meta: { cached: false },
        });
        return;
    }
  },
);
