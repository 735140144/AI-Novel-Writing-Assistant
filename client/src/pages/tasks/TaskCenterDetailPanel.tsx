import type {
  AutoDirectorAction,
  AutoDirectorFollowUpDetail,
} from "@ai-novel/shared/types/autoDirectorFollowUp";
import type { UnifiedTaskDetail } from "@ai-novel/shared/types/task";
import type { NovelWorkflowMilestone } from "@ai-novel/shared/types/novelWorkflow";
import { Link } from "react-router-dom";
import LLMSelector, { type LLMSelectorValue } from "@/components/common/LLMSelector";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import OpenInCreativeHubButton from "@/components/creativeHub/OpenInCreativeHubButton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ARCHIVABLE_STATUSES,
  followUpActionVariant,
  formatCheckpoint,
  formatDate,
  formatFollowUpPriority,
  formatKind,
  formatResumeTarget,
  formatStatus,
  formatTokenCount,
  toStatusVariant,
} from "./taskCenterShared";

interface TaskCenterDetailPanelProps {
  navigateTo: (to: string) => void;
  selectedTask: UnifiedTaskDetail | null | undefined;
  selectedAutoDirectorFollowUp: AutoDirectorFollowUpDetail | null;
  isAutoDirectorTask: boolean;
  isActiveAutoDirectorTask: boolean;
  canResumeFront10AutoExecution: boolean;
  needsCandidateSelection: boolean;
  selectedTaskNoticeLabel?: string | null;
  selectedTaskNoticeRoute?: string | null;
  selectedTaskChapterTitleWarningLabel?: string | null;
  selectedTaskHasChapterTitleFailure: boolean;
  selectedTaskFailureRepairRoute?: string | null;
  chapterTitleRepairPending: boolean;
  retryOverride: LLMSelectorValue;
  canRetryWithSelectedModel: boolean;
  llmProvider: string;
  llmModel: string;
  continuePending: boolean;
  retryPending: boolean;
  cancelPending: boolean;
  archivePending: boolean;
  followUpActionPending: boolean;
  onRetryOverrideChange: (value: LLMSelectorValue) => void;
  onStartChapterTitleRepair: () => void;
  onFollowUpAction: (action: AutoDirectorAction) => void;
  onContinueCandidateSelection: () => void;
  onContinueFront10: () => void;
  onContinueTask: () => void;
  onRetryOriginal: () => void;
  onRetryWithSelectedModel: () => void;
  onCancel: () => void;
  onArchive: () => void;
}

export default function TaskCenterDetailPanel(props: TaskCenterDetailPanelProps) {
  const {
    selectedTask,
    selectedAutoDirectorFollowUp,
    isAutoDirectorTask,
    isActiveAutoDirectorTask,
    canResumeFront10AutoExecution,
    needsCandidateSelection,
    selectedTaskNoticeLabel,
    selectedTaskNoticeRoute,
    selectedTaskChapterTitleWarningLabel,
    selectedTaskHasChapterTitleFailure,
    selectedTaskFailureRepairRoute,
    chapterTitleRepairPending,
    retryOverride,
    canRetryWithSelectedModel,
    llmProvider,
    llmModel,
    continuePending,
    retryPending,
    cancelPending,
    archivePending,
    followUpActionPending,
    onRetryOverrideChange,
    onStartChapterTitleRepair,
    onFollowUpAction,
    onContinueCandidateSelection,
    onContinueFront10,
    onContinueTask,
    onRetryOriginal,
    onRetryWithSelectedModel,
    onCancel,
    onArchive,
    navigateTo,
  } = props;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">任务详情</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {selectedTask ? (
          <>
            <div className="space-y-1">
              <div className="font-medium">{selectedTask.title}</div>
              <div className="text-xs text-muted-foreground">
                {formatKind(selectedTask.kind)} | 归属：{selectedTask.ownerLabel}
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge variant={toStatusVariant(selectedTask.status)}>{formatStatus(selectedTask.status)}</Badge>
              <Badge variant="outline">进度 {Math.round(selectedTask.progress * 100)}%</Badge>
            </div>
            <div className="space-y-1 text-muted-foreground">
              <div>展示状态：{selectedTask.displayStatus ?? formatStatus(selectedTask.status)}</div>
              <div>当前阶段：{selectedTask.currentStage ?? "暂无"}</div>
              <div>当前项：{selectedTask.currentItemLabel ?? "暂无"}</div>
              {selectedTask.kind === "novel_workflow" ? (
                <>
                  <div>最近检查点：{formatCheckpoint(selectedTask.checkpointType, selectedTask.executionScopeLabel)}</div>
                  <div>恢复目标页：{formatResumeTarget(selectedTask.resumeTarget)}</div>
                  <div>建议继续：{selectedTask.resumeAction ?? selectedTask.nextActionLabel ?? "继续小说主流程"}</div>
                  <div>最近健康阶段：{selectedTask.lastHealthyStage ?? "暂无"}</div>
                </>
              ) : null}
              {selectedTask.blockingReason ? (
                <div>阻塞原因：{selectedTask.blockingReason}</div>
              ) : null}
              <div>最近心跳：{formatDate(selectedTask.heartbeatAt)}</div>
              <div>开始时间：{formatDate(selectedTask.startedAt)}</div>
              <div>结束时间：{formatDate(selectedTask.finishedAt)}</div>
              <div>重试计数：{selectedTask.retryCountLabel}</div>
              {(selectedTask.provider || selectedTask.model) ? (
                <div>调用模型：{selectedTask.provider ?? "暂无"} / {selectedTask.model ?? "暂无"}</div>
              ) : null}
              {isAutoDirectorTask ? (
                <div>当前界面模型：{llmProvider} / {llmModel}</div>
              ) : null}
              {(selectedTask.tokenUsage || selectedTask.provider || selectedTask.model) ? (
                <>
                  <div>累计调用：{formatTokenCount(selectedTask.tokenUsage?.llmCallCount ?? 0)}</div>
                  <div>输入 Tokens：{formatTokenCount(selectedTask.tokenUsage?.promptTokens ?? 0)}</div>
                  <div>输出 Tokens：{formatTokenCount(selectedTask.tokenUsage?.completionTokens ?? 0)}</div>
                  <div>累计总 Tokens：{formatTokenCount(selectedTask.tokenUsage?.totalTokens ?? 0)}</div>
                  <div>最近记录：{formatDate(selectedTask.tokenUsage?.lastRecordedAt)}</div>
                </>
              ) : null}
            </div>
            {selectedTask.noticeCode || selectedTask.noticeSummary ? (
              <div className="rounded-md border border-amber-300/50 bg-amber-50/70 p-2 text-amber-900">
                <div className="font-medium">
                  {selectedTaskChapterTitleWarningLabel ? "当前提醒" : (selectedTask.noticeCode ?? "结果提醒")}
                </div>
                {selectedTask.noticeSummary ? (
                  <div className="mt-1 text-sm">{selectedTask.noticeSummary}</div>
                ) : null}
                {selectedTaskChapterTitleWarningLabel || selectedTaskNoticeRoute ? (
                  <div className="mt-2 flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        if (selectedTaskChapterTitleWarningLabel) {
                          onStartChapterTitleRepair();
                          return;
                        }
                        if (selectedTaskNoticeRoute) {
                          navigateTo(selectedTaskNoticeRoute);
                        }
                      }}
                      disabled={chapterTitleRepairPending}
                    >
                      {selectedTaskChapterTitleWarningLabel ?? selectedTaskNoticeLabel ?? "打开当前卷拆章"}
                    </Button>
                  </div>
                ) : null}
              </div>
            ) : null}
            {selectedTask.failureCode || selectedTask.failureSummary ? (
              <div className="rounded-md border border-amber-300/50 bg-amber-50/70 p-2 text-amber-900">
                <div className="font-medium">
                  {selectedTaskHasChapterTitleFailure ? "当前提醒" : (selectedTask.failureCode ?? "任务异常")}
                </div>
                {selectedTask.failureSummary ? (
                  <div className="mt-1 text-sm">{selectedTask.failureSummary}</div>
                ) : null}
                {selectedTaskChapterTitleWarningLabel || selectedTaskFailureRepairRoute ? (
                  <div className="mt-2 flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        if (selectedTaskChapterTitleWarningLabel) {
                          onStartChapterTitleRepair();
                          return;
                        }
                        if (selectedTaskFailureRepairRoute) {
                          navigateTo(selectedTaskFailureRepairRoute);
                        }
                      }}
                      disabled={chapterTitleRepairPending}
                    >
                      {selectedTaskChapterTitleWarningLabel ?? "快速修复章节标题"}
                    </Button>
                  </div>
                ) : null}
              </div>
            ) : null}
            {selectedTask.lastError && !selectedTaskHasChapterTitleFailure ? (
              <div className="rounded-md border border-destructive/30 bg-destructive/5 p-2 text-destructive">
                {selectedTask.lastError}
              </div>
            ) : null}
            {selectedTask.kind === "novel_workflow" && selectedTask.checkpointSummary ? (
              <div className="rounded-md border bg-muted/20 p-2 text-muted-foreground">
                {selectedTask.checkpointSummary}
              </div>
            ) : null}
            {selectedAutoDirectorFollowUp ? (
              <div className="rounded-md border border-primary/20 bg-primary/5 p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <div className="font-medium">当前待处理动作</div>
                  <Badge variant="outline">{selectedAutoDirectorFollowUp.reasonLabel}</Badge>
                  <Badge variant={selectedAutoDirectorFollowUp.priority === "P0" ? "destructive" : "secondary"}>
                    {formatFollowUpPriority(selectedAutoDirectorFollowUp.priority)}
                  </Badge>
                </div>
                <div className="mt-2 text-sm text-muted-foreground">
                  {selectedAutoDirectorFollowUp.followUpSummary}
                </div>
                {selectedAutoDirectorFollowUp.blockingReason ? (
                  <div className="mt-2 text-sm text-muted-foreground">
                    阻塞原因：{selectedAutoDirectorFollowUp.blockingReason}
                  </div>
                ) : null}
                {selectedAutoDirectorFollowUp.currentModel ? (
                  <div className="mt-2 text-sm text-muted-foreground">
                    当前任务模型：{selectedAutoDirectorFollowUp.currentModel}
                  </div>
                ) : null}
                <div className="mt-3 flex flex-wrap gap-2">
                  {selectedAutoDirectorFollowUp.availableActions.map((action) => (
                    <Button
                      key={action.code}
                      size="sm"
                      variant={followUpActionVariant(action)}
                      onClick={() => onFollowUpAction(action)}
                      disabled={followUpActionPending}
                    >
                      {action.label}
                    </Button>
                  ))}
                </div>
              </div>
            ) : null}
            {(selectedTask.status === "failed" || selectedTask.status === "cancelled") && isAutoDirectorTask ? (
              <div className="rounded-md border bg-muted/20 p-3">
                <div className="text-xs text-muted-foreground">使用其他模型重试</div>
                <div className="mt-2 flex flex-col gap-2">
                  <LLMSelector
                    value={retryOverride}
                    onChange={onRetryOverrideChange}
                    compact
                    showBadge={false}
                    showHelperText={false}
                  />
                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      onClick={onRetryWithSelectedModel}
                      disabled={retryPending || !canRetryWithSelectedModel}
                    >
                      使用所选模型重试
                    </Button>
                  </div>
                </div>
              </div>
            ) : null}
            <div className="flex flex-wrap gap-2">
              {!selectedAutoDirectorFollowUp && needsCandidateSelection ? (
                <Button size="sm" onClick={onContinueCandidateSelection}>
                  {selectedTask.resumeAction ?? "继续确认书级方向"}
                </Button>
              ) : null}
              {!selectedAutoDirectorFollowUp && canResumeFront10AutoExecution ? (
                <Button size="sm" onClick={onContinueFront10} disabled={continuePending}>
                  {selectedTask.resumeAction ?? `继续自动执行${selectedTask.executionScopeLabel ?? "当前章节范围"}`}
                </Button>
              ) : null}
              {!selectedAutoDirectorFollowUp
              && selectedTask.kind === "novel_workflow"
              && !needsCandidateSelection
              && !canResumeFront10AutoExecution
              && (selectedTask.status === "waiting_approval" || selectedTask.status === "queued" || selectedTask.status === "running") ? (
                <Button size="sm" onClick={onContinueTask} disabled={continuePending}>
                  {selectedTask.resumeAction ?? (isActiveAutoDirectorTask ? "查看进度" : "继续")}
                </Button>
              ) : null}
              {(selectedTask.status === "failed" || selectedTask.status === "cancelled") && (!isAutoDirectorTask || !selectedAutoDirectorFollowUp) ? (
                <Button
                  size="sm"
                  variant={isAutoDirectorTask ? "outline" : "default"}
                  onClick={onRetryOriginal}
                  disabled={retryPending}
                >
                  {isAutoDirectorTask ? "按任务原模型重试" : "重试"}
                </Button>
              ) : null}
              {(selectedTask.status === "queued" || selectedTask.status === "running" || selectedTask.status === "waiting_approval") ? (
                <Button size="sm" variant="outline" onClick={onCancel} disabled={cancelPending}>
                  取消
                </Button>
              ) : null}
              {ARCHIVABLE_STATUSES.has(selectedTask.status) ? (
                <Button size="sm" variant="outline" onClick={onArchive} disabled={archivePending}>
                  归档
                </Button>
              ) : null}
              <Button asChild size="sm" variant="outline">
                <Link to={selectedTask.sourceRoute}>打开来源页面</Link>
              </Button>
              <OpenInCreativeHubButton
                bindings={{ taskId: selectedTask.id }}
                label="在创作中枢诊断"
              />
            </div>
            <div className="space-y-2">
              <div className="font-medium">步骤状态</div>
              {selectedTask.steps.map((step) => (
                <div key={step.key} className="flex items-center justify-between rounded-md border p-2">
                  <div>{step.label}</div>
                  <Badge variant="outline">{step.status}</Badge>
                </div>
              ))}
            </div>
            {selectedTask.kind === "novel_workflow"
            && Array.isArray(selectedTask.meta.milestones)
            && selectedTask.meta.milestones.length > 0 ? (
              <div className="space-y-2">
                <div className="font-medium">里程碑历史</div>
                {(selectedTask.meta.milestones as NovelWorkflowMilestone[]).map((item) => (
                  <div key={`${item.checkpointType}:${item.createdAt}`} className="rounded-md border p-2 text-muted-foreground">
                    <div className="font-medium text-foreground">{formatCheckpoint(item.checkpointType)}</div>
                    <div className="mt-1">{item.summary}</div>
                    <div className="mt-1 text-xs">记录时间：{formatDate(item.createdAt)}</div>
                  </div>
                ))}
              </div>
            ) : null}
          </>
        ) : (
          <div className="text-muted-foreground">请选择任务查看详情。</div>
        )}
      </CardContent>
    </Card>
  );
}
