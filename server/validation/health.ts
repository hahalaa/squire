import { z } from "zod";

// GET /api/health takes no query params — an empty-object schema is the
// starting pattern every other route's Zod schema in this folder follows.
export const healthQuerySchema = z.object({}).strict();
