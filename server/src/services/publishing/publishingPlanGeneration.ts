import type { GeneratePublishPlanRequest } from "@ai-novel/shared/types/publishing";
import { runStructuredPrompt } from "../../prompting/core/promptRunner";
import { publishingSchedulePrompt } from "../../prompting/prompts/publishing/publishingSchedule.prompts";
import {
  getNextDateStringInTimeZone,
  normalizeStructuredSchedule,
} from "./publishingSchedule";
import { normalizeOptionalPositiveInt } from "./publishingCore";

export async function parseScheduleInstruction(input: {
  novelId: string;
  instruction: string;
  chapters: Array<{ order: number }>;
  request: GeneratePublishPlanRequest;
}) {
  const minChapterOrder = Math.min(...input.chapters.map((chapter) => chapter.order));
  const maxChapterOrder = Math.max(...input.chapters.map((chapter) => chapter.order));
  const timezone = "Asia/Shanghai";
  const defaultStartDate = getNextDateStringInTimeZone(new Date(), timezone);
  const todayDate = getNextDateStringInTimeZone(
    new Date(Date.now() - 24 * 60 * 60 * 1000),
    timezone,
  );
  const result = await runStructuredPrompt({
    asset: publishingSchedulePrompt,
    promptInput: {
      instruction: input.instruction,
      todayDate,
      defaultStartDate,
      minChapterOrder,
      maxChapterOrder,
      timezone,
    },
    options: {
      provider: input.request.provider,
      model: input.request.model,
      temperature: input.request.temperature,
      novelId: input.novelId,
      stage: "publishing_schedule",
      entrypoint: "novel_publishing_workspace",
    },
  });

  const structured = {
    ...result.output,
    startChapterOrder: normalizeOptionalPositiveInt(input.request.startChapterOrder, 2000)
      ?? result.output.startChapterOrder,
    endChapterOrder: normalizeOptionalPositiveInt(input.request.endChapterOrder, 2000)
      ?? result.output.endChapterOrder,
  };

  return {
    structured,
    resolved: normalizeStructuredSchedule({
      structured,
      defaultStartDate,
      minChapterOrder,
      maxChapterOrder,
      timezone,
    }),
  };
}
