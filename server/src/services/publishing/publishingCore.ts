import type { PublishItemStatus, PublishMode } from "@ai-novel/shared/types/publishing";
import {
  PublishPlanStatus,
  PublishingPlatform,
} from "@prisma/client";
import { prisma } from "../../db/prisma";
import { AppError } from "../../middleware/errorHandler";
import type { FanqieDispatchChallenge } from "./FanqieDispatchClient";

export type PublishingTransaction = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];
export type PrismaLike = typeof prisma | PublishingTransaction;

export function safeJsonStringify(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return JSON.stringify({ error: "JSON 序列化失败。" });
  }
}

export function stringifyError(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message.trim();
  }
  if (typeof error === "string" && error.trim()) {
    return error.trim();
  }
  return "发布平台请求失败。";
}

export function sanitizeChallengeForClient(
  challenge: FanqieDispatchChallenge | null,
): FanqieDispatchChallenge | null {
  if (!challenge) {
    return null;
  }
  const { qrPageUrl: _qrPageUrl, qrImageUrl: _qrImageUrl, ...safeChallenge } = challenge;
  return safeChallenge;
}

export function parseDate(value: string | undefined): Date | undefined {
  if (!value?.trim()) {
    return undefined;
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

export function normalizePlatform(value: string | undefined | null): PublishingPlatform {
  if (!value || value === "fanqie") {
    return PublishingPlatform.fanqie;
  }
  throw new AppError("当前仅支持番茄平台。", 400);
}

export function normalizeMode(value: string | undefined | null): PublishMode {
  return value === "publish" ? "publish" : "draft";
}

export function normalizeOptionalPositiveInt(value: number | undefined, max: number): number | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (!Number.isFinite(value)) {
    return undefined;
  }
  return Math.max(1, Math.min(max, Math.floor(value)));
}

export function resolvePlanStatusFromItemStatuses(statuses: PublishItemStatus[]): PublishPlanStatus {
  if (statuses.length === 0) {
    return PublishPlanStatus.draft;
  }
  if (statuses.some((status) => status === "submitting")) {
    return PublishPlanStatus.submitting;
  }
  if (statuses.every((status) => status === "draft_box" || status === "published")) {
    return PublishPlanStatus.completed;
  }
  if (statuses.some((status) => status === "failed" || status === "relogin_required")) {
    return PublishPlanStatus.failed;
  }
  return PublishPlanStatus.ready;
}
