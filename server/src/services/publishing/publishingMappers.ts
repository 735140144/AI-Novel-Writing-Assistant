import type {
  NovelPlatformBinding,
  PublishDispatchJob,
  PublishPlan,
  PublishPlanItem,
  PublishingCredentialLoginResponse,
  PublishingKnownBookOption,
  PublishingLoginChallenge,
  PublishingPlatformCredential,
  PublishingResolvedSchedule,
  PublishingStructuredSchedule,
} from "@ai-novel/shared/types/publishing";

function parseJsonOrNull<T>(value: string | null | undefined): T | null {
  if (!value?.trim()) {
    return null;
  }
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

function toIso(value: Date | null | undefined): string | null {
  return value ? value.toISOString() : null;
}

export function mapPublishingCredential(row: {
  id: string;
  platform: "fanqie";
  label: string;
  credentialUuid: string;
  status: "created" | "login_pending" | "ready" | "expired" | "invalid";
  accountId: string | null;
  accountDisplayName: string | null;
  lastValidatedAt: Date | null;
  lastLoginChallengeId: string | null;
  lastLoginChallengeStatus: string | null;
  lastLoginChallengeJson: string | null;
  createdAt: Date;
  updatedAt: Date;
}): PublishingPlatformCredential {
  return {
    id: row.id,
    platform: row.platform,
    label: row.label,
    credentialUuid: row.credentialUuid,
    status: row.status,
    accountId: row.accountId,
    accountDisplayName: row.accountDisplayName,
    lastValidatedAt: toIso(row.lastValidatedAt),
    lastLoginChallengeId: row.lastLoginChallengeId,
    lastLoginChallengeStatus: row.lastLoginChallengeStatus,
    lastLoginChallengeJson: parseJsonOrNull(row.lastLoginChallengeJson),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function mapCredentialLoginResponse(input: {
  credential: Parameters<typeof mapPublishingCredential>[0];
  challenge: PublishingLoginChallenge | null;
}): PublishingCredentialLoginResponse {
  return {
    credential: mapPublishingCredential(input.credential),
    challenge: input.challenge,
  };
}

export function mapNovelPlatformBinding(row: {
  id: string;
  novelId: string;
  platform: "fanqie";
  credentialId: string;
  credential: {
    label: string;
    status: "created" | "login_pending" | "ready" | "expired" | "invalid";
    accountDisplayName?: string | null;
  };
  bookId: string;
  bookTitle: string;
  status: "active" | "needs_validation" | "disabled";
  lastValidatedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}): NovelPlatformBinding {
  return {
    id: row.id,
    novelId: row.novelId,
    platform: row.platform,
    credentialId: row.credentialId,
    credentialLabel: row.credential.label,
    credentialStatus: row.credential.status,
    credentialAccountDisplayName: row.credential.accountDisplayName ?? null,
    bookId: row.bookId,
    bookTitle: row.bookTitle,
    status: row.status,
    lastValidatedAt: toIso(row.lastValidatedAt),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function mapPublishPlanItem(row: {
  id: string;
  planId: string;
  chapterId: string;
  chapterOrder: number;
  chapterTitle: string;
  volumeTitle: string | null;
  plannedPublishTime: string;
  status: "unpublished" | "submitting" | "draft_box" | "published" | "failed" | "relogin_required";
  dispatchJobId: string | null;
  externalJobId: string | null;
  submittedAt: Date | null;
  publishedAt: Date | null;
  lastError: string | null;
  createdAt: Date;
  updatedAt: Date;
}): PublishPlanItem {
  return {
    id: row.id,
    planId: row.planId,
    chapterId: row.chapterId,
    chapterOrder: row.chapterOrder,
    chapterTitle: row.chapterTitle,
    volumeTitle: row.volumeTitle,
    plannedPublishTime: row.plannedPublishTime,
    status: row.status,
    dispatchJobId: row.dispatchJobId,
    externalJobId: row.externalJobId,
    submittedAt: toIso(row.submittedAt),
    publishedAt: toIso(row.publishedAt),
    lastError: row.lastError,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function mapPublishPlan(row: {
  id: string;
  novelId: string;
  bindingId: string;
  platform: "fanqie";
  mode: "draft" | "publish";
  instruction: string;
  structuredScheduleJson: string;
  resolvedScheduleJson: string;
  status: "draft" | "ready" | "submitting" | "completed" | "failed";
  items: Array<Parameters<typeof mapPublishPlanItem>[0]>;
  createdAt: Date;
  updatedAt: Date;
}): PublishPlan {
  return {
    id: row.id,
    novelId: row.novelId,
    bindingId: row.bindingId,
    platform: row.platform,
    mode: row.mode,
    instruction: row.instruction,
    structuredSchedule:
      parseJsonOrNull<PublishingStructuredSchedule>(row.structuredScheduleJson)
      ?? { publishTime: "08:00", chaptersPerDay: 1 },
    resolvedSchedule:
      parseJsonOrNull<PublishingResolvedSchedule>(row.resolvedScheduleJson)
      ?? {
        startDate: "1970-01-01",
        publishTime: "08:00",
        chaptersPerDay: 1,
        startChapterOrder: 1,
        endChapterOrder: 1,
        timezone: "Asia/Shanghai",
        useTimer: true,
        assumptions: [],
      },
    status: row.status,
    items: row.items.map(mapPublishPlanItem),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function mapPublishDispatchJob(row: {
  id: string;
  requestId: string;
  externalJobId: string | null;
  planId: string | null;
  bindingId: string;
  platform: "fanqie";
  mode: "draft" | "publish";
  plannedPublishTime: string;
  status: "queued" | "leased" | "running" | "completed" | "failed";
  credentialUuid: string;
  bookId: string;
  bookTitle: string;
  chapterCount: number;
  resultJson: string | null;
  lastError: string | null;
  submittedAt: Date | null;
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}): PublishDispatchJob {
  return {
    id: row.id,
    requestId: row.requestId,
    externalJobId: row.externalJobId,
    planId: row.planId,
    bindingId: row.bindingId,
    platform: row.platform,
    mode: row.mode,
    plannedPublishTime: row.plannedPublishTime,
    status: row.status,
    credentialUuid: row.credentialUuid,
    bookId: row.bookId,
    bookTitle: row.bookTitle,
    chapterCount: row.chapterCount,
    result: parseJsonOrNull(row.resultJson),
    lastError: row.lastError,
    submittedAt: toIso(row.submittedAt),
    completedAt: toIso(row.completedAt),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function mapPublishingKnownBookOption(row: {
  credentialId: string;
  credentialLabel: string;
  bookId: string;
  bookTitle: string;
  sourceNovelId?: string | null;
  sourceNovelTitle?: string | null;
  lastUsedAt?: Date | null;
}): PublishingKnownBookOption {
  return {
    key: `${row.credentialId}:${row.bookId}`,
    credentialId: row.credentialId,
    credentialLabel: row.credentialLabel,
    bookId: row.bookId,
    bookTitle: row.bookTitle,
    sourceNovelId: row.sourceNovelId ?? null,
    sourceNovelTitle: row.sourceNovelTitle ?? null,
    lastUsedAt: toIso(row.lastUsedAt),
  };
}
