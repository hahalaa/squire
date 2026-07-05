/// <reference types="vite/client" />

interface ImportMetaEnv {
  // Clerk publishable key — safe to expose to the browser (public by design).
  readonly VITE_CLERK_PUBLISHABLE_KEY: string;
  // Base URL of the Squire API. Backend and frontend are separate origins in
  // production (Render + Vercel), so this is an absolute URL, not a same-origin path.
  readonly VITE_API_URL: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
