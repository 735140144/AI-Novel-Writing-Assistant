import { prisma } from "../../db/prisma";

type UserSettingRow = {
  key: string;
  value: string;
};
type UserSettingClient = {
  findMany: (args: { where: { userId: string } }) => Promise<UserSettingRow[]>;
  upsert: (args: {
    where: { userId_key: { userId: string; key: string } };
    update: { value: string };
    create: { userId: string; key: string; value: string };
  }) => Promise<unknown>;
};

const userSettingClient = prisma as typeof prisma & { userSetting: UserSettingClient };

function isMissingTableError(error: unknown): boolean {
  return typeof error === "object"
    && error !== null
    && "code" in error
    && (error as { code?: string }).code === "P2021";
}

function isDbUnavailableError(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }
  const code = "code" in error ? (error as { code?: string }).code : undefined;
  const message = "message" in error ? String((error as { message?: unknown }).message ?? "") : "";
  return code === "P1001" || /can't reach database server/i.test(message);
}

function trimText(value: string | null | undefined): string {
  return typeof value === "string" ? value.trim() : "";
}

export async function getUserSettingMap(userId: string): Promise<Map<string, string>> {
  try {
    const rows = await userSettingClient.userSetting.findMany({
      where: { userId },
    });
    return new Map(rows.map((row) => [row.key, row.value]));
  } catch (error) {
    if (isMissingTableError(error) || isDbUnavailableError(error)) {
      return new Map();
    }
    throw error;
  }
}

export async function upsertUserSettings(
  userId: string,
  values: Record<string, string>,
): Promise<void> {
  const entries = Object.entries(values);
  try {
    await Promise.all(entries.map(([key, value]) =>
      userSettingClient.userSetting.upsert({
        where: {
          userId_key: {
            userId,
            key,
          },
        },
        update: {
          value: trimText(value),
        },
        create: {
          userId,
          key,
          value: trimText(value),
        },
      }),
    ));
  } catch (error) {
    if (isMissingTableError(error) || isDbUnavailableError(error)) {
      return;
    }
    throw error;
  }
}
