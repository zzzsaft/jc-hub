import crypto from "node:crypto";

export function signBodyWithTimestamp(body: string, timestamp: string, secret: string): string {
  return crypto.createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex");
}

