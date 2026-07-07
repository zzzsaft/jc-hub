import assert from "node:assert/strict";
import { createCipheriv } from "node:crypto";
import test from "node:test";
import {
  verifyAndDecryptWecomCallback,
  wecomCallbackSignature,
  xmlText
} from "../src/integration/wecom/callback-crypto.js";

const encryptFixture = (encodingAESKey: string, message: string, receiveId: string) => {
  const key = Buffer.from(`${encodingAESKey}=`, "base64");
  const length = Buffer.alloc(4);
  length.writeUInt32BE(Buffer.byteLength(message), 0);
  const cipher = createCipheriv("aes-256-cbc", key, key.subarray(0, 16));
  return Buffer.concat([
    cipher.update(Buffer.concat([Buffer.alloc(16), length, Buffer.from(message), Buffer.from(receiveId)])),
    cipher.final()
  ]).toString("base64");
};

test("WeCom callback verifies signature and decrypts xml", () => {
  const token = "callback-token";
  const corpId = "ww123";
  const encodingAESKey = Buffer.from("12345678901234567890123456789012").toString("base64").slice(0, 43);
  const message = "<xml><Event><![CDATA[change_contact]]></Event><ChangeType>update_user</ChangeType></xml>";
  const encrypted = encryptFixture(encodingAESKey, message, corpId);
  const timestamp = "1700000000";
  const nonce = "nonce";

  const decrypted = verifyAndDecryptWecomCallback({
    token,
    encodingAESKey,
    corpId,
    msgSignature: wecomCallbackSignature(token, timestamp, nonce, encrypted),
    timestamp,
    nonce,
    encrypted
  });

  assert.equal(decrypted, message);
  assert.equal(xmlText(decrypted, "Event"), "change_contact");
  assert.throws(() =>
    verifyAndDecryptWecomCallback({
      token,
      encodingAESKey,
      corpId,
      msgSignature: "bad",
      timestamp,
      nonce,
      encrypted
    })
  );
});
