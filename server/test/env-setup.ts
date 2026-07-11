// Vitest setup: populate the env vars server/env.ts requires so importing any
// server module in a test doesn't hit its process.exit(1) on a missing var.
// These are inert placeholders — real upstream calls are mocked in each test,
// never made against these values. Only sets a var if not already provided, so
// a real environment (e.g. local .env) still wins.
const TEST_ENV_DEFAULTS: Record<string, string> = {
  LLM_PROVIDER: "ollama",
  LLM_MODEL: "test-model",
  OLLAMA_BASE_URL: "http://localhost:11434",
  LICHESS_TOKEN: "test-lichess-token",
  FRONTEND_URL: "http://localhost:5173",
  // Silence pino during tests.
  LOG_LEVEL: "silent",
  CLERK_SECRET_KEY: "sk_test_placeholder",
  VITE_CLERK_PUBLISHABLE_KEY: "pk_test_placeholder",
  LICHESS_OAUTH_CLIENT_ID: "squire-test",
  LICHESS_OAUTH_REDIRECT_URI: "http://localhost:5173/oauth/lichess",
  // In-memory libSQL so importing any server module (app.ts now transitively
  // imports server/db) never opens or writes a real DB file during tests. The
  // repertoire route tests migrate this in-memory DB and drive it directly.
  TURSO_CONNECTION_URL: ":memory:",
};

for (const [key, value] of Object.entries(TEST_ENV_DEFAULTS)) {
  if (!process.env[key]) process.env[key] = value;
}
