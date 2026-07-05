import { z } from "zod";

// Required set derived from planning/squire-env-reference.md's "Needed in"
// column: vars marked "dev" or "dev + prod" must be present to start locally.
// Vars marked "prod only" stay optional so a blank dev .env never fails startup.
const envSchema = z.object({
  LLM_PROVIDER: z.string().min(1),
  LLM_MODEL: z.string().min(1),
  OLLAMA_BASE_URL: z.string().min(1),
  LICHESS_TOKEN: z.string().min(1),
  FRONTEND_URL: z.string().min(1),
  LOG_LEVEL: z.string().min(1),
  CLERK_SECRET_KEY: z.string().min(1),
  VITE_CLERK_PUBLISHABLE_KEY: z.string().min(1),
  LICHESS_OAUTH_CLIENT_ID: z.string().min(1),
  LICHESS_OAUTH_REDIRECT_URI: z.string().min(1),

  // prod only — optional, must not fail startup when blank in dev
  CLAUDE_API_KEY: z.string().optional().default(""),
  TURSO_CONNECTION_URL: z.string().optional().default(""),
  TURSO_AUTH_TOKEN: z.string().optional().default(""),
  TRUST_PROXY_HOPS: z.string().optional().default(""),
  VERCEL_ACCOUNT_SLUG: z.string().optional().default(""),
  SENTRY_DSN: z.string().optional().default(""),
  CHESSCOM_OAUTH_CLIENT_ID: z.string().optional().default(""),
  CHESSCOM_OAUTH_CLIENT_SECRET: z.string().optional().default(""),

  PORT: z.string().optional().default("3001"),
  NODE_ENV: z.string().optional().default("development"),
});

function loadEnv() {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    // Logger isn't constructed yet at this point in startup, so this is the
    // one place in server/ allowed to use console directly.
    console.error(
      "Missing/invalid required environment variables:",
      parsed.error.flatten().fieldErrors,
    );
    process.exit(1);
  }
  return parsed.data;
}

export const env = loadEnv();
