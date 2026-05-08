import {
  DEFAULT_DIRECTOR_AUTO_APPROVAL_POINT_CODES,
  DIRECTOR_AUTO_APPROVAL_GROUPS,
  DIRECTOR_AUTO_APPROVAL_POINTS,
  normalizeDirectorAutoApprovalPointCodes,
  type DirectorAutoApprovalPreferenceSettings,
} from "@ai-novel/shared/types/autoDirectorApproval";
import { AppError } from "../../middleware/errorHandler";
import { getRequestContext } from "../../runtime/requestContext";
import { getUserSettingMap, upsertUserSettings } from "./UserSettingService";

const APPROVAL_POINT_CODES_KEY = "autoDirector.approvalPreference.approvalPointCodes";

function parsePointCodes(value: string | null | undefined, hasStoredValue: boolean) {
  if (value == null) {
    return [...DEFAULT_DIRECTOR_AUTO_APPROVAL_POINT_CODES];
  }
  if (!value.trim()) {
    return hasStoredValue ? [] : [...DEFAULT_DIRECTOR_AUTO_APPROVAL_POINT_CODES];
  }
  return normalizeDirectorAutoApprovalPointCodes(value.split(",").map((item) => item.trim()));
}

function stringifyPointCodes(values: readonly string[] | undefined): string {
  return normalizeDirectorAutoApprovalPointCodes(values).join(",");
}

function buildSettings(approvalPointCodes: readonly string[] | null | undefined): DirectorAutoApprovalPreferenceSettings {
  return {
    approvalPointCodes: normalizeDirectorAutoApprovalPointCodes(approvalPointCodes),
    approvalPoints: DIRECTOR_AUTO_APPROVAL_POINTS.map((item) => ({ ...item })),
    groups: DIRECTOR_AUTO_APPROVAL_GROUPS.map((item) => ({ ...item })),
  };
}

function resolveScopedUserId(scope?: { userId?: string }): string {
  const userId = scope?.userId?.trim() || getRequestContext()?.userId?.trim();
  if (!userId) {
    throw new AppError("未登录，请先登录。", 401);
  }
  return userId;
}

export async function getAutoDirectorApprovalPreferenceSettings(scope?: {
  userId?: string;
}): Promise<DirectorAutoApprovalPreferenceSettings> {
  const userId = resolveScopedUserId(scope);
  const entries = await getUserSettingMap(userId);
  const value = entries.get(APPROVAL_POINT_CODES_KEY);
  return buildSettings(parsePointCodes(value, entries.has(APPROVAL_POINT_CODES_KEY)));
}

export async function saveAutoDirectorApprovalPreferenceSettings(input: {
  approvalPointCodes: string[];
}, scope?: {
  userId?: string;
}): Promise<DirectorAutoApprovalPreferenceSettings> {
  const userId = resolveScopedUserId(scope);
  const nextCodes = normalizeDirectorAutoApprovalPointCodes(input.approvalPointCodes, []);
  await upsertUserSettings(userId, {
    [APPROVAL_POINT_CODES_KEY]: stringifyPointCodes(nextCodes),
  });
  return buildSettings(nextCodes);
}
