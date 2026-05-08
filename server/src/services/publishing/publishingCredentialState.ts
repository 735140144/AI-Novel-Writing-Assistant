import type {
  PublishingCredentialStatus,
  PublishingLoginChallenge,
} from "@ai-novel/shared/types/publishing";

export function resolveCredentialLabel(input: {
  currentLabel: string;
  accountDisplayName?: string | null;
  status: PublishingCredentialStatus;
}): string {
  const nextLabel = input.accountDisplayName?.trim();
  if (input.status === "ready" && nextLabel) {
    return nextLabel;
  }
  return input.currentLabel;
}

export function resolveCredentialChallengeForStatus<T extends PublishingLoginChallenge | null>(input: {
  status: PublishingCredentialStatus;
  challenge: T;
}): T | null {
  if (input.status === "ready") {
    return null;
  }
  return input.challenge ?? null;
}
