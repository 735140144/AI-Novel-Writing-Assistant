import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { AutoDirectorMutationActionCode } from "@ai-novel/shared/types/autoDirectorFollowUp";
import type { TaskKind, TaskStatus } from "@ai-novel/shared/types/task";
import { useNavigate, useSearchParams } from "react-router-dom";
import { continueNovelWorkflow } from "@/api/novelWorkflow";
import {
  archiveTask,
  archiveTasks,
  cancelTask,
  executeAutoDirectorFollowUpAction,
  getAutoDirectorFollowUpDetail,
  getTaskDetail,
  listTasks,
  retryTask,
} from "@/api/tasks";
import { queryKeys } from "@/api/queryKeys";
import type { LLMSelectorValue } from "@/components/common/LLMSelector";
import { toast } from "@/components/ui/toast";
import { resolveWorkflowContinuationFeedback } from "@/lib/novelWorkflowContinuation";
import { useDirectorChapterTitleRepair } from "@/hooks/useDirectorChapterTitleRepair";
import { syncKnownTaskCaches } from "@/lib/taskQueryCache";
import {
  buildTaskNoticeRoute,
  isChapterTitleDiversitySummary,
  parseDirectorTaskNotice,
  resolveChapterTitleWarning,
} from "@/lib/directorTaskNotice";
import { canContinueFront10AutoExecution, getCandidateSelectionLink, requiresCandidateSelection } from "@/lib/novelWorkflowTaskUi";
import { useLLMStore } from "@/store/llmStore";
import TaskCenterDetailPanel from "./TaskCenterDetailPanel";
import { TaskCenterFiltersCard, TaskCenterListCard, TaskCenterSummaryCards } from "./TaskCenterPanels";
import {
  ACTIVE_STATUSES,
  buildVisibleTaskRows,
  createIdempotencyKey,
  handleTaskFollowUpAction,
  serializeListParams,
  type TaskSortMode,
} from "./taskCenterShared";

export default function TaskCenterPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const llm = useLLMStore();
  const [searchParams, setSearchParams] = useSearchParams();
  const [kind, setKind] = useState<TaskKind | "">("");
  const [status, setStatus] = useState<TaskStatus | "">("");
  const [keyword, setKeyword] = useState("");
  const [onlyAnomaly, setOnlyAnomaly] = useState(false);
  const [sortMode, setSortMode] = useState<TaskSortMode>("updated_desc");
  const [retryOverride, setRetryOverride] = useState<LLMSelectorValue>({
    provider: llm.provider,
    model: llm.model,
    temperature: llm.temperature,
  });

  const selectedKind = (searchParams.get("kind") as TaskKind | null) ?? null;
  const selectedId = searchParams.get("id");
  const includeFinished = Boolean(status);
  const listParamsKey = serializeListParams({ kind, status, keyword, includeFinished });

  const listQuery = useQuery({
    queryKey: queryKeys.tasks.list(listParamsKey),
    queryFn: () =>
      listTasks({
        kind: kind || undefined,
        status: status || undefined,
        keyword: keyword.trim() || undefined,
        includeFinished: status ? undefined : false,
        limit: 80,
      }),
    refetchInterval: (query) => {
      const rows = query.state.data?.data?.items ?? [];
      return rows.some((item) => ACTIVE_STATUSES.has(item.status)) ? 4000 : false;
    },
  });

  const allRows = listQuery.data?.data?.items ?? [];
  const visibleRows = useMemo(
    () => buildVisibleTaskRows(allRows, { onlyAnomaly, sortMode }),
    [allRows, onlyAnomaly, sortMode],
  );

  const detailQuery = useQuery({
    queryKey: queryKeys.tasks.detail(selectedKind ?? "none", selectedId ?? "none"),
    queryFn: () => getTaskDetail(selectedKind as TaskKind, selectedId as string),
    enabled: Boolean(selectedKind && selectedId),
    retry: false,
    refetchInterval: (query) => {
      const task = query.state.data?.data;
      return task && ACTIVE_STATUSES.has(task.status) ? 4000 : false;
    },
  });

  useEffect(() => {
    if (!selectedKind || !selectedId) {
      if (visibleRows.length > 0) {
        const fallback = visibleRows[0];
        setSearchParams((prev) => {
          const next = new URLSearchParams(prev);
          next.set("kind", fallback.kind);
          next.set("id", fallback.id);
          return next;
        });
      }
      return;
    }
    const exists = visibleRows.some((item) => item.kind === selectedKind && item.id === selectedId);
    if (!exists && visibleRows.length > 0) {
      const fallback = visibleRows[0];
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        next.set("kind", fallback.kind);
        next.set("id", fallback.id);
        return next;
      });
    }
  }, [selectedKind, selectedId, setSearchParams, visibleRows]);

  const runningCount = allRows.filter((item) => item.status === "running").length;
  const queuedCount = allRows.filter((item) => item.status === "queued").length;
  const failedCount = allRows.filter((item) => item.status === "failed").length;
  const waitingApprovalCount = allRows.filter((item) => item.status === "waiting_approval").length;
  const archivableFinishedRows = visibleRows.filter((task) => task.status === "succeeded" || task.status === "cancelled");

  const invalidateTaskQueries = async () => {
    await queryClient.invalidateQueries({ queryKey: ["tasks"] });
    await queryClient.invalidateQueries({ queryKey: queryKeys.autoDirectorFollowUps.overview });
  };

  const retryMutation = useMutation({
    mutationFn: (payload: {
      kind: TaskKind;
      id: string;
      llmOverride?: {
        provider?: typeof llm.provider;
        model?: string;
        temperature?: number;
      };
      resume?: boolean;
    }) => retryTask(payload.kind, payload.id, {
      llmOverride: payload.llmOverride,
      resume: payload.resume,
    }),
    onSuccess: async (response, variables) => {
      const task = response.data;
      syncKnownTaskCaches(queryClient, task);
      await invalidateTaskQueries();
      if (task) {
        setSearchParams((prev) => {
          const next = new URLSearchParams(prev);
          next.set("kind", task.kind);
          next.set("id", task.id);
          return next;
        });
      }
      toast.success(
        variables.llmOverride
          ? `已切换到 ${variables.llmOverride.provider ?? "当前提供商"} / ${variables.llmOverride.model ?? "当前模型"} 并重试任务`
          : "任务已重新入队",
      );
    },
  });

  const cancelMutation = useMutation({
    mutationFn: (payload: { kind: TaskKind; id: string }) => cancelTask(payload.kind, payload.id),
    onSuccess: async () => {
      await invalidateTaskQueries();
      toast.success("任务取消请求已提交");
    },
  });

  const continueWorkflowMutation = useMutation({
    mutationFn: (payload: { taskId: string; mode?: "auto_execute_range" }) => continueNovelWorkflow(
      payload.taskId,
      payload.mode ? { continuationMode: payload.mode } : undefined,
    ),
    onSuccess: async (response, variables) => {
      await invalidateTaskQueries();
      const task = response.data;
      const feedback = resolveWorkflowContinuationFeedback(task, {
        mode: variables.mode,
      });
      if (feedback.tone === "error") {
        toast.error(feedback.message);
        return;
      }
      if (variables.mode === "auto_execute_range") {
        toast.success(feedback.message);
        return;
      }
      if (task?.kind && task.id) {
        setSearchParams((prev) => {
          const next = new URLSearchParams(prev);
          next.set("kind", task.kind);
          next.set("id", task.id);
          return next;
        });
        navigate(task.sourceRoute);
        return;
      }
      toast.success(feedback.message);
    },
  });

  const archiveMutation = useMutation({
    mutationFn: (payload: { kind: TaskKind; id: string }) => archiveTask(payload.kind, payload.id),
    onSuccess: async (_, payload) => {
      await queryClient.cancelQueries({
        queryKey: queryKeys.tasks.detail(payload.kind, payload.id),
      });
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        next.delete("kind");
        next.delete("id");
        return next;
      });
      await invalidateTaskQueries();
      toast.success("任务已归档并从任务中心隐藏");
    },
  });

  const archiveBatchMutation = useMutation({
    mutationFn: (items: Array<{ kind: TaskKind; id: string }>) => archiveTasks(items),
    onSuccess: async (response, items) => {
      const archiveResult = response.data;
      if (!archiveResult) {
        await invalidateTaskQueries();
        toast.error("批量归档结果为空，请刷新后重试");
        return;
      }
      const archivedSet = new Set(
        archiveResult.items
          .filter((item) => item.success)
          .map((item) => `${item.kind}:${item.id}`),
      );
      if (selectedKind && selectedId && archivedSet.has(`${selectedKind}:${selectedId}`)) {
        setSearchParams((prev) => {
          const next = new URLSearchParams(prev);
          next.delete("kind");
          next.delete("id");
          return next;
        });
      }
      await invalidateTaskQueries();
      const failedCount = archiveResult.failedCount;
      if (failedCount > 0) {
        toast.error(`已归档 ${archiveResult.archivedCount} 项，另有 ${failedCount} 项未归档`);
        return;
      }
      toast.success(`已归档 ${items.length} 项已完成或已取消任务`);
    },
  });

  const selectedTask = detailQuery.data?.data;
  const isAutoDirectorTask = Boolean(
    selectedTask
    && selectedTask.kind === "novel_workflow"
    && selectedTask.meta.lane === "auto_director",
  );
  const isActiveAutoDirectorTask = Boolean(
    selectedTask
    && isAutoDirectorTask
    && ACTIVE_STATUSES.has(selectedTask.status),
  );
  const canResumeFront10AutoExecution = Boolean(
    selectedTask
    && selectedTask.kind === "novel_workflow"
    && canContinueFront10AutoExecution(selectedTask),
  );
  const needsCandidateSelection = Boolean(
    selectedTask
    && selectedTask.kind === "novel_workflow"
    && requiresCandidateSelection(selectedTask),
  );
  const selectedTaskNotice = useMemo(
    () => parseDirectorTaskNotice(selectedTask?.meta),
    [selectedTask?.meta],
  );
  const selectedTaskNoticeRoute = useMemo(
    () => (selectedTask ? buildTaskNoticeRoute(selectedTask, selectedTaskNotice) : null),
    [selectedTask, selectedTaskNotice],
  );
  const selectedTaskChapterTitleWarning = useMemo(
    () => (isAutoDirectorTask ? resolveChapterTitleWarning(selectedTask ?? null) : null),
    [isAutoDirectorTask, selectedTask],
  );
  const chapterTitleRepairMutation = useDirectorChapterTitleRepair();
  const selectedTaskFailureRepairRoute = selectedTaskChapterTitleWarning?.route ?? null;
  const selectedTaskHasChapterTitleFailure = Boolean(
    selectedTask
    && isChapterTitleDiversitySummary(
      selectedTask.failureSummary ?? selectedTask.lastError ?? null,
    ),
  );
  const canRetryWithSelectedModel = Boolean(retryOverride.provider && retryOverride.model.trim());
  const autoDirectorFollowUpQuery = useQuery({
    queryKey: queryKeys.tasks.autoDirectorFollowUpDetail(selectedId ?? "none"),
    queryFn: () => getAutoDirectorFollowUpDetail(selectedId as string),
    enabled: Boolean(selectedId && isAutoDirectorTask),
    retry: false,
    refetchInterval: (query) => {
      const followUp = query.state.data?.data;
      return followUp?.task && ACTIVE_STATUSES.has(followUp.task.status) ? 4000 : false;
    },
  });
  const selectedAutoDirectorFollowUp = autoDirectorFollowUpQuery.data?.data ?? null;

  useEffect(() => {
    setRetryOverride({
      provider: llm.provider,
      model: llm.model,
      temperature: llm.temperature,
    });
  }, [llm.model, llm.provider, llm.temperature, selectedTask?.id]);

  const executeFollowUpActionMutation = useMutation({
    mutationFn: (payload: { taskId: string; actionCode: AutoDirectorMutationActionCode }) =>
      executeAutoDirectorFollowUpAction(payload.taskId, {
        actionCode: payload.actionCode,
        idempotencyKey: createIdempotencyKey(payload.taskId, payload.actionCode),
      }),
    onSuccess: async (response) => {
      const result = response.data;
      if (result?.task) {
        syncKnownTaskCaches(queryClient, result.task);
      }
      await Promise.all([
        invalidateTaskQueries(),
        queryClient.invalidateQueries({
          queryKey: queryKeys.tasks.autoDirectorFollowUpDetail(result?.taskId ?? selectedId ?? "none"),
        }),
      ]);
      if (result?.code === "failed" || result?.code === "forbidden") {
        toast.error(result.message);
        return;
      }
      toast.success(result?.message ?? "操作已执行");
    },
  });

  const archiveVisibleLabel = "归档当前已完成/已取消";

  return (
    <div className="space-y-4">
      <TaskCenterSummaryCards
        runningCount={runningCount}
        queuedCount={queuedCount}
        failedCount={failedCount}
        waitingApprovalCount={waitingApprovalCount}
      />

      <div className="grid gap-4 xl:grid-cols-[260px_minmax(0,1fr)_360px]">
        <TaskCenterFiltersCard
          kind={kind}
          status={status}
          keyword={keyword}
          onlyAnomaly={onlyAnomaly}
          sortMode={sortMode}
          onKindChange={setKind}
          onStatusChange={setStatus}
          onKeywordChange={setKeyword}
          onOnlyAnomalyChange={setOnlyAnomaly}
          onSortModeChange={setSortMode}
        />

        <TaskCenterListCard
          visibleRows={visibleRows}
          selectedKind={selectedKind}
          selectedId={selectedId}
          archiveLabel={archiveVisibleLabel}
          archiveDisabled={archiveBatchMutation.isPending || archivableFinishedRows.length === 0}
          onArchiveVisible={() => archiveBatchMutation.mutate(
            archivableFinishedRows.map((task) => ({ kind: task.kind, id: task.id })),
          )}
          onSelectTask={(task) => {
            setSearchParams((prev) => {
              const next = new URLSearchParams(prev);
              next.set("kind", task.kind);
              next.set("id", task.id);
              return next;
            });
          }}
        />
        <TaskCenterDetailPanel
          navigateTo={navigate}
          selectedTask={selectedTask}
          selectedAutoDirectorFollowUp={selectedAutoDirectorFollowUp}
          isAutoDirectorTask={isAutoDirectorTask}
          isActiveAutoDirectorTask={isActiveAutoDirectorTask}
          canResumeFront10AutoExecution={canResumeFront10AutoExecution}
          needsCandidateSelection={needsCandidateSelection}
          selectedTaskNoticeLabel={selectedTaskNotice?.action?.label ?? null}
          selectedTaskNoticeRoute={selectedTaskNoticeRoute}
          selectedTaskChapterTitleWarningLabel={selectedTaskChapterTitleWarning?.label ?? null}
          selectedTaskHasChapterTitleFailure={selectedTaskHasChapterTitleFailure}
          selectedTaskFailureRepairRoute={selectedTaskFailureRepairRoute}
          chapterTitleRepairPending={chapterTitleRepairMutation.isPending}
          retryOverride={retryOverride}
          canRetryWithSelectedModel={canRetryWithSelectedModel}
          llmProvider={llm.provider}
          llmModel={llm.model}
          continuePending={continueWorkflowMutation.isPending}
          retryPending={retryMutation.isPending}
          cancelPending={cancelMutation.isPending}
          archivePending={archiveMutation.isPending}
          followUpActionPending={executeFollowUpActionMutation.isPending}
          onRetryOverrideChange={setRetryOverride}
          onStartChapterTitleRepair={() => chapterTitleRepairMutation.startRepair(selectedTask ?? null)}
          onFollowUpAction={(action) => handleTaskFollowUpAction({
            action,
            task: selectedTask,
            navigate,
            execute: (payload) => executeFollowUpActionMutation.mutate({
              taskId: payload.taskId,
              actionCode: payload.actionCode as AutoDirectorMutationActionCode,
            }),
          })}
          onContinueCandidateSelection={() => navigate(selectedTask ? getCandidateSelectionLink(selectedTask.id) : "/tasks")}
          onContinueFront10={() => {
            if (!selectedTask) {
              return;
            }
            continueWorkflowMutation.mutate({
              taskId: selectedTask.id,
              mode: "auto_execute_range",
            });
          }}
          onContinueTask={() => {
            if (!selectedTask) {
              return;
            }
            continueWorkflowMutation.mutate({
              taskId: selectedTask.id,
            });
          }}
          onRetryOriginal={() => {
            if (!selectedTask) {
              return;
            }
            retryMutation.mutate({
              kind: selectedTask.kind,
              id: selectedTask.id,
            });
          }}
          onRetryWithSelectedModel={() => {
            if (!selectedTask) {
              return;
            }
            retryMutation.mutate({
              kind: selectedTask.kind,
              id: selectedTask.id,
              llmOverride: {
                provider: retryOverride.provider,
                model: retryOverride.model,
                temperature: retryOverride.temperature,
              },
              resume: true,
            });
          }}
          onCancel={() => {
            if (!selectedTask) {
              return;
            }
            cancelMutation.mutate({
              kind: selectedTask.kind,
              id: selectedTask.id,
            });
          }}
          onArchive={() => {
            if (!selectedTask) {
              return;
            }
            archiveMutation.mutate({
              kind: selectedTask.kind,
              id: selectedTask.id,
            });
          }}
        />
      </div>
    </div>
  );
}
