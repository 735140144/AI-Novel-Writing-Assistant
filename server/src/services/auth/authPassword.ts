import crypto from "node:crypto";
import { AppError } from "../../middleware/errorHandler";

const PASSWORD_HASH_ALGORITHM = "sha256";
const PASSWORD_ITERATIONS = 120_000;
const PASSWORD_KEY_LENGTH = 32;
const PASSWORD_DIGEST = "sha256";

function encodePasswordHash(parts: {
  algorithm: string;
  iterations: number;
  salt: string;
  hash: string;
}): string {
  return [
    parts.algorithm,
    String(parts.iterations),
    parts.salt,
    parts.hash,
  ].join(":");
}

export function validatePasswordStrength(password: string): void {
  const trimmed = password.trim();
  if (trimmed.length < 8) {
    throw new AppError("密码至少需要 8 个字符。", 400);
  }
}

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.pbkdf2Sync(password, salt, PASSWORD_ITERATIONS, PASSWORD_KEY_LENGTH, PASSWORD_DIGEST)
    .toString("hex");
  return encodePasswordHash({
    algorithm: PASSWORD_HASH_ALGORITHM,
    iterations: PASSWORD_ITERATIONS,
    salt,
    hash,
  });
}

export function verifyPassword(password: string, storedPasswordHash: string): boolean {
  const [algorithm, iterationsValue, salt, expectedHash] = storedPasswordHash.split(":");
  if (algorithm !== PASSWORD_HASH_ALGORITHM || !iterationsValue || !salt || !expectedHash) {
    return false;
  }

  const iterations = Number(iterationsValue);
  if (!Number.isFinite(iterations) || iterations < 1) {
    return false;
  }

  const computedHash = crypto.pbkdf2Sync(password, salt, iterations, PASSWORD_KEY_LENGTH, PASSWORD_DIGEST)
    .toString("hex");
  return crypto.timingSafeEqual(Buffer.from(computedHash, "hex"), Buffer.from(expectedHash, "hex"));
}
