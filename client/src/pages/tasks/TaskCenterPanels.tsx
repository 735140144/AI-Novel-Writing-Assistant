import type { TaskKind, TaskStatus, UnifiedTaskSummary } from "@ai-novel/shared/types/task";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  formatCheckpoint,
  formatDate,
  formatKind,
  formatStatus,
  type TaskSortMode,
  toStatusVariant,
} from "./taskCenterShared";

export function TaskCenterSummaryCards(props: {
  runningCount: number;
  queuedCount: number;
  failedCount: number;
  waitingApprovalCount: number;
  className?: string;
}) {
  return (
    <div className={props.className ?? "task-status-summary-grid grid gap-4 sm:grid-cols-2 xl:grid-cols-4"}>
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">运行中</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-semibold">{props.runningCount}</div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">排队中</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-semibold">{props.queuedCount}</div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">失败</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-semibold">{props.failedCount}</div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">待审批</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-semibold">{props.waitingApprovalCount}</div>
        </CardContent>
      </Card>
    </div>
  );
}

export function TaskCenterFiltersCard(props: {
  kind: TaskKind | "";
  status: TaskStatus | "";
  keyword: string;
  onlyAnomaly: boolean;
  sortMode: TaskSortMode;
  onKindChange: (value: TaskKind | "") => void;
  onStatusChange: (value: TaskStatus | "") => void;
  onKeywordChange: (value: string) => void;
  onOnlyAnomalyChange: (value: boolean) => void;
  onSortModeChange: (value: TaskSortMode) => void;
  cardClassName?: string;
  controlsClassName?: string;
  anomalyPillClassName?: string;
}) {
  return (
    <Card className={props.cardClassName ?? "task-filter-card"}>
      <CardHeader className="task-filter-header">
        <CardTitle className="text-base">筛选</CardTitle>
      </CardHeader>
      <CardContent className={props.controlsClassName ?? "task-filter-controls grid min-w-0 grid-cols-3 gap-2 xl:grid-cols-1"}>
        <select
          className="task-filter-kind col-start-1 row-start-1 w-full rounded-md border bg-background px-2 py-2 text-sm xl:col-auto xl:row-auto"
          value={props.kind}
          onChange={(event) => props.onKindChange(event.target.value as TaskKind | "")}
        >
          <option value="">全部类型</option>
          <option value="book_analysis">拆书分析</option>
          <option value="novel_workflow">小说创作</option>
          <option value="novel_pipeline">小说流水线</option>
          <option value="knowledge_document">知识库索引</option>
          <option value="image_generation">图片生成</option>
          <option value="style_extraction">写法提取</option>
          <option value="agent_run">Agent 运行</option>
        </select>
        <select
          className="task-filter-status col-start-2 row-start-1 w-full rounded-md border bg-background px-2 py-2 text-sm xl:col-auto xl:row-auto"
          value={props.status}
          onChange={(event) => props.onStatusChange(event.target.value as TaskStatus | "")}
        >
          <option value="">全部状态</option>
          <option value="queued">排队中</option>
          <option value="running">运行中</option>
          <option value="waiting_approval">等待审批</option>
          <option value="failed">失败</option>
          <option value="cancelled">已取消</option>
          <option value="succeeded">已完成</option>
        </select>
        <label className={props.anomalyPillClassName ?? "task-filter-pill col-start-3 row-start-1 flex items-center gap-1.5 rounded-md border bg-muted/30 px-1.5 py-2 text-xs text-muted-foreground sm:gap-2 sm:px-2 sm:text-sm xl:col-auto xl:row-auto"}>
          <input
            type="checkbox"
            checked={props.onlyAnomaly}
            onChange={(event) => props.onOnlyAnomalyChange(event.target.checked)}
          />
          仅看异常
        </label>
        <Input
          className="task-filter-keyword col-span-2 col-start-1 row-start-2 h-10 px-2 xl:col-auto xl:row-auto"
          value={props.keyword}
          onChange={(event) => props.onKeywordChange(event.target.value)}
          placeholder="标题或关联对象"
        />
        <select
          className="task-filter-sort col-start-3 row-start-2 w-full rounded-md border bg-background px-2 py-2 text-sm xl:col-auto xl:row-auto"
          value={props.sortMode}
          onChange={(event) => props.onSortModeChange(event.target.value as TaskSortMode)}
        >
          <option value="updated_desc">按更新时间排序：最新优先</option>
          <option value="updated_asc">按更新时间排序：最早优先</option>
          <option value="heartbeat_desc">按最近心跳排序：最新优先</option>
          <option value="heartbeat_asc">按最近心跳排序：最早优先</option>
          <option value="default">默认排序：失败优先</option>
        </select>
      </CardContent>
    </Card>
  );
}

export function TaskCenterListCard(props: {
  visibleRows: UnifiedTaskSummary[];
  selectedKind: TaskKind | null;
  selectedId: string | null;
  archiveLabel: string;
  archiveDisabled: boolean;
  onArchiveVisible: () => void;
  onSelectTask: (task: UnifiedTaskSummary) => void;
}) {
  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="text-base">任务列表</CardTitle>
          <Button
            size="sm"
            variant="outline"
            onClick={props.onArchiveVisible}
            disabled={props.archiveDisabled}
          >
            {props.archiveLabel}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {props.visibleRows.map((task) => {
          const isSelected = task.kind === props.selectedKind && task.id === props.selectedId;
          return (
            <button
              key={`${task.kind}:${task.id}`}
              type="button"
              className={`w-full rounded-md border p-3 text-left transition-colors ${
                isSelected ? "border-primary bg-primary/5" : "hover:bg-muted/40"
              }`}
              onClick={() => props.onSelectTask(task)}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="font-medium">{task.title}</div>
                <Badge variant={toStatusVariant(task.status)}>{formatStatus(task.status)}</Badge>
              </div>
              <div className="mt-2 text-xs text-muted-foreground">
                {formatKind(task.kind)} | 进度 {Math.round(task.progress * 100)}%
              </div>
              <div className="mt-1 text-xs text-muted-foreground">
                阶段：{task.currentStage ?? "暂无"} | 当前项：{task.currentItemLabel ?? "暂无"}
              </div>
              {task.displayStatus || task.lastHealthyStage ? (
                <div className="mt-1 text-xs text-muted-foreground">
                  状态：{task.displayStatus ?? formatStatus(task.status)} | 最近健康阶段：{task.lastHealthyStage ?? "暂无"}
                </div>
              ) : null}
              {task.kind === "novel_workflow" ? (
                <div className="mt-1 text-xs text-muted-foreground">
                  检查点：{formatCheckpoint(task.checkpointType, task.executionScopeLabel)} | 建议继续：{task.resumeAction ?? task.nextActionLabel ?? "继续主流程"}
                </div>
              ) : null}
              {task.blockingReason ? (
                <div className="mt-1 text-xs text-muted-foreground line-clamp-2">
                  原因：{task.blockingReason}
                </div>
              ) : null}
              <div className="mt-1 text-xs text-muted-foreground">
                最近心跳：{formatDate(task.heartbeatAt)} | 更新时间：{formatDate(task.updatedAt)}
              </div>
            </button>
          );
        })}
        {props.visibleRows.length === 0 ? (
          <div className="rounded-md border border-dashed p-6 text-sm text-muted-foreground">
            当前没有符合条件的任务。
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
