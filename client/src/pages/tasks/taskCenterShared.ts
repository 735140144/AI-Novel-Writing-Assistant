import type { AutoDirectorAction } from "@ai-novel/shared/types/autoDirectorFollowUp";
import type { TaskKind, TaskStatus, UnifiedTaskDetail, UnifiedTaskSummary } from "@ai-novel/shared/types/task";
import type {
  NovelWorkflowMilestoneType,
  NovelWorkflowResumeTarget,
} from "@ai-novel/shared/types/novelWorkflow";

export const ACTIVE_STATUSES = new Set<TaskStatus>(["queued", "running", "waiting_approval"]);
export const ANOMALY_STATUSES = new Set<TaskStatus>(["failed", "cancelled"]);
export const ARCHIVABLE_STATUSES = new Set<TaskStatus>(["succeeded", "failed", "cancelled"]);

export type TaskSortMode = "default" | "updated_desc" | "updated_asc" | "heartbeat_desc" | "heartbeat_asc";

function getTaskListPriority(status: TaskStatus): number {
  return status === "failed" ? 0 : 1;
}

function getTimestamp(value: string | null | undefined): number {
  if (!value) {
    return Number.NaN;
  }
  return new Date(value).getTime();
}

export function buildVisibleTaskRows(
  allRows: UnifiedTaskSummary[],
  options: { onlyAnomaly: boolean; sortMode: TaskSortMode },
): UnifiedTaskSummary[] {
  return (options.onlyAnomaly ? allRows.filter((item) => ANOMALY_STATUSES.has(item.status)) : allRows)
    .map((item, index) => ({ item, index }))
    .sort((left, right) => {
      if (options.sortMode !== "default") {
        const leftTime = options.sortMode.startsWith("heartbeat")
          ? getTimestamp(left.item.heartbeatAt)
          : getTimestamp(left.item.updatedAt);
        const rightTime = options.sortMode.startsWith("heartbeat")
          ? getTimestamp(right.item.heartbeatAt)
          : getTimestamp(right.item.updatedAt);
        const leftResolved = Number.isNaN(leftTime) ? -Infinity : leftTime;
        const rightResolved = Number.isNaN(rightTime) ? -Infinity : rightTime;
        const timeDiff = options.sortMode.endsWith("_asc")
          ? leftResolved - rightResolved
          : rightResolved - leftResolved;
        if (timeDiff !== 0) {
          return timeDiff;
        }
      }
      const priorityDiff = getTaskListPriority(left.item.status) - getTaskListPriority(right.item.status);
      if (priorityDiff !== 0) {
        return priorityDiff;
      }
      return left.index - right.index;
    })
    .map(({ item }) => item);
}

export function formatDate(value: string | null | undefined): string {
  if (!value) {
    return "暂无";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "暂无";
  }
  return date.toLocaleString();
}

export function formatTokenCount(value: number | null | undefined): string {
  return new Intl.NumberFormat("zh-CN").format(Math.max(0, Math.round(value ?? 0)));
}

export function formatKind(kind: TaskKind): string {
  if (kind === "book_analysis") {
    return "拆书分析";
  }
  if (kind === "novel_workflow") {
    return "小说创作";
  }
  if (kind === "novel_pipeline") {
    return "小说流水线";
  }
  if (kind === "knowledge_document") {
    return "知识库索引";
  }
  if (kind === "style_extraction") {
    return "写法提取";
  }
  if (kind === "agent_run") {
    return "Agent 运行";
  }
  return "图片生成";
}

export function formatCheckpoint(checkpoint: NovelWorkflowMilestoneType | null | undefined, scopeLabel?: string | null): string {
  const resolvedScopeLabel = scopeLabel?.trim() || "前 10 章";
  if (checkpoint === "rewrite_snapshot_created") {
    return "重写前备份已创建";
  }
  if (checkpoint === "candidate_selection_required") {
    return "等待确认书级方向";
  }
  if (checkpoint === "book_contract_ready") {
    return "Book Contract 已就绪";
  }
  if (checkpoint === "character_setup_required") {
    return "角色准备待审核";
  }
  if (checkpoint === "volume_strategy_ready") {
    return "卷战略已就绪";
  }
  if (checkpoint === "front10_ready") {
    return `${resolvedScopeLabel}可开写`;
  }
  if (checkpoint === "chapter_batch_ready") {
    return `${resolvedScopeLabel}自动执行已暂停`;
  }
  if (checkpoint === "replan_required") {
    return "需要重规划";
  }
  if (checkpoint === "workflow_completed") {
    return "主流程完成";
  }
  return "暂无";
}

export function formatResumeTarget(target: NovelWorkflowResumeTarget | null | undefined): string {
  if (!target) {
    return "暂无";
  }
  if (target.route === "/novels/create") {
    return target.mode === "director" ? "创建页 / AI 自动导演" : "创建页";
  }
  if (target.stage === "story_macro") {
    return "小说编辑页 / 故事宏观规划";
  }
  if (target.stage === "character") {
    return "小说编辑页 / 角色准备";
  }
  if (target.stage === "outline") {
    return "小说编辑页 / 卷战略";
  }
  if (target.stage === "structured") {
    return "小说编辑页 / 节奏拆章";
  }
  if (target.stage === "chapter") {
    return "小说编辑页 / 章节执行";
  }
  if (target.stage === "pipeline") {
    return "小说编辑页 / 质量修复";
  }
  return "小说编辑页 / 项目设定";
}

export function formatStatus(status: TaskStatus): string {
  if (status === "queued") {
    return "排队中";
  }
  if (status === "running") {
    return "运行中";
  }
  if (status === "waiting_approval") {
    return "等待审批";
  }
  if (status === "succeeded") {
    return "已完成";
  }
  if (status === "failed") {
    return "失败";
  }
  return "已取消";
}

export function toStatusVariant(status: TaskStatus): "default" | "outline" | "secondary" | "destructive" {
  if (status === "running") {
    return "default";
  }
  if (status === "waiting_approval" || status === "queued") {
    return "secondary";
  }
  if (status === "failed") {
    return "destructive";
  }
  return "outline";
}

export function serializeListParams(input: {
  kind: TaskKind | "";
  status: TaskStatus | "";
  keyword: string;
  includeFinished: boolean;
}): string {
  return JSON.stringify({
    kind: input.kind || null,
    status: input.status || null,
    keyword: input.keyword.trim() || null,
    includeFinished: input.includeFinished,
  });
}

export function createIdempotencyKey(taskId: string, actionCode: string): string {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return `${taskId}:${actionCode}:${globalThis.crypto.randomUUID()}`;
  }
  return `${taskId}:${actionCode}:${Date.now()}:${Math.random().toString(36).slice(2)}`;
}

export function formatFollowUpPriority(priority: "P0" | "P1" | "P2"): string {
  if (priority === "P0") {
    return "P0 立即处理";
  }
  if (priority === "P1") {
    return "P1 尽快处理";
  }
  return "P2 可稍后处理";
}

export function followUpActionVariant(action: AutoDirectorAction): "default" | "outline" {
  return action.kind === "navigation" || action.riskLevel !== "low" ? "outline" : "default";
}

export function handleTaskFollowUpAction(input: {
  action: AutoDirectorAction;
  task: Pick<UnifiedTaskDetail, "id" | "sourceRoute"> | null | undefined;
  navigate: (target: string) => void;
  execute: (payload: { taskId: string; actionCode: string }) => void;
}): void {
  if (!input.task) {
    return;
  }
  if (input.action.kind === "navigation") {
    input.navigate(input.action.targetUrl ?? input.task.sourceRoute);
    return;
  }
  if (input.action.requiresConfirm) {
    const confirmed = window.confirm(`确认执行“${input.action.label}”？`);
    if (!confirmed) {
      return;
    }
  }
  input.execute({
    taskId: input.task.id,
    actionCode: input.action.code,
  });
}
