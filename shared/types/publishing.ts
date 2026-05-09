import type { LLMProvider } from "./llm";

export type PublishingPlatform = "fanqie";

export type PublishingCredentialStatus =
  | "created"
  | "login_pending"
  | "ready"
  | "expired"
  | "invalid";

export type NovelPlatformBindingStatus =
  | "active"
  | "needs_validation"
  | "disabled";

export type PublishMode = "draft" | "publish";

export type PublishPlanStatus =
  | "draft"
  | "ready"
  | "submitting"
  | "completed"
  | "failed";

export type PublishItemStatus =
  | "unpublished"
  | "submitting"
  | "draft_box"
  | "published"
  | "failed"
  | "relogin_required";

export type PublishDispatchJobStatus =
  | "queued"
  | "leased"
  | "running"
  | "completed"
  | "failed";

export interface PublishingPlatformCredential {
  id: string;
  platform: PublishingPlatform;
  label: string;
  credentialUuid: string;
  status: PublishingCredentialStatus;
  accountId?: string | null;
  accountDisplayName?: string | null;
  lastValidatedAt?: string | null;
  lastLoginChallengeId?: string | null;
  lastLoginChallengeStatus?: string | null;
  lastLoginChallengeJson?: unknown | null;
  createdAt: string;
  updatedAt: string;
}

export interface PublishingLoginChallenge {
  id?: string | null;
  mode?: string | null;
  provider?: string | null;
  status?: string | null;
  providerStatus?: string | null;
  verificationUrl?: string | null;
  qrPayload?: string | null;
  qrCodeBase64Png?: string | null;
  qrTerminal?: string | null;
  qrCompactPayload?: string | null;
  qrCompactTerminal?: string | null;
  qrPageUrl?: string | null;
  qrImageUrl?: string | null;
  expiresAt?: string | null;
}

export interface PublishingCredentialLoginResponse {
  credential: PublishingPlatformCredential;
  challenge: PublishingLoginChallenge | null;
}

export interface NovelPlatformBinding {
  id: string;
  novelId: string;
  platform: PublishingPlatform;
  credentialId: string;
  credentialLabel: string;
  credentialStatus: PublishingCredentialStatus;
  credentialAccountDisplayName?: string | null;
  bookId: string;
  bookTitle: string;
  status: NovelPlatformBindingStatus;
  lastValidatedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PublishingProgressChapterRow {
  source: "chapter" | "draft" | string;
  order?: number | null;
  title: string;
  chapterName: string;
  itemId?: string | null;
}

export interface PublishingBindingRemoteProgress {
  bookId: string;
  bookTitle: string;
  publishedChapters: PublishingProgressChapterRow[];
  draftChapters: PublishingProgressChapterRow[];
  effectiveDraftChapters: PublishingProgressChapterRow[];
  syncedAt: string;
}

export interface PublishingKnownBookOption {
  key: string;
  credentialId: string;
  credentialLabel: string;
  bookId: string;
  bookTitle: string;
  sourceNovelId?: string | null;
  sourceNovelTitle?: string | null;
  lastUsedAt?: string | null;
}

export interface PublishingStructuredSchedule {
  startDate?: string | null;
  publishTime: string;
  chaptersPerDay: number;
  startChapterOrder?: number | null;
  endChapterOrder?: number | null;
  timezone?: string | null;
  assumptions?: string[];
}

export interface PublishingResolvedSchedule {
  startDate: string;
  publishTime: string;
  chaptersPerDay: number;
  startChapterOrder: number;
  endChapterOrder: number;
  timezone: string;
  assumptions: string[];
}

export interface PublishPlanItem {
  id: string;
  planId: string;
  chapterId: string;
  chapterOrder: number;
  chapterTitle: string;
  volumeTitle?: string | null;
  plannedPublishTime: string;
  status: PublishItemStatus;
  dispatchJobId?: string | null;
  externalJobId?: string | null;
  submittedAt?: string | null;
  publishedAt?: string | null;
  lastError?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PublishPlan {
  id: string;
  novelId: string;
  bindingId: string;
  platform: PublishingPlatform;
  mode: PublishMode;
  instruction: string;
  structuredSchedule: PublishingStructuredSchedule;
  resolvedSchedule: PublishingResolvedSchedule;
  status: PublishPlanStatus;
  items: PublishPlanItem[];
  createdAt: string;
  updatedAt: string;
}

export interface DeletePublishPlanResponse {
  planId: string;
  deletedItemCount: number;
}

export interface PublishDispatchJob {
  id: string;
  requestId: string;
  externalJobId?: string | null;
  planId?: string | null;
  bindingId: string;
  platform: PublishingPlatform;
  mode: PublishMode;
  plannedPublishTime: string;
  status: PublishDispatchJobStatus;
  credentialUuid: string;
  bookId: string;
  bookTitle: string;
  chapterCount: number;
  result?: unknown | null;
  lastError?: string | null;
  submittedAt?: string | null;
  completedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PublishingWorkspaceResponse {
  credentials: PublishingPlatformCredential[];
  knownBooks: PublishingKnownBookOption[];
  binding: NovelPlatformBinding | null;
  activePlan: PublishPlan | null;
  recentJobs: PublishDispatchJob[];
}

export interface PublishingAccountWorkspaceResponse {
  credentials: PublishingPlatformCredential[];
  knownBooks: PublishingKnownBookOption[];
}

export interface PublishingWorkListItem {
  bindingId: string;
  novelId: string;
  novelTitle: string;
  novelDescription?: string | null;
  completedChapterCount: number;
  publishedChapterCount: number;
  estimatedChapterCount?: number | null;
  platform: PublishingPlatform;
  credentialId: string;
  credentialLabel: string;
  credentialStatus: PublishingCredentialStatus;
  credentialAccountDisplayName?: string | null;
  bookId: string;
  bookTitle: string;
  bindingStatus: NovelPlatformBindingStatus;
  lastSyncedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PublishingWorksResponse {
  items: PublishingWorkListItem[];
}

export interface PublishingWorkDetailResponse {
  binding: NovelPlatformBinding;
  novel: {
    id: string;
    title: string;
    description?: string | null;
    estimatedChapterCount?: number | null;
    completedChapterCount: number;
    chapterCount: number;
  };
  credentials: PublishingPlatformCredential[];
  knownBooks: PublishingKnownBookOption[];
  activePlan: PublishPlan | null;
  recentJobs: PublishDispatchJob[];
  remoteProgress: PublishingBindingRemoteProgress | null;
}

export interface CreatePublishingCredentialRequest {
  platform?: PublishingPlatform;
  label: string;
  credentialUuid?: string;
}

export interface UpsertNovelPlatformBindingRequest {
  platform?: PublishingPlatform;
  credentialId: string;
  bookId: string;
  bookTitle: string;
}

export interface GeneratePublishPlanRequest {
  bindingId?: string;
  chapterCount?: number;
  instruction: string;
  mode?: PublishMode;
  startChapterOrder?: number;
  endChapterOrder?: number;
  provider?: LLMProvider;
  model?: string;
  temperature?: number;
}

export interface SubmitPublishPlanRequest {
  mode?: PublishMode;
  itemIds?: string[];
  useAi?: boolean;
  dailyWordLimit?: number;
}

export interface SyncPublishingBindingProgressRequest {}
