import type {
  PublishingResolvedSchedule,
  PublishingStructuredSchedule,
} from "@ai-novel/shared/types/publishing";

export interface PublishingScheduleChapterInput {
  id: string;
  order: number;
  title: string;
  volumeTitle?: string | null;
}

export interface BuiltPublishPlanItem {
  chapterId: string;
  chapterOrder: number;
  chapterTitle: string;
  volumeTitle?: string | null;
  plannedPublishTime: string;
}

export interface NormalizeStructuredScheduleInput {
  structured: PublishingStructuredSchedule;
  defaultStartDate: string;
  minChapterOrder: number;
  maxChapterOrder: number;
  timezone?: string;
}

export interface PublishPlanTimeGroup<T extends { plannedPublishTime: string }> {
  plannedPublishTime: string;
  items: T[];
}

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TIME_PATTERN = /^([01]?\d|2[0-3]):([0-5]\d)$/;
const PLANNED_TIME_PATTERN = /^\d{4}-\d{2}-\d{2} ([01]\d|2[0-3]):[0-5]\d$/;

function assertDateString(value: string, label: string): void {
  if (!DATE_PATTERN.test(value)) {
    throw new Error(`${label}必须使用 YYYY-MM-DD 格式。`);
  }
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw new Error(`${label}不是有效日期。`);
  }
}

function normalizePublishTime(value: string): string {
  const trimmed = value.trim();
  const match = trimmed.match(TIME_PATTERN);
  if (!match) {
    throw new Error("发布时间必须使用 HH:mm 格式。");
  }
  return `${match[1].padStart(2, "0")}:${match[2]}`;
}

function addDays(dateString: string, days: number): string {
  assertDateString(dateString, "起始日期");
  const [year, month, day] = dateString.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days));
  return date.toISOString().slice(0, 10);
}

export function formatPlannedPublishTime(dateString: string, publishTime: string): string {
  assertDateString(dateString, "发布日期");
  const normalizedTime = normalizePublishTime(publishTime);
  const value = `${dateString} ${normalizedTime}`;
  if (!PLANNED_TIME_PATTERN.test(value)) {
    throw new Error("计划发布时间必须使用 YYYY-MM-DD HH:mm 格式。");
  }
  return value;
}

export function getNextDateStringInTimeZone(now = new Date(), timeZone = "Asia/Shanghai"): string {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = formatter.formatToParts(now);
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;
  if (!year || !month || !day) {
    return addDays(now.toISOString().slice(0, 10), 1);
  }
  return addDays(`${year}-${month}-${day}`, 1);
}

export function normalizeStructuredSchedule(input: NormalizeStructuredScheduleInput): PublishingResolvedSchedule {
  const timezone = input.structured.timezone?.trim() || input.timezone?.trim() || "Asia/Shanghai";
  const startDate = input.structured.startDate?.trim() || input.defaultStartDate;
  assertDateString(input.defaultStartDate, "默认起始日期");
  assertDateString(startDate, "起始日期");

  const publishTime = normalizePublishTime(input.structured.publishTime);
  const chaptersPerDay = Math.max(1, Math.floor(input.structured.chaptersPerDay));
  if (!Number.isFinite(chaptersPerDay) || chaptersPerDay > 50) {
    throw new Error("每日发布章节数必须在 1 到 50 之间。");
  }

  const startChapterOrder = Math.max(
    input.minChapterOrder,
    Math.floor(input.structured.startChapterOrder ?? input.minChapterOrder),
  );
  const endChapterOrder = Math.min(
    input.maxChapterOrder,
    Math.floor(input.structured.endChapterOrder ?? input.maxChapterOrder),
  );
  if (startChapterOrder > endChapterOrder) {
    throw new Error("起始章节必须小于或等于结束章节。");
  }

  return {
    startDate,
    publishTime,
    chaptersPerDay,
    startChapterOrder,
    endChapterOrder,
    timezone,
    assumptions: input.structured.assumptions?.map((item) => item.trim()).filter(Boolean) ?? [],
  };
}

export function buildChapterPublishSchedule(input: {
  chapters: PublishingScheduleChapterInput[];
  schedule: PublishingResolvedSchedule;
}): BuiltPublishPlanItem[] {
  const selectedChapters = input.chapters
    .filter((chapter) =>
      chapter.order >= input.schedule.startChapterOrder
      && chapter.order <= input.schedule.endChapterOrder)
    .sort((left, right) => left.order - right.order);

  if (selectedChapters.length === 0) {
    throw new Error("没有可生成发布时间的章节。");
  }

  return selectedChapters.map((chapter, index) => {
    const dayOffset = Math.floor(index / input.schedule.chaptersPerDay);
    const plannedDate = addDays(input.schedule.startDate, dayOffset);
    return {
      chapterId: chapter.id,
      chapterOrder: chapter.order,
      chapterTitle: chapter.title.trim() || `第${chapter.order}章`,
      volumeTitle: chapter.volumeTitle ?? null,
      plannedPublishTime: formatPlannedPublishTime(plannedDate, input.schedule.publishTime),
    };
  });
}

export function groupPublishPlanItemsByPlannedTime<T extends { plannedPublishTime: string }>(
  items: T[],
): Array<PublishPlanTimeGroup<T>> {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    if (!PLANNED_TIME_PATTERN.test(item.plannedPublishTime)) {
      throw new Error("计划发布时间必须使用 YYYY-MM-DD HH:mm 格式。");
    }
    const existing = groups.get(item.plannedPublishTime);
    if (existing) {
      existing.push(item);
    } else {
      groups.set(item.plannedPublishTime, [item]);
    }
  }
  return Array.from(groups.entries())
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([plannedPublishTime, groupItems]) => ({
      plannedPublishTime,
      items: groupItems,
    }));
}
