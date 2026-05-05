import { AppError } from "../../middleware/errorHandler";
import { getSystemEmailSettings } from "../settings/SystemEmailSettingsService";

function resolveAuthAppBaseUrl(requestOrigin?: string): string {
  const envBaseUrl = [
    process.env.AUTH_PUBLIC_APP_URL,
    process.env.APP_PUBLIC_URL,
    process.env.WEB_PUBLIC_URL,
    process.env.SITE_PUBLIC_URL,
  ]
    .map((value) => value?.trim() ?? "")
    .find(Boolean);

  const fallbackBaseUrl = requestOrigin?.trim() ?? "";
  const resolvedBaseUrl = envBaseUrl || fallbackBaseUrl;
  if (!resolvedBaseUrl) {
    throw new AppError("系统邮件服务缺少站点地址配置，请联系管理员检查系统设置。", 500);
  }
  return resolvedBaseUrl.replace(/\/+$/, "");
}

function shouldSkipMailDelivery(): boolean {
  return process.env.AUTH_DISABLE_EMAIL === "true";
}

async function sendMail(input: {
  to: string;
  subject: string;
  text: string;
  html?: string;
}): Promise<void> {
  if (shouldSkipMailDelivery()) {
    return;
  }

  const settings = await getSystemEmailSettings();
  if (!settings.smtpHost || !settings.smtpPort || !settings.fromEmail) {
    throw new AppError("系统邮件服务尚未配置完成，请联系管理员检查系统设置。", 500);
  }

  const nodemailerModule = await import("nodemailer");
  const transporter = nodemailerModule.default.createTransport({
    host: settings.smtpHost,
    port: settings.smtpPort,
    secure: settings.smtpSecure,
    auth: settings.smtpUser
      ? {
          user: settings.smtpUser,
          pass: settings.smtpPassword,
        }
      : undefined,
  });

  await transporter.sendMail({
    from: settings.fromName
      ? `${settings.fromName} <${settings.fromEmail}>`
      : settings.fromEmail,
    to: input.to,
    subject: input.subject,
    text: input.text,
    html: input.html,
  });
}

export async function sendVerificationEmail(input: {
  email: string;
  token: string;
}): Promise<void> {
  await sendMail({
    to: input.email,
    subject: "邮箱验证",
    text: input.token,
  });
}

export async function sendPasswordResetEmail(input: {
  email: string;
  token: string;
  requestOrigin?: string;
  expiresAt: Date;
}): Promise<void> {
  const resetUrl = `${resolveAuthAppBaseUrl(input.requestOrigin)}/reset-password?token=${encodeURIComponent(input.token)}`;
  const expiresAtText = input.expiresAt.toLocaleString("zh-CN", { hour12: false });
  await sendMail({
    to: input.email,
    subject: "重置你的登录密码",
    text: [
      "你正在为 AI 小说写作助手重置登录密码。",
      "请打开下面的入口设置新密码：",
      resetUrl,
      `这个入口将在 ${expiresAtText} 失效。`,
      "如果这不是你的操作，可以直接忽略这封邮件。",
    ].join("\n\n"),
    html: [
      "<p>你正在为 AI 小说写作助手重置登录密码。</p>",
      "<p>请打开下面的入口设置新密码：</p>",
      `<p><a href="${resetUrl}">${resetUrl}</a></p>`,
      `<p>这个入口将在 ${expiresAtText} 失效。</p>`,
      "<p>如果这不是你的操作，可以直接忽略这封邮件。</p>",
    ].join(""),
  });
}
