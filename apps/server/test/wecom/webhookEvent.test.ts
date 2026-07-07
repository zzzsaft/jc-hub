import assert from "node:assert/strict";
import test from "node:test";
import { webhookRawBodySnapshot } from "../../src/integration/wecom/callback-service.js";

test("webhook raw body snapshot caps preview at 16KB", () => {
  const body = "x".repeat(16 * 1024 + 10);
  const snapshot = webhookRawBodySnapshot(body);

  assert.equal(snapshot.rawBodyPreview.length, 16 * 1024);
  assert.equal(snapshot.rawBodyLength, body.length);
  assert.equal(snapshot.rawBodyTruncated, true);
});

test("webhook raw body snapshot keeps small body", () => {
  const body = "<xml>ok</xml>";
  const snapshot = webhookRawBodySnapshot(body);

  assert.equal(snapshot.rawBodyPreview, body);
  assert.equal(snapshot.rawBodyLength, body.length);
  assert.equal(snapshot.rawBodyTruncated, false);
});

test("webhook raw body snapshot caps multibyte preview by bytes", () => {
  const body = "你".repeat(6000);
  const snapshot = webhookRawBodySnapshot(body);

  assert.ok(Buffer.byteLength(snapshot.rawBodyPreview) <= 16 * 1024);
  assert.equal(snapshot.rawBodyLength, Buffer.byteLength(body));
  assert.equal(snapshot.rawBodyTruncated, true);
});
