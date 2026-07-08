import crypto from "node:crypto";
import { Router, type Request } from "express";
import { z } from "zod";
import { asyncHandler } from "../../lib/errors.js";

type RawBodyRequest = Request & { rawBody?: string };

const webhookQuerySchema = z.object({
  nonce: z.string().min(1),
  timestamp: z.string().min(1),
});

const webhookBodySchema = z.object({
  op: z.string().min(1),
  data: z.unknown(),
  opTime: z.number().optional(),
  send_time: z.string().optional(),
}).passthrough();

export const jiandaoyunWebhookRouter = Router();

jiandaoyunWebhookRouter.post(
  "/integration/jiandaoyun/webhook",
  asyncHandler(async (req, res) => {
    const secret = process.env.JDY_WEBHOOK_TOKEN || "";
    const signature = req.header("x-jdy-signature") || "";
    const deliverId = req.header("x-jdy-deliverid") || "";
    const query = webhookQuerySchema.parse(req.query);
    const payload = (req as RawBodyRequest).rawBody || JSON.stringify(req.body ?? {});

    if (!secret || !isJiandaoyunWebhookSignatureValid({ ...query, payload, secret, signature })) {
      res.status(401).send("fail");
      return;
    }

    const event = webhookBodySchema.parse(req.body);
    await handleJiandaoyunWebhookEvent({ deliverId, event });
    res.type("text/plain").send("success");
  }),
);

export const getJiandaoyunWebhookSignature = (params: { nonce: string; payload: string; secret: string; timestamp: string }) =>
  crypto
    .createHash("sha1")
    .update(`${params.nonce}:${params.payload}:${params.secret}:${params.timestamp}`, "utf8")
    .digest("hex");

export const isJiandaoyunWebhookSignatureValid = (params: { nonce: string; payload: string; secret: string; timestamp: string; signature: string }) => {
  const expected = getJiandaoyunWebhookSignature(params);
  const actual = params.signature.trim();
  return actual.length === expected.length && crypto.timingSafeEqual(Buffer.from(actual), Buffer.from(expected));
};

export const getJiandaoyunWebhookKind = (op: string) => {
  if (["data_create", "data_update", "data_remove", "data_recover"].includes(op)) return "data";
  if (op === "form_update") return "form";
  if (op.endsWith("_message") || op === "flow_message") return "message";
  return "unknown";
};

const handleJiandaoyunWebhookEvent = async (_params: { deliverId: string; event: z.infer<typeof webhookBodySchema> }) => {
  // ponytail: ack fast; wire durable storage/queue here when a concrete consumer exists.
};
