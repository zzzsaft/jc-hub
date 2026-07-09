import assert from "node:assert/strict";
import test from "node:test";
import { requestDeepSeekJson } from "../../src/ai/llm/deepseekClient.js";

test("DeepSeek JSON requests disable thinking by default", async () => {
  const body = await captureDeepSeekBody({});

  assert.deepEqual(body.thinking, { type: "disabled" });
  assert.equal("extra_body" in body, false);
  assert.equal(body.temperature, 0);
});

test("DeepSeek JSON requests allow fallback to enable thinking without temperature", async () => {
  const body = await captureDeepSeekBody({ thinking: { type: "enabled" } });

  assert.deepEqual(body.thinking, { type: "enabled" });
  assert.equal("extra_body" in body, false);
  assert.equal("temperature" in body, false);
});

async function captureDeepSeekBody(extraBody: Record<string, unknown>): Promise<Record<string, unknown>> {
  const originalDisabled = process.env.LLM_CALL_LOG_DISABLED;
  process.env.LLM_CALL_LOG_DISABLED = "true";
  let body: Record<string, unknown> | undefined;
  const client = {
    chat: {
      completions: {
        create: async (input: Record<string, unknown>) => {
          body = input;
          return { choices: [{ message: { content: "{\"ok\":true}" }, finish_reason: "stop" }] };
        },
      },
    },
  };

  try {
    await requestDeepSeekJson({
      client: client as any,
      purpose: "test",
      messages: [{ role: "user", content: "json" }],
      stream: false,
      ...(Object.keys(extraBody).length > 0 ? { extraBody } : {}),
    });
  } finally {
    if (originalDisabled === undefined) delete process.env.LLM_CALL_LOG_DISABLED;
    else process.env.LLM_CALL_LOG_DISABLED = originalDisabled;
  }

  if (!body) throw new Error("DeepSeek request body was not captured");
  return body;
}
