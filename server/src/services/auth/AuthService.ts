import { prisma } from "../../db/prisma";
import { AppError } from "../../middleware/errorHandler";
import { createOpaqueToken, hashOpaqueToken } from "./authTokens";
import { hashPassword, validatePasswordStrength, verifyPassword } from "./authPassword";
import { createUserSession, deleteSessionByToken } from "./authSession";
import { sendPasswordResetEmail, sendVerificationEmail } from "./authMail";
import {
  ensureAdminCreativeResources,
} from "../bootstrap/SystemResourceBootstrapService";

const PASSWORD_RESET_TTL_MS = 60 * 60 * 1000;

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function requireAuthUser(user: {
  id: string;
  email: string;
  role: string;
  status: string;
  emailVerifiedAt: Date | null;
}) {
  return {
    id: user.id,
    email: user.email,
    role: user.role,
    status: user.status,
    emailVerifiedAt: user.emailVerifiedAt?.toISOString() ?? null,
  };
}

export class AuthService {
  async register(input: {
    email: string;
    password: string;
  }) {
    const email = normalizeEmail(input.email);
    const password = input.password.trim();
    if (!email) {
      throw new AppError("邮箱不能为空。", 400);
    }
    validatePasswordStrength(password);

    const existing = await prisma.user.findUnique({
      where: { email },
      select: { id: true },
    });
    if (existing) {
      throw new AppError("该邮箱已注册。", 409);
    }

    const verificationToken = createOpaqueToken();
    const verificationTokenHash = hashOpaqueToken(verificationToken);
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

    const user = await prisma.user.create({
      data: {
        email,
        passwordHash: hashPassword(password),
        role: email === "caoty@luckydcms.com" ? "admin" : "user",
        status: "pending_verification",
        emailVerifications: {
          create: {
            tokenHash: verificationTokenHash,
            expiresAt,
          },
        },
      },
    });

    if (email === "caoty@luckydcms.com") {
      await ensureAdminCreativeResources(user.id);
    }

    await sendVerificationEmail({ email, token: verificationToken });

    return requireAuthUser(user);
  }

  async login(input: {
    email: string;
    password: string;
    ip?: string;
    userAgent?: string;
  }) {
    const email = normalizeEmail(input.email);
    const password = input.password.trim();

    const user = await prisma.user.findUnique({
      where: { email },
    });
    if (!user || !verifyPassword(password, user.passwordHash)) {
      throw new AppError("邮箱或密码不正确。", 401);
    }
    if (user.status === "disabled") {
      throw new AppError("当前账户已停用。", 403);
    }

    const session = await createUserSession({
      userId: user.id,
      ip: input.ip,
      userAgent: input.userAgent,
    });

    return {
      user: requireAuthUser(user),
      session,
    };
  }

  async forgotPassword(input: {
    email: string;
    requestOrigin?: string;
  }): Promise<void> {
    const email = normalizeEmail(input.email);
    if (!email) {
      return;
    }

    const user = await prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        email: true,
        status: true,
      },
    });

    if (!user || user.status === "disabled") {
      return;
    }

    await prisma.passwordResetToken.deleteMany({
      where: { userId: user.id },
    });

    const token = createOpaqueToken();
    const expiresAt = new Date(Date.now() + PASSWORD_RESET_TTL_MS);

    await prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash: hashOpaqueToken(token),
        expiresAt,
      },
    });

    await sendPasswordResetEmail({
      email: user.email,
      token,
      requestOrigin: input.requestOrigin,
      expiresAt,
    });
  }

  async resetPassword(input: {
    token: string;
    password: string;
  }): Promise<void> {
    const token = input.token.trim();
    if (!token) {
      throw new AppError("重置入口无效或已过期，请重新获取。", 400);
    }

    const password = input.password.trim();
    validatePasswordStrength(password);

    const passwordResetToken = await prisma.passwordResetToken.findUnique({
      where: {
        tokenHash: hashOpaqueToken(token),
      },
      include: {
        user: true,
      },
    });

    if (!passwordResetToken) {
      throw new AppError("重置入口无效或已过期，请重新获取。", 400);
    }

    if (passwordResetToken.consumedAt || passwordResetToken.expiresAt.getTime() <= Date.now()) {
      throw new AppError("重置入口无效或已过期，请重新获取。", 400);
    }

    if (passwordResetToken.user.status === "disabled") {
      throw new AppError("当前账户已停用。", 403);
    }

    const nextPasswordHash = hashPassword(password);
    await prisma.$transaction([
      prisma.user.update({
        where: { id: passwordResetToken.userId },
        data: { passwordHash: nextPasswordHash },
      }),
      prisma.passwordResetToken.update({
        where: { id: passwordResetToken.id },
        data: { consumedAt: new Date() },
      }),
      prisma.passwordResetToken.deleteMany({
        where: {
          userId: passwordResetToken.userId,
          id: { not: passwordResetToken.id },
        },
      }),
      prisma.userSession.deleteMany({
        where: { userId: passwordResetToken.userId },
      }),
    ]);
  }

  async logout(sessionToken: string | null): Promise<void> {
    if (!sessionToken) {
      return;
    }
    await deleteSessionByToken(sessionToken);
  }
}

export const authService = new AuthService();
