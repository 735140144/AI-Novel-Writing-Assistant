import type { Request } from "express";
import { prisma } from "../../db/prisma";
import { createOpaqueToken, hashOpaqueToken } from "./authTokens";

const DEFAULT_SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

function resolveSessionTtlMs(): number {
  const raw = Number(process.env.AUTH_SESSION_TTL_MS);
  if (Number.isFinite(raw) && raw > 0) {
    return raw;
  }
  return DEFAULT_SESSION_TTL_MS;
}

function extractCookieHeader(req: Request): string {
  const cookieHeader = req.headers.cookie;
  return typeof cookieHeader === "string" ? cookieHeader : "";
}

export function readSessionTokenFromRequest(req: Request): string | null {
  const cookieHeader = extractCookieHeader(req);
  if (!cookieHeader) {
    return null;
  }

  for (const entry of cookieHeader.split(";")) {
    const [rawName, ...rest] = entry.trim().split("=");
    if (rawName !== "ai_novel_session") {
      continue;
    }
    const rawValue = rest.join("=");
    if (!rawValue) {
      return null;
    }
    return decodeURIComponent(rawValue);
  }

  return null;
}

export async function createUserSession(input: {
  userId: string;
  ip?: string;
  userAgent?: string;
}): Promise<{ token: string; expiresAt: Date }> {
  const token = createOpaqueToken();
  const expiresAt = new Date(Date.now() + resolveSessionTtlMs());
  await prisma.userSession.create({
    data: {
      userId: input.userId,
      sessionTokenHash: hashOpaqueToken(token),
      expiresAt,
      ip: input.ip,
      userAgent: input.userAgent,
    },
  });
  return { token, expiresAt };
}

export async function resolveAuthenticatedUser(sessionToken: string) {
  const session = await prisma.userSession.findUnique({
    where: {
      sessionTokenHash: hashOpaqueToken(sessionToken),
    },
    include: {
      user: true,
    },
  });

  if (!session) {
    return null;
  }

  if (session.expiresAt.getTime() <= Date.now()) {
    await prisma.userSession.delete({ where: { id: session.id } }).catch(() => undefined);
    return null;
  }

  await prisma.userSession.update({
    where: { id: session.id },
    data: { lastSeenAt: new Date() },
  }).catch(() => undefined);

  return session.user;
}

export async function deleteSessionByToken(sessionToken: string): Promise<void> {
  await prisma.userSession.deleteMany({
    where: {
      sessionTokenHash: hashOpaqueToken(sessionToken),
    },
  });
}
