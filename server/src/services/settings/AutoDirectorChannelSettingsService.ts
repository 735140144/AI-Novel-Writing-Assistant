import { AppError } from "../../middleware/errorHandler";
import { getRequestContext } from "../../runtime/requestContext";
import { getUserSettingMap, upsertUserSettings } from "./UserSettingService";

const BASE_URL_KEY = "autoDirector.baseUrl";
const DINGTALK_WEBHOOK_KEY = "autoDirector.channels.dingtalk.webhookUrl";
const DINGTALK_CALLBACK_TOKEN_KEY = "autoDirector.channels.dingtalk.callbackToken";
const DINGTALK_OPERATOR_MAP_KEY = "autoDirector.channels.dingtalk.operatorMapJson";
const DINGTALK_EVENT_TYPES_KEY = "autoDirector.channels.dingtalk.eventTypes";
const WECOM_WEBHOOK_KEY = "autoDirector.channels.wecom.webhookUrl";
const WECOM_CALLBACK_TOKEN_KEY = "autoDirector.channels.wecom.callbackToken";
const WECOM_OPERATOR_MAP_KEY = "autoDirector.channels.wecom.operatorMapJson";
const WECOM_EVENT_TYPES_KEY = "autoDirector.channels.wecom.eventTypes";

const DEFAULT_EVENT_TYPES = [
  "auto_director.approval_required",
  "auto_director.auto_approved",
  "auto_director.exception",
  "auto_director.recovered",
  "auto_director.completed",
] as const;

export interface AutoDirectorChannelConfig {
  webhookUrl: string;
  callbackToken: string;
  operatorMapJson: string;
  eventTypes: string[];
}

export interface AutoDirectorChannelSettings {
  baseUrl: string;
  dingtalk: AutoDirectorChannelConfig;
  wecom: AutoDirectorChannelConfig;
}

export interface SaveAutoDirectorChannelSettingsInput {
  baseUrl?: string;
  dingtalk?: Partial<AutoDirectorChannelConfig>;
  wecom?: Partial<AutoDirectorChannelConfig>;
}

function trimText(value: string | null | undefined): string {
  return typeof value === "string" ? value.trim() : "";
}

function hasOwn(input: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(input, key);
}

function parseEventTypes(value: string | null | undefined): string[] {
  const trimmed = trimText(value);
  if (!trimmed) {
    return [...DEFAULT_EVENT_TYPES];
  }
  const items = trimmed
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  return items.length > 0 ? Array.from(new Set(items)) : [...DEFAULT_EVENT_TYPES];
}

function stringifyEventTypes(value: string[] | undefined): string {
  const items = (value ?? [...DEFAULT_EVENT_TYPES])
    .map((item) => item.trim())
    .filter(Boolean);
  return Array.from(new Set(items)).join(",");
}

function resolveCurrentUserId(): string {
  const userId = getRequestContext()?.userId?.trim();
  if (!userId) {
    throw new AppError("未登录，请先登录。", 401);
  }
  return userId;
}

function resolveScopedUserId(scope?: { userId?: string }): string {
  return scope?.userId?.trim() || resolveCurrentUserId();
}

function resolveOptionalScopedUserId(scope?: { userId?: string }): string | null {
  return scope?.userId?.trim() || getRequestContext()?.userId?.trim() || null;
}

function buildDefaults(): AutoDirectorChannelSettings {
  return {
    baseUrl: "",
    dingtalk: {
      webhookUrl: trimText(process.env.AUTO_DIRECTOR_DINGTALK_WEBHOOK_URL),
      callbackToken: trimText(process.env.AUTO_DIRECTOR_DINGTALK_CALLBACK_TOKEN),
      operatorMapJson: trimText(process.env.AUTO_DIRECTOR_DINGTALK_OPERATOR_MAP_JSON),
      eventTypes: parseEventTypes(process.env.AUTO_DIRECTOR_DINGTALK_EVENT_TYPES),
    },
    wecom: {
      webhookUrl: trimText(process.env.AUTO_DIRECTOR_WECOM_WEBHOOK_URL),
      callbackToken: trimText(process.env.AUTO_DIRECTOR_WECOM_CALLBACK_TOKEN),
      operatorMapJson: trimText(process.env.AUTO_DIRECTOR_WECOM_OPERATOR_MAP_JSON),
      eventTypes: parseEventTypes(process.env.AUTO_DIRECTOR_WECOM_EVENT_TYPES),
    },
  };
}

function getConfiguredText(entries: Map<string, string>, key: string, fallback: string): string {
  if (entries.has(key)) {
    return trimText(entries.get(key));
  }
  return fallback;
}

function buildSettingsFromEntries(entries: Map<string, string>): AutoDirectorChannelSettings {
  const defaults = buildDefaults();
  return {
    baseUrl: getConfiguredText(entries, BASE_URL_KEY, defaults.baseUrl),
    dingtalk: {
      webhookUrl: getConfiguredText(entries, DINGTALK_WEBHOOK_KEY, defaults.dingtalk.webhookUrl),
      callbackToken: getConfiguredText(entries, DINGTALK_CALLBACK_TOKEN_KEY, defaults.dingtalk.callbackToken),
      operatorMapJson: getConfiguredText(entries, DINGTALK_OPERATOR_MAP_KEY, defaults.dingtalk.operatorMapJson),
      eventTypes: entries.has(DINGTALK_EVENT_TYPES_KEY)
        ? parseEventTypes(entries.get(DINGTALK_EVENT_TYPES_KEY))
        : [...defaults.dingtalk.eventTypes],
    },
    wecom: {
      webhookUrl: getConfiguredText(entries, WECOM_WEBHOOK_KEY, defaults.wecom.webhookUrl),
      callbackToken: getConfiguredText(entries, WECOM_CALLBACK_TOKEN_KEY, defaults.wecom.callbackToken),
      operatorMapJson: getConfiguredText(entries, WECOM_OPERATOR_MAP_KEY, defaults.wecom.operatorMapJson),
      eventTypes: entries.has(WECOM_EVENT_TYPES_KEY)
        ? parseEventTypes(entries.get(WECOM_EVENT_TYPES_KEY))
        : [...defaults.wecom.eventTypes],
    },
  };
}

export function resolveAutoDirectorBaseUrl(baseUrl: string | null | undefined): string {
  const trimmed = trimText(baseUrl);
  return trimmed || trimText(process.env.APP_BASE_URL) || trimText(process.env.CORS_ORIGIN) || "";
}

export async function getAutoDirectorChannelSettings(scope?: {
  userId?: string;
}): Promise<AutoDirectorChannelSettings> {
  const userId = resolveOptionalScopedUserId(scope);
  if (!userId) {
    return buildDefaults();
  }
  const entries = await getUserSettingMap(userId);
  return buildSettingsFromEntries(entries);
}

export async function saveAutoDirectorChannelSettings(
  input: SaveAutoDirectorChannelSettingsInput,
  scope?: {
    userId?: string;
  },
): Promise<AutoDirectorChannelSettings> {
  const userId = resolveScopedUserId(scope);
  const previous = await getAutoDirectorChannelSettings({ userId });
  const next: AutoDirectorChannelSettings = {
    baseUrl: hasOwn(input, "baseUrl") ? trimText(input.baseUrl) : previous.baseUrl,
    dingtalk: {
      webhookUrl: input.dingtalk && hasOwn(input.dingtalk, "webhookUrl")
        ? trimText(input.dingtalk.webhookUrl)
        : previous.dingtalk.webhookUrl,
      callbackToken: input.dingtalk && hasOwn(input.dingtalk, "callbackToken")
        ? trimText(input.dingtalk.callbackToken)
        : previous.dingtalk.callbackToken,
      operatorMapJson: input.dingtalk && hasOwn(input.dingtalk, "operatorMapJson")
        ? trimText(input.dingtalk.operatorMapJson)
        : previous.dingtalk.operatorMapJson,
      eventTypes: input.dingtalk && hasOwn(input.dingtalk, "eventTypes")
        ? parseEventTypes(stringifyEventTypes(input.dingtalk.eventTypes))
        : previous.dingtalk.eventTypes,
    },
    wecom: {
      webhookUrl: input.wecom && hasOwn(input.wecom, "webhookUrl")
        ? trimText(input.wecom.webhookUrl)
        : previous.wecom.webhookUrl,
      callbackToken: input.wecom && hasOwn(input.wecom, "callbackToken")
        ? trimText(input.wecom.callbackToken)
        : previous.wecom.callbackToken,
      operatorMapJson: input.wecom && hasOwn(input.wecom, "operatorMapJson")
        ? trimText(input.wecom.operatorMapJson)
        : previous.wecom.operatorMapJson,
      eventTypes: input.wecom && hasOwn(input.wecom, "eventTypes")
        ? parseEventTypes(stringifyEventTypes(input.wecom.eventTypes))
        : previous.wecom.eventTypes,
    },
  };

  await upsertUserSettings(userId, {
    [BASE_URL_KEY]: next.baseUrl,
    [DINGTALK_WEBHOOK_KEY]: next.dingtalk.webhookUrl,
    [DINGTALK_CALLBACK_TOKEN_KEY]: next.dingtalk.callbackToken,
    [DINGTALK_OPERATOR_MAP_KEY]: next.dingtalk.operatorMapJson,
    [DINGTALK_EVENT_TYPES_KEY]: stringifyEventTypes(next.dingtalk.eventTypes),
    [WECOM_WEBHOOK_KEY]: next.wecom.webhookUrl,
    [WECOM_CALLBACK_TOKEN_KEY]: next.wecom.callbackToken,
    [WECOM_OPERATOR_MAP_KEY]: next.wecom.operatorMapJson,
    [WECOM_EVENT_TYPES_KEY]: stringifyEventTypes(next.wecom.eventTypes),
  });

  return next;
}
