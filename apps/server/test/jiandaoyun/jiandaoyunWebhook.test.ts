import assert from "node:assert/strict";
import test from "node:test";
import {
  getJiandaoyunWebhookKind,
  getJiandaoyunWebhookSignature,
  isJiandaoyunWebhookSignatureValid,
} from "../../src/integration/jiandaoyun/webhook.js";

test("Jiandaoyun webhook signature follows official sha1 format", () => {
  const params = {
    nonce: "n1",
    payload: "{\"op\":\"data_create\",\"data\":{}}",
    secret: "secret1",
    timestamp: "1720000000",
  };

  const signature = getJiandaoyunWebhookSignature(params);

  assert.equal(signature, "78adf9f3f30d4308975ab1745d8a43681647ab51");
  assert.equal(isJiandaoyunWebhookSignatureValid({ ...params, signature }), true);
  assert.equal(isJiandaoyunWebhookSignatureValid({ ...params, signature: "bad" }), false);
});

test("Jiandaoyun webhook kind keeps unknown ops successful but visible", () => {
  assert.equal(getJiandaoyunWebhookKind("data_create"), "data");
  assert.equal(getJiandaoyunWebhookKind("form_update"), "form");
  assert.equal(getJiandaoyunWebhookKind("flow_message"), "message");
  assert.equal(getJiandaoyunWebhookKind("future_new_op"), "unknown");
});
