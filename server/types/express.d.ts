// Augments Express's Request with the fields our middleware stashes.
// `userId` is set by the requireUser guard from Clerk's getAuth(req).
declare global {
  namespace Express {
    interface Request {
      userId?: string;
    }
  }
}

export {};
