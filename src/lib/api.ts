import { useAuth } from "@clerk/react";
import { useCallback } from "react";

const API_URL = import.meta.env.VITE_API_URL;

// Every API response follows the backend's { data, error, meta } contract.
export interface ApiResponse<T> {
  data: T | null;
  error: string | null;
  meta: unknown;
}

// useApi returns a fetch helper bound to the current Clerk session. The session
// token is attached as `Authorization: Bearer <token>` because the frontend and
// backend are separate origins (Vercel + Render) and Clerk cookies don't cross
// origins — the backend's clerkMiddleware() reads this header. getToken() must
// come from useAuth() (a hook), so this is a hook, not a bare module function.
export function useApi() {
  const { getToken } = useAuth();
  return useCallback(
    async <T>(path: string, init?: RequestInit): Promise<ApiResponse<T>> => {
      const token = await getToken();
      const res = await fetch(`${API_URL}${path}`, {
        ...init,
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...init?.headers,
        },
      });
      return (await res.json()) as ApiResponse<T>;
    },
    [getToken],
  );
}
