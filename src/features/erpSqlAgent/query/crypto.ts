import crypto from "node:crypto";

export type EncryptedPayload = {
  iv: string;
  tag: string;
  data: string;
};

function getKey(secretName: string, secret: string | undefined): Buffer {
  if (!secret) {
    throw new Error(`${secretName} is required`);
  }
  return crypto.createHash("sha256").update(secret).digest();
}

export function encryptJsonWithSecret(
  payload: unknown,
  secret: string | undefined,
  secretName = "ERP_QUERY_CRYPTO_SECRET",
): EncryptedPayload {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", getKey(secretName, secret), iv);
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(payload), "utf8"), cipher.final()]);

  return {
    iv: iv.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
    data: encrypted.toString("base64"),
  };
}

export function decryptJsonWithSecret<T = unknown>(
  payload: EncryptedPayload,
  secret: string | undefined,
  secretName = "ERP_QUERY_CRYPTO_SECRET",
): T {
  if (!payload?.iv || !payload?.tag || !payload?.data) {
    throw new Error("Encrypted payload is invalid");
  }

  const decipher = crypto.createDecipheriv(
    "aes-256-gcm",
    getKey(secretName, secret),
    Buffer.from(payload.iv, "base64"),
  );
  decipher.setAuthTag(Buffer.from(payload.tag, "base64"));

  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(payload.data, "base64")),
    decipher.final(),
  ]).toString("utf8");

  return JSON.parse(decrypted) as T;
}

