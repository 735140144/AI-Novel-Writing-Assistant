import type { PublishingKnownBookOption, PublishingPlatform } from "@ai-novel/shared/types/publishing";

interface PublishingBookBindingLike {
  credentialId: string;
  platform: PublishingPlatform;
  bookId: string;
  bookTitle: string;
  updatedAt?: string | null;
  credentialLabel?: string | null;
  sourceNovelId?: string | null;
  sourceNovelTitle?: string | null;
}

interface PublishingBookJobLike {
  credentialId: string;
  bookId: string;
  bookTitle: string;
  submittedAt?: string | null;
  credentialLabel?: string | null;
}

export interface BuiltPublishingBookOption extends PublishingKnownBookOption {
  id: string;
}

function buildOptionId(credentialId: string, bookId: string): string {
  return `${credentialId}::${bookId}`;
}

function buildOptionKey(credentialId: string, bookId: string): string {
  return `${credentialId}:${bookId}`;
}

function parseTimestamp(value?: string | null): number {
  if (!value?.trim()) {
    return 0;
  }
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function buildPublishingBookOptions(input: {
  bindings: PublishingBookBindingLike[];
  jobs: PublishingBookJobLike[];
}): BuiltPublishingBookOption[] {
  const deduped = new Map<string, BuiltPublishingBookOption & { rank: number }>();

  for (const item of input.bindings) {
    const id = buildOptionId(item.credentialId, item.bookId);
    if (deduped.has(id)) {
      continue;
    }
    deduped.set(id, {
      id,
      key: buildOptionKey(item.credentialId, item.bookId),
      credentialId: item.credentialId,
      credentialLabel: item.credentialLabel?.trim() || "番茄账号",
      bookId: item.bookId,
      bookTitle: item.bookTitle,
      sourceNovelId: item.sourceNovelId ?? null,
      sourceNovelTitle: item.sourceNovelTitle ?? null,
      lastUsedAt: item.updatedAt ?? null,
      rank: parseTimestamp(item.updatedAt),
    });
  }

  for (const item of input.jobs) {
    const id = buildOptionId(item.credentialId, item.bookId);
    if (deduped.has(id)) {
      continue;
    }
    deduped.set(id, {
      id,
      key: buildOptionKey(item.credentialId, item.bookId),
      credentialId: item.credentialId,
      credentialLabel: item.credentialLabel?.trim() || "番茄账号",
      bookId: item.bookId,
      bookTitle: item.bookTitle,
      sourceNovelId: null,
      sourceNovelTitle: null,
      lastUsedAt: item.submittedAt ?? null,
      rank: parseTimestamp(item.submittedAt),
    });
  }

  return Array.from(deduped.values())
    .sort((left, right) => right.rank - left.rank)
    .map(({ rank: _rank, ...option }) => option);
}
