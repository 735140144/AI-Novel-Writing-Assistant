import type { Response } from "express";

export const AUTH_SESSION_COOKIE_NAME = "ai_novel_session";

function shouldUseSecureCookies(): boolean {
  return process.env.NODE_ENV === "production";
}

export function serializeAuthCookie(value: string, maxAgeMs: number): string {
  const parts = [
    `${AUTH_SESSION_COOKIE_NAME}=${encodeURIComponent(value)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${Math.max(0, Math.floor(maxAgeMs / 1000))}`,
  ];

  if (shouldUseSecureCookies()) {
    parts.push("Secure");
  }

  return parts.join("; ");
}

export function setSessionCookie(res: Response, token: string, expiresAt: Date): void {
  const maxAgeMs = Math.max(0, expiresAt.getTime() - Date.now());
  res.setHeader("Set-Cookie", serializeAuthCookie(token, maxAgeMs));
}

export function clearSessionCookie(res: Response): void {
  res.setHeader("Set-Cookie", serializeAuthCookie("", 0));
}
