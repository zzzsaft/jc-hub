import assert from "node:assert/strict";
import test from "node:test";
import {
  buildRecentConversation,
  decryptConversationText,
  encryptConversationText,
} from "../../src/ai/agentRuntime/conversationPayload.js";

test("ERP conversation payload is reversible but not plaintext", () => {
  const previous = process.env.AGENT_RUNTIME_CONTEXT_CRYPTO_SECRET;
  process.env.AGENT_RUNTIME_CONTEXT_CRYPTO_SECRET = "test-context-secret";
  try {
    const encrypted = encryptConversationText("不要供应商编号，要供应商名称");
    assert(encrypted);
    assert.doesNotMatch(JSON.stringify(encrypted), /供应商名称/u);
    assert.equal(decryptConversationText(encrypted), "不要供应商编号，要供应商名称");
  } finally {
    if (previous === undefined) delete process.env.AGENT_RUNTIME_CONTEXT_CRYPTO_SECRET;
    else process.env.AGENT_RUNTIME_CONTEXT_CRYPTO_SECRET = previous;
  }
});

test("recent conversation keeps six complete rounds in chronological order", () => {
  const previous = process.env.AGENT_RUNTIME_CONTEXT_CRYPTO_SECRET;
  process.env.AGENT_RUNTIME_CONTEXT_CRYPTO_SECRET = "test-context-secret";
  try {
    const messages = Array.from({ length: 14 }, (_, index) => ({
      id: BigInt(index + 1),
      role: index % 2 === 0 ? "user" as const : "assistant" as const,
      content: `[protected ERP message ${index + 1}]`,
      inferenceJsonb: encryptConversationText(`message-${index + 1}`),
    }));

    assert.deepEqual(
      buildRecentConversation(messages).map((item) => item.content),
      Array.from({ length: 12 }, (_, index) => `message-${index + 3}`),
    );
  } finally {
    if (previous === undefined) delete process.env.AGENT_RUNTIME_CONTEXT_CRYPTO_SECRET;
    else process.env.AGENT_RUNTIME_CONTEXT_CRYPTO_SECRET = previous;
  }
});

test("old protected ERP messages without inference payload stay absent", () => {
  assert.deepEqual(buildRecentConversation([{
    id: 1n,
    role: "user",
    content: "[protected ERP message sha256:abc length:12]",
    inferenceJsonb: null,
  }]), []);
});
