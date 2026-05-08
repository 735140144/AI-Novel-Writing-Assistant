import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { z } from "zod";
import type { PromptAsset } from "../../core/promptTypes";

export const publishingScheduleOutputSchema = z.object({
  startDate: z.string().trim().nullable().optional(),
  publishTime: z.string().trim().min(1),
  chaptersPerDay: z.number().int().min(1).max(50),
  startChapterOrder: z.number().int().min(1).nullable().optional(),
  endChapterOrder: z.number().int().min(1).nullable().optional(),
  timezone: z.string().trim().nullable().optional(),
  assumptions: z.array(z.string().trim().min(1)).max(8).default([]),
});

export interface PublishingSchedulePromptInput {
  instruction: string;
  todayDate: string;
  defaultStartDate: string;
  minChapterOrder: number;
  maxChapterOrder: number;
  timezone: string;
}

export const publishingSchedulePrompt: PromptAsset<
  PublishingSchedulePromptInput,
  z.infer<typeof publishingScheduleOutputSchema>
> = {
  id: "publishing.schedule.parse",
  version: "v1",
  taskType: "planner",
  mode: "structured",
  language: "zh",
  contextPolicy: {
    maxTokensBudget: 0,
  },
  outputSchema: publishingScheduleOutputSchema,
  structuredOutputHint: {
    mode: "auto",
    note: "把用户自然语言发布节奏解析为章节发布时间表所需的结构化参数。",
  },
  render: (input) => [
    new SystemMessage([
      "你是中文网文发布计划助手。",
      "你的任务是把用户输入的发布节奏转换为稳定的 JSON 参数，供系统生成每章发布时间。",
      "",
      "硬性规则：",
      "1. 只解析发布时间表参数，不要生成章节正文。",
      "2. publishTime 必须输出 24 小时制 HH:mm，例如 08:00。",
      "3. chaptersPerDay 是每天同一发布时间提交的章节数。",
      "4. 如果用户没有明确起始日期，startDate 输出 null，让系统使用默认起始日期。",
      "5. 如果用户没有明确章节范围，startChapterOrder / endChapterOrder 输出 null，让系统使用可用章节范围。",
      "6. 不要臆造平台账号、书籍 ID 或发布状态。",
    ].join("\n")),
    new HumanMessage([
      `【用户发布节奏】${input.instruction}`,
      `【今天】${input.todayDate}`,
      `【默认起始日期】${input.defaultStartDate}`,
      `【可用章节范围】第 ${input.minChapterOrder} 章到第 ${input.maxChapterOrder} 章`,
      `【默认时区】${input.timezone}`,
      "",
      "请只返回 JSON。",
    ].join("\n")),
  ],
};
