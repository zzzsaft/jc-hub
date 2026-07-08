import "./config/env.js";

import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import { ZodError } from "zod";
import { logger } from "./config/logger.js";
import { AppRoutes } from "./routes/index.js";
import { productConfigAgentWorker } from "./modules/productConfigAgent/worker/backgroundWorker.js";
import { installAxiosLogger } from "./lib/axios-logger.js";
import { authRouter } from "./modules/auth/routes.js";
import { wecomRouter } from "./integration/wecom/routes.js";
import { jiandaoyunRouter } from "./integration/jiandaoyun/routes.js";
import { jiandaoyunWebhookRouter } from "./integration/jiandaoyun/webhook.js";
import { xftRouter } from "./integration/xft/routes.js";
import { AppError } from "./lib/errors.js";
import { config } from "./lib/config.js";
import { authenticate } from "./middleware/auth.js";
import { expressLogger } from "./middleware/express-logger.js";

installAxiosLogger();

const app = express();
const port = Number(process.env.PORT || 2030);

app.use(cors({ origin: config.corsOrigin, credentials: config.corsCredentials }));
app.use(express.json({
  limit: "50mb",
  verify: (request, _response, buffer) => {
    (request as express.Request & { rawBody?: string }).rawBody = buffer.toString("utf8");
  },
}));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));
app.use(cookieParser());
app.use(expressLogger);

app.get("/health", (_request, response) => {
  response.json({ ok: true });
});

app.use(authRouter);
app.use(wecomRouter);
app.use(jiandaoyunWebhookRouter);
app.use(authenticate, jiandaoyunRouter);
app.use(authenticate, xftRouter);

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
  if (error instanceof AppError) {
    response.status(error.statusCode).json({ error: error.message });
    return;
  }
  if (error instanceof ZodError) {
    response.status(400).json({
      error: "请求参数无效",
      errors: error.issues.map((issue) => ({
        path: issue.path.join("."),
        message: issue.message,
      })),
    });
    return;
  }
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
