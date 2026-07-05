import type { NextFunction, Request, Response } from "express";
import { getAuth } from "@clerk/express";

// Reusable auth guard for the REST API. Verifies the Clerk session via
// getAuth(req) and returns a 401 JSON response when unauthenticated.
//
// This is deliberately NOT Clerk's requireAuth() export: requireAuth()
// REDIRECTS unauthenticated callers to a sign-in page (correct for
// server-rendered pages, wrong for an API, which must return 401 JSON) and is
// itself now deprecated. clerkMiddleware() runs globally in server/index.ts
// before any route, so getAuth(req) is populated here.
// See .claude/context/backend-engineer.md ("Authentication (Clerk)").
export function requireUser(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const { isAuthenticated, userId } = getAuth(req);
  if (!isAuthenticated) {
    res.status(401).json({ data: null, error: "Unauthenticated", meta: null });
    return;
  }
  req.userId = userId;
  next();
}
