import "dotenv/config";

import { app } from "./app.js";
import { env } from "./env.js";
import { logger } from "./logger.js";

// Entry point: the app is fully configured in ./app.ts (which tests import
// directly via supertest); this file's only job is to bind the port.
const port = Number(env.PORT);
app.listen(port, () => {
  logger.info(`Squire API listening on port ${port}`);
});
