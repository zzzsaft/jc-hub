import "./config/env.js";

import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import { pathToFileURL } from "node:url";
import { ZodError } from "zod";
import { logger } from "./config/logger.js";
import { AppRoutes } from "./routes/index.js";
import { productConfigAgentWorker } from "./modules/productConfigAgent/worker/backgroundWorker.js";
import { installAxiosLogger } from "./lib/axios-logger.js";
import { configureLlmConcurrencyLimit } from "./ai/llm/llmConcurrency.js";
import { authRouter } from "./modules/auth/routes.js";
import { wecomRouter } from "./integration/wecom/routes.js";
import { jdyRouter } from "./integration/jdy/routes.js";
import { xftRouter } from "./integration/xft/routes.js";
import { AppError } from "./lib/errors.js";
import { config } from "./lib/config.js";
import {
  configurePrismaConcurrencyLimit,
  getPrismaConcurrencyMetrics,
} from "./lib/prisma.js";
import { authenticate } from "./middleware/auth.js";
import { expressLogger } from "./middleware/express-logger.js";
import {
  configureSqlGuardConcurrencyLimit,
  getSqlGuardConcurrencyMetrics,
} from "./modules/erpSqlAgent/sqlGuard/service/sqlGuardConcurrency.js";
import {
  configureErpQueryConcurrency,
  getErpQueryConcurrencyMetrics,
} from "./modules/erpSqlAgent/query/index.js";
import { getSqlReferenceWorkMetrics } from "./modules/erpSqlAgent/templates/repository/SqlTemplateRepository.js";
import {
  configureAuditDbConcurrency,
  getAuditDbConcurrencyMetrics,
} from "./ai/audit/auditDbLimiter.js";
import { getLlmConcurrencyMetrics } from "./ai/llm/llmConcurrency.js";
import { erpSqlAccessPolicyRouter } from "./modules/erpSqlAgent/access/routes.js";
import { configureAgentRuntimeConcurrency, getAgentRuntimeConcurrencyMetrics } from "./ai/agentRuntime/service.js";

installAxiosLogger();
configureErpSqlRuntimeLimits();

export const app = express();
const port = Number(process.env.PORT || 2030);

app.use(
  cors({ origin: config.corsOrigin, credentials: config.corsCredentials })
);
app.use(
  express.json({
    limit: "50mb",
    verify: (request, _response, buffer) => {
      (request as express.Request & { rawBody?: string }).rawBody =
        buffer.toString("utf8");
    },
  })
);
app.use(express.urlencoded({ extended: true, limit: "50mb" }));
app.use(cookieParser());
app.use(expressLogger);

export const livenessHandler: express.RequestHandler = (_request, response) => {
  response.json({
    ok: true,
    erpSql: {
      agent: getAgentRuntimeConcurrencyMetrics(),
      llm: getLlmConcurrencyMetrics(),
      db: getPrismaConcurrencyMetrics(),
      guard: getSqlGuardConcurrencyMetrics(),
      queryPool: getErpQueryConcurrencyMetrics(),
      detachedReferenceWork: getSqlReferenceWorkMetrics(),
      auditDb: getAuditDbConcurrencyMetrics(),
    },
  });
};

export const readinessHandler: express.RequestHandler = (_request, response) => {
  const dependencies = {
    agent: getAgentRuntimeConcurrencyMetrics(),
    llm: getLlmConcurrencyMetrics(),
    db: getPrismaConcurrencyMetrics(),
    queryPool: getErpQueryConcurrencyMetrics(),
  };
  const degraded = Object.values(dependencies).some((pool) => pool.active >= pool.limit && pool.queued > 0);
  response.status(degraded ? 503 : 200).json({ ok: !degraded, dependencies });
};

app.get("/health", livenessHandler);
app.get("/ready", readinessHandler);

app.use(authRouter);
app.use(wecomRouter);
app.use(jdyRouter);
app.use(erpSqlAccessPolicyRouter);
app.use(authenticate, xftRouter);

for (const route of AppRoutes) {
  (app as any)[route.method](
    route.path,
    async (
      request: express.Request,
      response: express.Response,
      next: express.NextFunction
    ) => {
      try {
        await route.action(request, response);
      } catch (error) {
        next(error);
      }
    }
  );
}

app.use(
  (
    error: unknown,
    _request: express.Request,
    response: express.Response,
    _next: express.NextFunction
  ) => {
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
    logger.error(
      error instanceof Error ? error.stack || error.message : String(error)
    );
    response
      .status(500)
      .json({ error: error instanceof Error ? error.message : String(error) });
  }
);

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  app.listen(port, () => {
    logger.info(`[server]: Server is running at http://localhost:${port}`);
    if (process.env.PRODUCT_CONFIG_AGENT_WORKER_ENABLED === "true") {
      productConfigAgentWorker.start();
      logger.info("[productConfigAgentWorker]: started");
    }
  });
}

function configureErpSqlRuntimeLimits(): void {
  configureAgentRuntimeConcurrency(
    positiveInt(process.env.AGENT_RUNTIME_CONCURRENCY_LIMIT, 2),
    nonNegativeInt(process.env.AGENT_RUNTIME_MAX_QUEUE, 8)
  );
  configureLlmConcurrencyLimit(
    positiveInt(process.env.LLM_CONCURRENCY_LIMIT, 12),
    nonNegativeInt(process.env.LLM_MAX_QUEUE, 64)
  );
  configurePrismaConcurrencyLimit(
    positiveInt(process.env.ERP_SQL_DB_CONCURRENCY, 6),
    nonNegativeInt(process.env.ERP_SQL_DB_MAX_QUEUE, 32)
  );
  configureAuditDbConcurrency(
    positiveInt(process.env.AUDIT_DB_CONCURRENCY, 4),
    nonNegativeInt(process.env.AUDIT_DB_MAX_QUEUE, 100)
  );
  configureSqlGuardConcurrencyLimit(
    positiveInt(process.env.ERP_SQL_GUARD_CONCURRENCY, 4),
    nonNegativeInt(process.env.ERP_SQL_GUARD_MAX_QUEUE, 32)
  );
  configureErpQueryConcurrency(
    positiveInt(process.env.ERP_QUERY_CONCURRENCY, 4),
    nonNegativeInt(process.env.ERP_QUERY_MAX_QUEUE, 16)
  );
}

function positiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

function nonNegativeInt(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : fallback;
}
