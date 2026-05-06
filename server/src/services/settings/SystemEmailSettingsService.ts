import { prisma } from "../../db/prisma";

const SMTP_HOST_KEY = "systemEmail.smtpHost";
const SMTP_PORT_KEY = "systemEmail.smtpPort";
const SMTP_SECURE_KEY = "systemEmail.smtpSecure";
const SMTP_USER_KEY = "systemEmail.smtpUser";
const SMTP_PASSWORD_KEY = "systemEmail.smtpPassword";
const FROM_EMAIL_KEY = "systemEmail.fromEmail";
const FROM_NAME_KEY = "systemEmail.fromName";

export interface SystemEmailSettings {
  smtpHost: string;
  smtpPort: number;
  smtpSecure: boolean;
  smtpUser: string;
  smtpPassword: string;
  fromEmail: string;
  fromName: string;
}

function trimText(value: string | null | undefined): string {
  return typeof value === "string" ? value.trim() : "";
}

function parseBool(value: string | null | undefined): boolean {
  return value?.trim() === "true";
}

function parsePort(value: string | null | undefined): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.floor(parsed) : 0;
}

function buildDefaults(): SystemEmailSettings {
  return {
    smtpHost: trimText(process.env.SMTP_HOST),
    smtpPort: parsePort(process.env.SMTP_PORT),
    smtpSecure: parseBool(process.env.SMTP_SECURE),
    smtpUser: trimText(process.env.SMTP_USER),
    smtpPassword: trimText(process.env.SMTP_PASSWORD),
    fromEmail: trimText(process.env.SMTP_FROM_EMAIL),
    fromName: trimText(process.env.SMTP_FROM_NAME),
  };
}

export async function getSystemEmailSettings(): Promise<SystemEmailSettings> {
  const defaults = buildDefaults();
  const rows = await prisma.appSetting.findMany({
    where: {
      key: {
        in: [
          SMTP_HOST_KEY,
          SMTP_PORT_KEY,
          SMTP_SECURE_KEY,
          SMTP_USER_KEY,
          SMTP_PASSWORD_KEY,
          FROM_EMAIL_KEY,
          FROM_NAME_KEY,
        ],
      },
    },
  });
  const entries = new Map(rows.map((row) => [row.key, row.value]));
  return {
    smtpHost: trimText(entries.get(SMTP_HOST_KEY)) || defaults.smtpHost,
    smtpPort: parsePort(entries.get(SMTP_PORT_KEY)) || defaults.smtpPort,
    smtpSecure: entries.has(SMTP_SECURE_KEY) ? parseBool(entries.get(SMTP_SECURE_KEY)) : defaults.smtpSecure,
    smtpUser: trimText(entries.get(SMTP_USER_KEY)) || defaults.smtpUser,
    smtpPassword: trimText(entries.get(SMTP_PASSWORD_KEY)) || defaults.smtpPassword,
    fromEmail: trimText(entries.get(FROM_EMAIL_KEY)) || defaults.fromEmail,
    fromName: trimText(entries.get(FROM_NAME_KEY)) || defaults.fromName,
  };
}

export async function saveSystemEmailSettings(input: Partial<SystemEmailSettings>): Promise<SystemEmailSettings> {
  const previous = await getSystemEmailSettings();
  const next: SystemEmailSettings = {
    smtpHost: input.smtpHost != null ? trimText(input.smtpHost) : previous.smtpHost,
    smtpPort: input.smtpPort != null ? Math.floor(input.smtpPort) : previous.smtpPort,
    smtpSecure: input.smtpSecure ?? previous.smtpSecure,
    smtpUser: input.smtpUser != null ? trimText(input.smtpUser) : previous.smtpUser,
    smtpPassword: input.smtpPassword != null ? trimText(input.smtpPassword) : previous.smtpPassword,
    fromEmail: input.fromEmail != null ? trimText(input.fromEmail) : previous.fromEmail,
    fromName: input.fromName != null ? trimText(input.fromName) : previous.fromName,
  };

  await Promise.all([
    prisma.appSetting.upsert({
      where: { key: SMTP_HOST_KEY },
      update: { value: next.smtpHost },
      create: { key: SMTP_HOST_KEY, value: next.smtpHost },
    }),
    prisma.appSetting.upsert({
      where: { key: SMTP_PORT_KEY },
      update: { value: String(next.smtpPort) },
      create: { key: SMTP_PORT_KEY, value: String(next.smtpPort) },
    }),
    prisma.appSetting.upsert({
      where: { key: SMTP_SECURE_KEY },
      update: { value: String(next.smtpSecure) },
      create: { key: SMTP_SECURE_KEY, value: String(next.smtpSecure) },
    }),
    prisma.appSetting.upsert({
      where: { key: SMTP_USER_KEY },
      update: { value: next.smtpUser },
      create: { key: SMTP_USER_KEY, value: next.smtpUser },
    }),
    prisma.appSetting.upsert({
      where: { key: SMTP_PASSWORD_KEY },
      update: { value: next.smtpPassword },
      create: { key: SMTP_PASSWORD_KEY, value: next.smtpPassword },
    }),
    prisma.appSetting.upsert({
      where: { key: FROM_EMAIL_KEY },
      update: { value: next.fromEmail },
      create: { key: FROM_EMAIL_KEY, value: next.fromEmail },
    }),
    prisma.appSetting.upsert({
      where: { key: FROM_NAME_KEY },
      update: { value: next.fromName },
      create: { key: FROM_NAME_KEY, value: next.fromName },
    }),
  ]);

  return next;
}

