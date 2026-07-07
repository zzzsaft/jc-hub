import { createDecipheriv, createHash } from "node:crypto";
import { AppError } from "../../lib/errors.js";

export const wecomCallbackSignature = (token: string, timestamp: string, nonce: string, encrypted: string) =>
  createHash("sha1").update([token, timestamp, nonce, encrypted].sort().join("")).digest("hex");

const aesKeyFromEncodingKey = (encodingAESKey: string) => {
  const key = Buffer.from(`${encodingAESKey}=`, "base64");
  if (key.length !== 32) throw new AppError(500, "INVALID_WECOM_CALLBACK_AES_KEY");
  return key;
};

export const decryptWecomCallbackMessage = (
  encodingAESKey: string,
  encrypted: string,
  expectedReceiveId?: string
) => {
  const aesKey = aesKeyFromEncodingKey(encodingAESKey);
  const decipher = createDecipheriv("aes-256-cbc", aesKey, aesKey.subarray(0, 16));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(encrypted, "base64")),
    decipher.final()
  ]);
  const messageLength = decrypted.readUInt32BE(16);
  const message = decrypted.subarray(20, 20 + messageLength).toString("utf8");
  const receiveId = decrypted.subarray(20 + messageLength).toString("utf8");
  if (expectedReceiveId && receiveId && receiveId !== expectedReceiveId) {
    throw new AppError(403, "WECOM_CALLBACK_RECEIVE_ID_MISMATCH");
  }
  return { message, receiveId };
};

export const verifyAndDecryptWecomCallback = (
  options: {
    token: string;
    encodingAESKey: string;
    corpId: string;
    msgSignature: unknown;
    timestamp: unknown;
    nonce: unknown;
    encrypted: unknown;
  }
) => {
  const msgSignature = String(options.msgSignature ?? "");
  const timestamp = String(options.timestamp ?? "");
  const nonce = String(options.nonce ?? "");
  const encrypted = String(options.encrypted ?? "");
  if (!options.token || !options.encodingAESKey) throw new AppError(500, "WECOM_CALLBACK_CONFIG_MISSING");
  if (!msgSignature || !timestamp || !nonce || !encrypted) throw new AppError(400, "INVALID_WECOM_CALLBACK_PARAMS");
  if (wecomCallbackSignature(options.token, timestamp, nonce, encrypted) !== msgSignature) {
    throw new AppError(403, "INVALID_WECOM_CALLBACK_SIGNATURE");
  }
  return decryptWecomCallbackMessage(options.encodingAESKey, encrypted, options.corpId).message;
};

export const xmlText = (xml: string, tag: string) => {
  const escaped = tag.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = xml.match(new RegExp(`<${escaped}>\\s*(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?\\s*</${escaped}>`, "i"));
  return match?.[1]?.trim() ?? "";
};
