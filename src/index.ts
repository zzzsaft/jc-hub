import "./config/env.js";

import cors from "cors";
import express from "express";
import { logger } from "./config/logger.js";
import { AppRoutes } from "./routes/index.js";
import { productConfigAgentWorker } from "./productConfigAgent/worker/backgroundWorker.js";

const app = express();
const port = Number(process.env.PORT || 2001);

app.use(cors());
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));

app.get("/health", (_request, response) => {
  response.json({ ok: true });
});

for (const route of AppRoutes) {
  (app as any)[route.method](route.path, async (request: express.Request, response: express.Response, next: express.NextFunction) => {
    try {
      await route.action(request, response);
    } catch (error) {
      next(error);
    }
  });
}

app.use((error: unknown, _request: express.Request, response: express.Response, _next: express.NextFunction) => {
  logger.error(error instanceof Error ? error.stack || error.message : String(error));
  response.status(500).json({ error: error instanceof Error ? error.message : String(error) });
});

app.listen(port, () => {
  logger.info(`[server]: Server is running at http://localhost:${port}`);
  if (process.env.PRODUCT_CONFIG_AGENT_WORKER_ENABLED === "true") {
    productConfigAgentWorker.start();
    logger.info("[productConfigAgentWorker]: started");
  }
});
