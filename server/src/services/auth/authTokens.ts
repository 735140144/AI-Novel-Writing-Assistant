import crypto from "node:crypto";

export function createOpaqueToken(): string {
  return crypto.randomBytes(32).toString("base64url");
}

export function hashOpaqueToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}
