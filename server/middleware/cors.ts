import type { CorsOptions } from "cors";
import { env } from "../env.js";

function buildVercelPreviewPattern(): RegExp | null {
  if (!env.VERCEL_ACCOUNT_SLUG) return null;
  return new RegExp(
    `^https:\\/\\/squire(-git-[a-z0-9-]+|-[a-z0-9]+)-${env.VERCEL_ACCOUNT_SLUG}\\.vercel\\.app$`,
  );
}

const vercelPreviewPattern = buildVercelPreviewPattern();

function isAllowedOrigin(origin: string | undefined): boolean {
  // No Origin header (curl, server-to-server, same-origin) — allow.
  if (!origin) return true;
  if (origin === env.FRONTEND_URL) return true;
  return vercelPreviewPattern?.test(origin) ?? false;
}

export const corsOptions: CorsOptions = {
  origin: (origin, callback) => {
    if (isAllowedOrigin(origin)) {
      callback(null, true);
    } else {
      callback(new Error("Not allowed by CORS"));
    }
  },
  // Frontend (Vercel) and backend (Render) are separate origins. The Clerk
  // session reaches the API as an `Authorization: Bearer` header via the React
  // SDK's getToken(), so that header must be explicitly allowed cross-origin
  // rather than left to the cors package's request-reflection default.
  allowedHeaders: ["Content-Type", "Authorization"],
};
