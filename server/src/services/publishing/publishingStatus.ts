import type {
  PublishDispatchJobStatus,
  PublishItemStatus,
  PublishMode,
} from "@ai-novel/shared/types/publishing";

const SUBMITTING_DISPATCH_STATUSES = new Set<PublishDispatchJobStatus>([
  "queued",
  "leased",
  "running",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function extractErrorCode(value: unknown): string | null {
  if (!isRecord(value)) {
    return null;
  }
  const directCode = value.code;
  if (typeof directCode === "string" && directCode.trim()) {
    return directCode.trim();
  }
  const error = value.error;
  if (isRecord(error) && typeof error.code === "string" && error.code.trim()) {
    return error.code.trim();
  }
  return null;
}

export function isCredentialReloginError(value: unknown): boolean {
  if (extractErrorCode(value) === "CREDENTIAL_RELOGIN_REQUIRED") {
    return true;
  }
  if (!isRecord(value)) {
    return false;
  }
  const relogin = value.relogin;
  return isRecord(relogin)
    && relogin.action === "bootstrap_login"
    && typeof relogin.credentialUuid === "string"
    && relogin.credentialUuid.trim().length > 0;
}

export function resolveDispatchErrorItemStatus(value: unknown): PublishItemStatus {
  return isCredentialReloginError(value) ? "relogin_required" : "failed";
}

export function mapDispatchJobStatusToItemStatus(input: {
  mode: PublishMode;
  dispatchStatus: PublishDispatchJobStatus;
  error?: unknown;
}): PublishItemStatus {
  if (SUBMITTING_DISPATCH_STATUSES.has(input.dispatchStatus)) {
    return "submitting";
  }
  if (input.dispatchStatus === "failed") {
    return input.error === undefined ? "failed" : resolveDispatchErrorItemStatus(input.error);
  }
  if (input.mode === "publish") {
    return "published";
  }
  return "draft_box";
}
