import type { LLMProvider } from "@ai-novel/shared/types/llm";
import type {
  ModelRouteRequestProtocol,
  ModelRouteStructuredResponseFormat,
  ModelRouteTaskType,
} from "@ai-novel/shared/types/novel";
import { prisma } from "../db/prisma";
import { getRequestContext } from "../runtime/requestContext";
import { isBuiltInProvider, PROVIDERS } from "./providers";
import type { StructuredOutputStrategy } from "./structuredOutput";

export type TaskType =
  | ModelRouteTaskType
  | "outline_planning"
  | "chapter_drafting"
  | "chapter_review"
  | "chapter_repair"
  | "summary_generation"
  | "chat"
  | "default";

const TASK_TYPE_ALIASES: Partial<Record<TaskType, ModelRouteTaskType>> = {
  outline_planning: "planner",
  chapter_drafting: "writer",
  chapter_review: "review",
  chapter_repair: "repair",
  summary_generation: "summary",
  fact_extraction: "fact_extraction",
};

export const MODEL_ROUTE_TASK_TYPES: ModelRouteTaskType[] = [
  "planner",
  "writer",
  "review",
  "repair",
  "summary",
  "fact_extraction",
  "chat",
];

export interface ResolvedModel {
  provider: LLMProvider;
  model: string;
  temperature: number;
  maxTokens?: number;
  requestProtocol: ModelRouteRequestProtocol;
  structuredResponseFormat: ModelRouteStructuredResponseFormat;
}

const DEFAULT_ROUTES: Record<ModelRouteTaskType | "default", ResolvedModel> = {
  planner: {
    provider: "deepseek",
    model: PROVIDERS.deepseek.defaultModel,
    temperature: 0.3,
    requestProtocol: "auto",
    structuredResponseFormat: "auto",
  },
  writer: {
    provider: "deepseek",
    model: PROVIDERS.deepseek.defaultModel,
    temperature: 0.8,
    requestProtocol: "auto",
    structuredResponseFormat: "auto",
  },
  review: {
    provider: "deepseek",
    model: PROVIDERS.deepseek.defaultModel,
    temperature: 0.2,
    requestProtocol: "auto",
    structuredResponseFormat: "auto",
  },
  repair: {
    provider: "deepseek",
    model: PROVIDERS.deepseek.defaultModel,
    temperature: 0.4,
    requestProtocol: "auto",
    structuredResponseFormat: "auto",
  },
  summary: {
    provider: "deepseek",
    model: PROVIDERS.deepseek.defaultModel,
    temperature: 0.2,
    requestProtocol: "auto",
    structuredResponseFormat: "auto",
  },
  fact_extraction: {
    provider: "deepseek",
    model: PROVIDERS.deepseek.defaultModel,
    temperature: 0.2,
    requestProtocol: "auto",
    structuredResponseFormat: "auto",
  },
  chat: {
    provider: "deepseek",
    model: PROVIDERS.deepseek.defaultModel,
    temperature: 0.7,
    requestProtocol: "auto",
    structuredResponseFormat: "auto",
  },
  default: {
    provider: "deepseek",
    model: PROVIDERS.deepseek.defaultModel,
    temperature: 0.7,
    requestProtocol: "auto",
    structuredResponseFormat: "auto",
  },
};

function normalizeProviderId(value: string | null | undefined): LLMProvider {
  if (typeof value !== "string") {
    return "deepseek";
  }
  const trimmed = value.trim();
  return trimmed || "deepseek";
}

function normalizeMaxTokens(provider: LLMProvider, maxTokens?: number): number | undefined {
  if (typeof maxTokens !== "number" || !Number.isFinite(maxTokens)) {
    return undefined;
  }
  const normalized = Math.floor(maxTokens);
  if (normalized < 1) {
    return undefined;
  }
  // Historical UI defaults persisted 4096 as a placeholder for "use provider defaults".
  if (normalized === 4096) {
    return undefined;
  }
  const providerLimit = isBuiltInProvider(provider) ? PROVIDERS[provider].maxTokens : undefined;
  if (typeof providerLimit === "number") {
    return Math.min(normalized, providerLimit);
  }
  return normalized;
}

export function normalizeRequestProtocol(value?: string | null): ModelRouteRequestProtocol {
  if (value === "openai_compatible" || value === "anthropic") {
    return value;
  }
  return "auto";
}

export function normalizeStructuredResponseFormat(value?: string | null): ModelRouteStructuredResponseFormat {
  if (value === "json_schema" || value === "json_object" || value === "prompt_json") {
    return value;
  }
  return "auto";
}

function normalizeRoutePreferences(input: {
  requestProtocol?: string | null;
  structuredResponseFormat?: string | null;
}): {
  requestProtocol: ModelRouteRequestProtocol;
  structuredResponseFormat: ModelRouteStructuredResponseFormat;
} {
  const requestProtocol = normalizeRequestProtocol(input.requestProtocol);
  const structuredResponseFormat = requestProtocol === "anthropic"
    ? "prompt_json"
    : normalizeStructuredResponseFormat(input.structuredResponseFormat);
  return {
    requestProtocol,
    structuredResponseFormat,
  };
}

export function toStructuredOutputStrategy(
  value: ModelRouteStructuredResponseFormat,
): StructuredOutputStrategy | null {
  return value === "auto" ? null : value;
}

function applyOverrides(
  base: ResolvedModel,
  userOverride?: {
    provider?: LLMProvider;
    model?: string;
    temperature?: number;
    maxTokens?: number;
    requestProtocol?: ModelRouteRequestProtocol;
    structuredResponseFormat?: ModelRouteStructuredResponseFormat;
  },
): ResolvedModel {
  const merged: ResolvedModel = {
    ...base,
    ...(userOverride?.provider != null && { provider: userOverride.provider }),
    ...(userOverride?.model != null && { model: userOverride.model }),
    ...(userOverride?.temperature != null && { temperature: userOverride.temperature }),
    ...(userOverride?.maxTokens != null && { maxTokens: userOverride.maxTokens }),
    ...(userOverride?.requestProtocol != null && { requestProtocol: userOverride.requestProtocol }),
    ...(userOverride?.structuredResponseFormat != null && {
      structuredResponseFormat: userOverride.structuredResponseFormat,
    }),
  };
  const routePreferences = normalizeRoutePreferences({
    requestProtocol: merged.requestProtocol,
    structuredResponseFormat: merged.structuredResponseFormat,
  });
  return {
    ...merged,
    ...routePreferences,
    maxTokens: normalizeMaxTokens(merged.provider, merged.maxTokens),
  };
}

function normalizeTaskType(taskType: TaskType): ModelRouteTaskType | "default" {
  const aliased = TASK_TYPE_ALIASES[taskType];
  if (aliased) {
    return aliased;
  }
  if (taskType === "default") {
    return "default";
  }
  if (MODEL_ROUTE_TASK_TYPES.includes(taskType as ModelRouteTaskType)) {
    return taskType as ModelRouteTaskType;
  }
  return "default";
}

function resolveScopedUserId(scope?: {
  userId?: string;
}): string | undefined {
  return scope?.userId ?? getRequestContext()?.userId;
}

export async function resolveModel(
  taskType: TaskType,
  userOverride?: {
    provider?: LLMProvider;
    model?: string;
    temperature?: number;
    maxTokens?: number;
    requestProtocol?: ModelRouteRequestProtocol;
    structuredResponseFormat?: ModelRouteStructuredResponseFormat;
  },
  scope?: {
    userId?: string;
  },
): Promise<ResolvedModel> {
  const normalizedTaskType = normalizeTaskType(taskType);
  const base = DEFAULT_ROUTES[normalizedTaskType] ?? DEFAULT_ROUTES.default;
  const scopedUserId = resolveScopedUserId(scope);

  try {
    const userScopedRow = scopedUserId
      ? await prisma.userModelRouteConfig.findUnique({
          where: {
            userId_taskType: {
              userId: scopedUserId,
              taskType: normalizedTaskType,
            },
          },
        })
      : null;
    const globalRow = await prisma.modelRouteConfig.findUnique({
      where: { taskType: normalizedTaskType },
    });
    const row = userScopedRow ?? globalRow;
    if (row) {
      const provider = normalizeProviderId(row.provider);
      const routePreferences = normalizeRoutePreferences({
        requestProtocol: "requestProtocol" in row ? row.requestProtocol : null,
        structuredResponseFormat: "structuredResponseFormat" in row ? row.structuredResponseFormat : null,
      });
      const resolved: ResolvedModel = {
        provider,
        model: row.model,
        temperature: row.temperature,
        maxTokens: normalizeMaxTokens(provider, row.maxTokens ?? undefined),
        ...routePreferences,
      };
      return applyOverrides(resolved, userOverride);
    }
  } catch {
    // table may not exist yet
  }

  return applyOverrides(base, userOverride);
}

export async function listModelRouteConfigs(): Promise<Array<{
  taskType: string;
  provider: string;
  model: string;
  temperature: number;
  maxTokens: number | null;
  requestProtocol: ModelRouteRequestProtocol;
  structuredResponseFormat: ModelRouteStructuredResponseFormat;
}>>;
export async function listModelRouteConfigs(scope: {
  userId: string;
}): Promise<Array<{
  taskType: string;
  provider: string;
  model: string;
  temperature: number;
  maxTokens: number | null;
  requestProtocol: ModelRouteRequestProtocol;
  structuredResponseFormat: ModelRouteStructuredResponseFormat;
}>>;
export async function listModelRouteConfigs(scope?: {
  userId?: string;
}): Promise<Array<{
  taskType: string;
  provider: string;
  model: string;
  temperature: number;
  maxTokens: number | null;
  requestProtocol: ModelRouteRequestProtocol;
  structuredResponseFormat: ModelRouteStructuredResponseFormat;
}>> {
  return Promise.all(MODEL_ROUTE_TASK_TYPES.map(async (taskType) => {
    const route = await resolveModel(taskType, undefined, scope);
    return {
      taskType,
      provider: route.provider,
      model: route.model,
      temperature: route.temperature,
      maxTokens: route.maxTokens ?? null,
      requestProtocol: route.requestProtocol,
      structuredResponseFormat: route.structuredResponseFormat,
    };
  }));
}

export async function upsertModelRouteConfig(
  taskType: string,
  data: {
    provider: string;
    model: string;
    temperature?: number;
    maxTokens?: number | null;
    requestProtocol?: string | null;
    structuredResponseFormat?: string | null;
  },
  scope?: {
    userId?: string;
  },
): Promise<void> {
  const normalizedTaskType = normalizeTaskType(taskType as TaskType);
  const provider = normalizeProviderId(data.provider);
  const scopedUserId = resolveScopedUserId(scope);
  const normalizedMaxTokens = normalizeMaxTokens(provider, data.maxTokens ?? undefined) ?? null;
  const {
    requestProtocol,
    structuredResponseFormat,
  } = normalizeRoutePreferences({
    requestProtocol: data.requestProtocol,
    structuredResponseFormat: data.structuredResponseFormat,
  });
  if (scopedUserId) {
    await prisma.userModelRouteConfig.upsert({
      where: {
        userId_taskType: {
          userId: scopedUserId,
          taskType: normalizedTaskType,
        },
      },
      create: {
        userId: scopedUserId,
        taskType: normalizedTaskType,
        provider,
        model: data.model,
        temperature: data.temperature ?? 0.7,
        maxTokens: normalizedMaxTokens,
        requestProtocol,
        structuredResponseFormat,
      },
      update: {
        provider,
        model: data.model,
        temperature: data.temperature ?? 0.7,
        maxTokens: normalizedMaxTokens,
        requestProtocol,
        structuredResponseFormat,
      },
    });
    return;
  }

  await prisma.modelRouteConfig.upsert({
    where: { taskType: normalizedTaskType },
    create: {
      taskType: normalizedTaskType,
      provider,
      model: data.model,
      temperature: data.temperature ?? 0.7,
      maxTokens: normalizedMaxTokens,
      requestProtocol,
      structuredResponseFormat,
    },
    update: {
      provider,
      model: data.model,
      temperature: data.temperature ?? 0.7,
      maxTokens: normalizedMaxTokens,
      requestProtocol,
      structuredResponseFormat,
    },
  });
}
