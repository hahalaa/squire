import express from "express";
import helmet from "helmet";
import cors from "cors";
import rateLimit from "express-rate-limit";
import { pinoHttp } from "pino-http";
import { clerkMiddleware } from "@clerk/express";

import { env } from "./env.js";
import { logger } from "./logger.js";
import { corsOptions } from "./middleware/cors.js";
import { errorHandler } from "./middleware/errorHandler.js";
import { healthRouter } from "./routes/health.js";
import { meRouter } from "./routes/me.js";
import { openingRouter } from "./routes/opening.js";

// The fully-wired Express app, exported WITHOUT calling listen() so tests can
// drive it via supertest's request(app) through the real middleware chain.
// server/index.ts imports this and owns the listen() call.
export const app = express();

app.set("trust proxy", process.env.TRUST_PROXY_HOPS || false);

// Middleware order is non-negotiable (see backend-engineer.md):
// helmet -> cors -> rateLimit -> bodyParser -> pinoHttp -> clerkMiddleware -> routes
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        ...helmet.contentSecurityPolicy.getDefaultDirectives(),
        // Stockfish's WASM worker needs this; a bare script-src 'self' blocks it.
        "script-src": ["'self'", "'wasm-unsafe-eval'"],
      },
    },
  }),
);
app.use(cors(corsOptions));
app.use(rateLimit({ windowMs: 60_000, limit: 100 }));
app.use(express.json({ limit: "1mb" }));
app.use(pinoHttp({ logger }));
// clerkMiddleware() defaults to reading process.env.CLERK_PUBLISHABLE_KEY,
// but our naming convention only exposes VITE_CLERK_PUBLISHABLE_KEY (the
// VITE_ prefix is what lets Vite ship it to the browser) — pass it explicitly.
app.use(clerkMiddleware({ publishableKey: env.VITE_CLERK_PUBLISHABLE_KEY }));

app.use("/api", healthRouter);
app.use("/api", meRouter);
app.use("/api", openingRouter);

app.use(errorHandler);
