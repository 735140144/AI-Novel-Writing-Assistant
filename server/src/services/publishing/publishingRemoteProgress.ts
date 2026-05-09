import type {
  PublishingBindingRemoteProgress,
  PublishingProgressChapterRow,
} from "@ai-novel/shared/types/publishing";
import type {
  FanqieDispatchBookProgress,
  FanqieDispatchProgressChapterRow,
} from "./FanqieDispatchClient";

function normalizeChapterName(row: { chapterName: string; title: string }): string {
  return row.chapterName.trim() || row.title.trim();
}

function buildOrderSet(rows: Array<{ order?: number | null }>): Set<number> {
  const orders = new Set<number>();
  for (const row of rows) {
    if (typeof row.order === "number" && Number.isFinite(row.order)) {
      orders.add(row.order);
    }
  }
  return orders;
}

function buildNameSet(rows: Array<{ chapterName: string; title: string }>): Set<string> {
  const names = new Set<string>();
  for (const row of rows) {
    const name = normalizeChapterName(row);
    if (name) {
      names.add(name);
    }
  }
  return names;
}

function resolveMaxOrder(rows: Array<{ order?: number | null }>): number {
  let maxOrder = 0;
  for (const row of rows) {
    if (typeof row.order === "number" && Number.isFinite(row.order) && row.order > maxOrder) {
      maxOrder = row.order;
    }
  }
  return maxOrder;
}

function buildPublishedOrderSet(rows: Array<{ order?: number | null }>): Set<number> {
  const explicitOrders = buildOrderSet(rows);
  const maxOrder = resolveMaxOrder(rows);
  if (maxOrder <= 0) {
    return explicitOrders;
  }

  const normalizedOrders = new Set<number>();
  for (let order = 1; order <= maxOrder; order += 1) {
    normalizedOrders.add(order);
  }
  return normalizedOrders;
}

function mapProgressRow(row: FanqieDispatchProgressChapterRow): PublishingProgressChapterRow {
  return {
    source: row.source,
    order: row.order ?? null,
    title: row.title,
    chapterName: row.chapterName,
    itemId: row.itemId ?? null,
  };
}

export function createPublishingRemoteProgressSnapshot(
  progress: FanqieDispatchBookProgress,
  syncedAt = new Date().toISOString(),
): PublishingBindingRemoteProgress {
  return {
    bookId: progress.bookId,
    bookTitle: progress.bookTitle,
    publishedChapters: progress.publishedChapters.map(mapProgressRow),
    draftChapters: progress.draftChapters.map(mapProgressRow),
    effectiveDraftChapters: progress.effectiveDraftChapters.map(mapProgressRow),
    syncedAt,
  };
}

export function parsePublishingRemoteProgressSnapshot(
  value: string | null | undefined,
): PublishingBindingRemoteProgress | null {
  if (!value?.trim()) {
    return null;
  }
  try {
    const parsed = JSON.parse(value) as PublishingBindingRemoteProgress;
    if (!parsed || typeof parsed !== "object") {
      return null;
    }
    if (typeof parsed.bookId !== "string" || typeof parsed.bookTitle !== "string" || typeof parsed.syncedAt !== "string") {
      return null;
    }
    return {
      bookId: parsed.bookId,
      bookTitle: parsed.bookTitle,
      publishedChapters: Array.isArray(parsed.publishedChapters) ? parsed.publishedChapters : [],
      draftChapters: Array.isArray(parsed.draftChapters) ? parsed.draftChapters : [],
      effectiveDraftChapters: Array.isArray(parsed.effectiveDraftChapters) ? parsed.effectiveDraftChapters : [],
      syncedAt: parsed.syncedAt,
    };
  } catch {
    return null;
  }
}

export function getEffectiveRemoteProgressRows(
  progress: Pick<
    PublishingBindingRemoteProgress,
    "bookId" | "bookTitle" | "publishedChapters" | "draftChapters" | "effectiveDraftChapters"
  > | FanqieDispatchBookProgress,
) {
  const publishedMaxOrder = resolveMaxOrder(progress.publishedChapters);
  return {
    publishedOrders: buildPublishedOrderSet(progress.publishedChapters),
    publishedNames: buildNameSet(progress.publishedChapters),
    effectiveDraftOrders: buildOrderSet(progress.effectiveDraftChapters),
    effectiveDraftNames: buildNameSet(progress.effectiveDraftChapters),
    publishedCount: Math.max(progress.publishedChapters.length, publishedMaxOrder),
    effectiveDraftCount: progress.effectiveDraftChapters.length,
  };
}
