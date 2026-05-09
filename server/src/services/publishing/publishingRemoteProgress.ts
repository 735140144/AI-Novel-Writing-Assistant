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

function normalizeDateTimeParts(year: string, month: string, day: string, hour = "00", minute = "00"): string | null {
  const isoDate = `${year}-${month}-${day}`;
  const date = new Date(`${isoDate}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== isoDate) {
    return null;
  }
  const numericHour = Number.parseInt(hour, 10);
  const numericMinute = Number.parseInt(minute, 10);
  if (
    !Number.isInteger(numericHour)
    || numericHour < 0
    || numericHour > 23
    || !Number.isInteger(numericMinute)
    || numericMinute < 0
    || numericMinute > 59
  ) {
    return null;
  }
  return `${isoDate} ${String(numericHour).padStart(2, "0")}:${String(numericMinute).padStart(2, "0")}`;
}

function normalizeUnixTimestamp(value: string | number): string | null {
  const raw = typeof value === "number" ? String(value) : value.trim();
  if (!/^\d{10}(\d{3})?$/.test(raw)) {
    return null;
  }
  const timestamp = Number.parseInt(raw, 10);
  if (!Number.isFinite(timestamp)) {
    return null;
  }
  const milliseconds = raw.length === 13 ? timestamp : timestamp * 1000;
  const date = new Date(milliseconds);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return `${date.toISOString().slice(0, 10)} ${date.toISOString().slice(11, 16)}`;
}

export function normalizeRemoteScheduledPublishTime(value: unknown): string | null {
  if (typeof value === "number") {
    return normalizeUnixTimestamp(value);
  }
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const unixTimestamp = normalizeUnixTimestamp(trimmed);
  if (unixTimestamp) {
    return unixTimestamp;
  }

  let match = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})[ T]([0-2]?\d):([0-5]\d)(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:?\d{2})?$/);
  if (match) {
    return normalizeDateTimeParts(match[1], match[2], match[3], match[4], match[5]);
  }

  match = trimmed.match(/^(\d{4})(\d{2})(\d{2})[ T]?([0-2]\d):?([0-5]\d)$/);
  if (match) {
    return normalizeDateTimeParts(match[1], match[2], match[3], match[4], match[5]);
  }

  match = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (match) {
    return normalizeDateTimeParts(match[1], match[2], match[3]);
  }

  match = trimmed.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (match) {
    return normalizeDateTimeParts(match[1], match[2], match[3]);
  }

  return null;
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
  const rawRow = row as unknown as Record<string, unknown>;
  return {
    source: row.source,
    order: row.order ?? null,
    title: row.title,
    chapterName: row.chapterName,
    itemId: row.itemId ?? null,
    timerTime: normalizeRemoteScheduledPublishTime(
      rawRow.timerTime
      ?? rawRow.timer_time
      ?? rawRow.plannedPublishTime
      ?? rawRow.planned_publish_time
      ?? rawRow.publishTime
      ?? rawRow.publish_time,
    ),
  };
}

function mapProgressRows(rows: FanqieDispatchProgressChapterRow[]): PublishingProgressChapterRow[] {
  return rows.map(mapProgressRow);
}

function pickLatestPlannedTime(values: Array<string | null | undefined>): string | null {
  let latest: string | null = null;
  for (const value of values) {
    const normalized = normalizeRemoteScheduledPublishTime(value);
    if (!normalized) {
      continue;
    }
    if (!latest || normalized > latest) {
      latest = normalized;
    }
  }
  return latest;
}

function getScheduledPublishTimesFromRows(rows: Array<{ timerTime?: string | null }>): string[] {
  const values: string[] = [];
  for (const row of rows) {
    const normalized = normalizeRemoteScheduledPublishTime(row.timerTime);
    if (normalized) {
      values.push(normalized);
    }
  }
  return values;
}

export function getLatestRemoteScheduledPublishTime(
  progress: (
    Pick<PublishingBindingRemoteProgress, "publishedChapters" | "draftChapters" | "latestScheduledPublishTime">
    | FanqieDispatchBookProgress
  ),
): string | null {
  const publishedRows = "publishedChapters" in progress ? progress.publishedChapters : [];
  const draftRows = "draftChapters" in progress ? progress.draftChapters : [];
  const mappedRows = [...publishedRows, ...draftRows].map((row) => {
    const rawRow = row as unknown as Record<string, unknown>;
    return {
      timerTime: normalizeRemoteScheduledPublishTime(
        rawRow.timerTime
        ?? rawRow.timer_time
        ?? rawRow.plannedPublishTime
        ?? rawRow.planned_publish_time
        ?? rawRow.publishTime
        ?? rawRow.publish_time,
      ),
    };
  });

  const topLevelCandidates = [
    "latestScheduledPublishTime" in progress ? progress.latestScheduledPublishTime : null,
    "latest_scheduled_publish_time" in progress ? progress.latest_scheduled_publish_time : null,
    "lastPlannedPublishTime" in progress ? progress.lastPlannedPublishTime : null,
    "last_planned_publish_time" in progress ? progress.last_planned_publish_time : null,
  ];

  return pickLatestPlannedTime([
    ...topLevelCandidates,
    ...getScheduledPublishTimesFromRows(mappedRows),
  ]);
}

export function mergeRemoteContinuationState(input: {
  localOccupiedPlannedTime?: string | null;
  localOccupiedCount?: number;
  remoteProgress?: PublishingBindingRemoteProgress | FanqieDispatchBookProgress | null;
}) {
  let occupiedPlannedTime = normalizeRemoteScheduledPublishTime(input.localOccupiedPlannedTime) ?? null;
  let occupiedCount = Math.max(0, Math.floor(input.localOccupiedCount ?? 0));
  const remoteScheduledTime = input.remoteProgress
    ? getLatestRemoteScheduledPublishTime(input.remoteProgress)
    : null;
  if (remoteScheduledTime && (!occupiedPlannedTime || remoteScheduledTime > occupiedPlannedTime)) {
    occupiedPlannedTime = remoteScheduledTime;
    if (occupiedCount <= 0) {
      occupiedCount = 1;
    }
  }
  return {
    occupiedPlannedTime,
    occupiedCount,
  };
}

export function createPublishingRemoteProgressSnapshot(
  progress: FanqieDispatchBookProgress,
  syncedAt = new Date().toISOString(),
): PublishingBindingRemoteProgress {
  const publishedChapters = mapProgressRows(progress.publishedChapters);
  const draftChapters = mapProgressRows(progress.draftChapters);
  const effectiveDraftChapters = mapProgressRows(progress.effectiveDraftChapters);
  return {
    bookId: progress.bookId,
    bookTitle: progress.bookTitle,
    publishedChapters,
    draftChapters,
    effectiveDraftChapters,
    latestScheduledPublishTime: getLatestRemoteScheduledPublishTime({
      ...progress,
      draftChapters,
    }),
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
    const publishedChapters = Array.isArray(parsed.publishedChapters)
      ? parsed.publishedChapters.map((row) => ({
        ...row,
        timerTime: normalizeRemoteScheduledPublishTime(row?.timerTime),
      }))
      : [];
    const draftChapters = Array.isArray(parsed.draftChapters)
      ? parsed.draftChapters.map((row) => ({
        ...row,
        timerTime: normalizeRemoteScheduledPublishTime(row?.timerTime),
      }))
      : [];
    const effectiveDraftChapters = Array.isArray(parsed.effectiveDraftChapters)
      ? parsed.effectiveDraftChapters.map((row) => ({
        ...row,
        timerTime: normalizeRemoteScheduledPublishTime(row?.timerTime),
      }))
      : [];
    return {
      bookId: parsed.bookId,
      bookTitle: parsed.bookTitle,
      publishedChapters,
      draftChapters,
      effectiveDraftChapters,
      latestScheduledPublishTime: pickLatestPlannedTime([
        normalizeRemoteScheduledPublishTime(parsed.latestScheduledPublishTime),
        ...getScheduledPublishTimesFromRows(draftChapters),
      ]),
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
