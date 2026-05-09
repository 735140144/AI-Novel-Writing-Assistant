import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { PublishDispatchJob, PublishItemStatus, PublishMode, PublishPlan, PublishPlanStatus } from "@ai-novel/shared/types/publishing";
import { useParams } from "react-router-dom";
import { Loader2, RefreshCw, Send, UploadCloud } from "lucide-react";
import {
  deletePublishingPlan,
  generatePublishingPlan,
  getPublishingWorkDetail,
  refreshPublishingJob,
  submitPublishingPlan,
  syncPublishingBindingProgress,
} from "@/api/novel";
import { queryKeys } from "@/api/queryKeys";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/components/ui/toast";

const itemStatusLabels: Record<PublishItemStatus, string> = {
  unpublished: "未发布",
  submitting: "提交中",
  draft_box: "草稿箱",
  published: "已发布",
  failed: "失败",
  relogin_required: "需要重新扫码",
};

const planStatusLabels: Record<PublishPlanStatus, string> = {
  draft: "草稿",
  ready: "可提交",
  submitting: "提交中",
  completed: "已完成",
  failed: "有失败项",
};

function statusVariant(status: string) {
  if (status === "published" || status === "completed" || status === "ready") return "default" as const;
  if (status === "failed" || status === "relogin_required") return "destructive" as const;
  return "secondary" as const;
}

function formatDateTime(value?: string | null): string {
  if (!value) {
    return "-";
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString("zh-CN");
}

function parsePositiveInt(value: string): number | null {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function plusOneDate(value?: string | null): string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const now = new Date();
    const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
    return next.toISOString().slice(0, 10);
  }
  const next = new Date(`${value}T00:00:00.000Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  return next.toISOString().slice(0, 10);
}

function inferDefaultChapterCount(input: {
  completedChapterCount: number;
  publishedChapterCount: number;
}): number {
  return Math.max(1, input.completedChapterCount - input.publishedChapterCount);
}

function countRemotePublishedChapters(
  remoteProgress: { publishedChapters: Array<{ order?: number | null }> } | null,
): number {
  if (!remoteProgress) {
    return 0;
  }
  const maxOrder = remoteProgress.publishedChapters.reduce((currentMax, row) => {
    if (typeof row.order !== "number" || !Number.isFinite(row.order)) {
      return currentMax;
    }
    return Math.max(currentMax, row.order);
  }, 0);
  return Math.max(remoteProgress.publishedChapters.length, maxOrder);
}

function countPublishedChapters(
  plan: PublishPlan | null,
  remotePublishedCount: number,
  hasRemoteProgress: boolean,
): number {
  const localPublished = plan?.items.filter((item) => item.status === "published").length ?? 0;
  return hasRemoteProgress ? remotePublishedCount : localPublished;
}

function latestJob(jobs: PublishDispatchJob[]): PublishDispatchJob | null {
  return jobs[0] ?? null;
}

function isCompletedPlanItem(status: PublishItemStatus): boolean {
  return status === "draft_box" || status === "published";
}

export default function PublishingWorkDetailPage() {
  const params = useParams<{ bindingId: string }>();
  const bindingId = params.bindingId ?? "";
  const queryClient = useQueryClient();
  const [useTimer, setUseTimer] = useState(false);
  const [startDate, setStartDate] = useState("");
  const [publishTime, setPublishTime] = useState("08:00");
  const [chaptersPerDayText, setChaptersPerDayText] = useState("2");
  const [chapterCountText, setChapterCountText] = useState("1");
  const [mode, setMode] = useState<PublishMode>("draft");

  const detailQuery = useQuery({
    queryKey: queryKeys.publishingWorkDetail(bindingId),
    queryFn: () => getPublishingWorkDetail(bindingId),
    enabled: Boolean(bindingId),
  });

  const detail = detailQuery.data?.data;
  const remoteProgress = detail?.remoteProgress ?? null;
  const remotePublishedCount = countRemotePublishedChapters(remoteProgress);
  const publishedChapterCount = countPublishedChapters(
    detail?.activePlan ?? null,
    remotePublishedCount,
    Boolean(remoteProgress),
  );
  const recommendedChapterCount = detail
    ? inferDefaultChapterCount({
      completedChapterCount: detail.novel.completedChapterCount,
      publishedChapterCount,
    })
    : 1;
  const canGeneratePlan = Boolean(remoteProgress);
  const activePlan = detail?.activePlan ?? null;
  const latestDispatchJob = latestJob(detail?.recentJobs ?? []);
  const pendingPlanItems = useMemo(
    () => activePlan?.items.filter((item) => !isCompletedPlanItem(item.status)) ?? [],
    [activePlan],
  );
  const completedPlanItems = useMemo(
    () => activePlan?.items.filter((item) => isCompletedPlanItem(item.status)) ?? [],
    [activePlan],
  );

  useEffect(() => {
    setChapterCountText(useTimer ? String(recommendedChapterCount) : "1");
  }, [recommendedChapterCount, bindingId, useTimer]);

  useEffect(() => {
    const nextStartDate = plusOneDate(
      activePlan?.resolvedSchedule.useTimer
        ? activePlan.resolvedSchedule.startDate ?? null
        : null,
    );
    setStartDate(nextStartDate);
  }, [activePlan?.resolvedSchedule.startDate, activePlan?.resolvedSchedule.useTimer, bindingId]);

  useEffect(() => {
    if (activePlan?.mode) {
      setMode(activePlan.mode);
    }
  }, [activePlan?.mode]);

  const invalidateDetail = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.publishingWorkDetail(bindingId) }),
      queryClient.invalidateQueries({ queryKey: queryKeys.publishingWorks }),
      queryClient.invalidateQueries({ queryKey: queryKeys.publishingCredentials }),
    ]);
  };

  const syncMutation = useMutation({
    mutationFn: () => syncPublishingBindingProgress(bindingId),
    onSuccess: async () => {
      toast.success("远端进度已同步。");
      await invalidateDetail();
    },
    onError: async (error) => {
      toast.error(error instanceof Error ? error.message : "远端进度同步失败。");
      const status = typeof error === "object" && error && "status" in error
        ? Number((error as { status?: unknown }).status)
        : null;
      if (status === 409) {
        await invalidateDetail();
      }
    },
  });

  const generatePlanMutation = useMutation({
    mutationFn: () => {
      const chapterCount = parsePositiveInt(chapterCountText);
      if (!chapterCount) {
        throw new Error("请填写参与发布章节数量。");
      }
      const chaptersPerDay = parsePositiveInt(chaptersPerDayText);
      if (useTimer && !chaptersPerDay) {
        throw new Error("请填写每日发布章节数。");
      }
      return generatePublishingPlan(bindingId, {
        chapterCount,
        mode,
        useTimer,
        ...(useTimer ? {
          startDate,
          publishTime,
          chaptersPerDay: chaptersPerDay ?? 1,
        } : {
          chaptersPerDay: chapterCount,
        }),
      });
    },
    onSuccess: async () => {
      toast.success("发布时间表已生成。");
      await invalidateDetail();
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "发布时间表生成失败。");
    },
  });

  const submitMutation = useMutation({
    mutationFn: () => {
      if (!activePlan) {
        throw new Error("请先生成发布时间表。");
      }
      return submitPublishingPlan(bindingId, activePlan.id, { mode: activePlan.mode || mode });
    },
    onSuccess: async () => {
      toast.success("章节已按计划顺序开始提交。");
      await invalidateDetail();
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "发布提交失败。");
    },
  });

  const deletePlanMutation = useMutation({
    mutationFn: () => {
      if (!activePlan) {
        throw new Error("当前没有可清除的发布时间表。");
      }
      return deletePublishingPlan(bindingId, activePlan.id);
    },
    onSuccess: async () => {
      toast.success("当前本地发布时间表已清除。");
      await invalidateDetail();
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "清除当前计划失败。");
    },
  });

  const refreshJobMutation = useMutation({
    mutationFn: (jobId: string) => refreshPublishingJob(bindingId, jobId),
    onSuccess: async () => {
      toast.success("任务状态已刷新。");
      await invalidateDetail();
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "任务刷新失败。");
    },
  });

  const progressSummary = useMemo(() => {
    if (!remoteProgress) {
      return {
        published: 0,
        draft: 0,
      };
    }
    return {
      published: countRemotePublishedChapters(remoteProgress),
      draft: remoteProgress.effectiveDraftChapters.length,
    };
  }, [remoteProgress]);

  if (detailQuery.isLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        正在加载发布详情。
      </div>
    );
  }

  if (!detail) {
    return (
      <div className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
        当前发布绑定不存在，或你没有权限查看。
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">发布详情</h1>
        <p className="text-sm text-muted-foreground">首次生成发布时间表前，请先同步远端进度，再设置参与发布章节数量。</p>
      </header>

      <section className="grid gap-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
        <div className="space-y-4 rounded-lg border p-4">
          <div className="space-y-2">
            <div className="text-lg font-medium">{detail.novel.title}</div>
            <div className="text-sm text-muted-foreground">{detail.novel.description || "暂无简介。"}</div>
          </div>
          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-muted-foreground">进度</dt>
              <dd className="mt-1 font-medium">
                {publishedChapterCount}/{detail.novel.completedChapterCount}/{detail.novel.estimatedChapterCount ?? "-"}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">发布平台</dt>
              <dd className="mt-1 font-medium">番茄</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">发布平台笔名</dt>
              <dd className="mt-1 font-medium">{detail.binding.credentialAccountDisplayName || detail.binding.credentialLabel}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">发布书名</dt>
              <dd className="mt-1 font-medium">{detail.binding.bookTitle}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">账号状态</dt>
              <dd className="mt-1">
                <Badge variant={statusVariant(detail.binding.credentialStatus)}>{detail.binding.credentialStatus}</Badge>
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">最近同步时间</dt>
              <dd className="mt-1 font-medium">{formatDateTime(remoteProgress?.syncedAt ?? detail.binding.lastValidatedAt)}</dd>
            </div>
          </dl>
        </div>

        <div className="space-y-4 rounded-lg border p-4">
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" onClick={() => syncMutation.mutate()} disabled={syncMutation.isPending}>
              <RefreshCw className={`h-4 w-4 ${syncMutation.isPending ? "animate-spin" : ""}`} />
              {syncMutation.isPending ? "同步中..." : "同步远端进度"}
            </Button>
            <Button type="button" onClick={() => submitMutation.mutate()} disabled={!activePlan || submitMutation.isPending}>
              <Send className="h-4 w-4" />
              {submitMutation.isPending ? "提交中..." : "开始发布"}
            </Button>
          </div>

          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_220px]">
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">计划方式</label>
                <div className="flex flex-wrap gap-2">
                  <Button type="button" variant={useTimer ? "outline" : "default"} onClick={() => setUseTimer(false)}>
                    立即发布
                  </Button>
                  <Button type="button" variant={useTimer ? "default" : "outline"} onClick={() => setUseTimer(true)}>
                    定时发布
                  </Button>
                </div>
              </div>
              {useTimer ? (
                <div className="grid gap-4 sm:grid-cols-3">
                  <div className="space-y-2">
                    <label className="text-sm font-medium" htmlFor="publishing-start-date">起始日期</label>
                    <Input
                      id="publishing-start-date"
                      type="date"
                      value={startDate}
                      onChange={(event) => setStartDate(event.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium" htmlFor="publishing-time">发布时间</label>
                    <Input
                      id="publishing-time"
                      type="time"
                      value={publishTime}
                      onChange={(event) => setPublishTime(event.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium" htmlFor="publishing-chapters-per-day">每日发布章节数</label>
                    <Input
                      id="publishing-chapters-per-day"
                      type="number"
                      min={1}
                      value={chaptersPerDayText}
                      onChange={(event) => setChaptersPerDayText(event.target.value)}
                    />
                  </div>
                </div>
              ) : (
                <div className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground">
                  当前按立即发布生成计划。开始发布后会按顺序逐章立即提交，不带定时时间。
                </div>
              )}
            </div>
            <div className="space-y-3">
              <div className="space-y-2">
                <label className="text-sm font-medium">提交方式</label>
                <Select value={mode} onValueChange={(value) => setMode(value as PublishMode)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="draft">提交到草稿箱</SelectItem>
                    <SelectItem value="publish">直接进入发布</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium" htmlFor="publishing-chapter-count">参与发布章节数量</label>
                <Input
                  id="publishing-chapter-count"
                  type="number"
                  min={1}
                  value={chapterCountText}
                  onChange={(event) => setChapterCountText(event.target.value)}
                />
                <div className="text-xs text-muted-foreground">默认值 = 当前已完成章节数 - 已发布章节数，可人工修改。</div>
              </div>
              <Button
                type="button"
                className="w-full"
                onClick={() => generatePlanMutation.mutate()}
                disabled={!canGeneratePlan || generatePlanMutation.isPending}
              >
                <UploadCloud className="h-4 w-4" />
                {generatePlanMutation.isPending ? "生成中..." : "生成发布时间表"}
              </Button>
            </div>
          </div>

          {!canGeneratePlan ? (
            <div className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground">
              首次生成发布时间表前，请先同步远端进度。
            </div>
          ) : (
            <div className="grid gap-3 text-sm sm:grid-cols-2">
              <div className="rounded-lg bg-muted/40 p-3">
                <div className="text-muted-foreground">远端已发布</div>
                <div className="mt-1 text-lg font-medium">{progressSummary.published}</div>
              </div>
              <div className="rounded-lg bg-muted/40 p-3">
                <div className="text-muted-foreground">远端草稿箱</div>
                <div className="mt-1 text-lg font-medium">{progressSummary.draft}</div>
              </div>
            </div>
          )}
        </div>
      </section>

      <section className="space-y-3 rounded-lg border p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-base font-medium">当前计划</h2>
            <p className="text-sm text-muted-foreground">
              {activePlan
                ? (activePlan.resolvedSchedule.useTimer
                  ? `${activePlan.resolvedSchedule.startDate} 起，每天 ${activePlan.resolvedSchedule.publishTime} 提交 ${activePlan.resolvedSchedule.chaptersPerDay} 章`
                  : `立即发布，按顺序提交 ${activePlan.items.length} 章`)
                : "生成发布时间表后，系统会按顺序准备逐章提交列表。"}
            </p>
            {activePlan ? (
              <p className="text-xs text-muted-foreground">
                当前计划共 {activePlan.items.length} 章，其中待提交 {pendingPlanItems.length} 章，已在平台存在 {completedPlanItems.length} 章。
              </p>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {activePlan ? <Badge variant={statusVariant(activePlan.status)}>{planStatusLabels[activePlan.status]}</Badge> : null}
            {activePlan ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={deletePlanMutation.isPending}
                onClick={() => {
                  const confirmed = window.confirm("确认清除当前本地发布时间表吗？已提交到平台的章节不会被回滚。");
                  if (!confirmed) {
                    return;
                  }
                  deletePlanMutation.mutate();
                }}
              >
                {deletePlanMutation.isPending ? "清除中..." : "清除当前计划"}
              </Button>
            ) : null}
          </div>
        </div>

        {activePlan?.items.length ? (
          <div className="space-y-4">
            {pendingPlanItems.length ? (
              <div className="space-y-2">
                <div className="text-sm font-medium">待提交章节</div>
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead className="bg-muted/40 text-left">
                      <tr>
                        <th className="px-4 py-3 font-medium">章节</th>
                        <th className="px-4 py-3 font-medium">计划发布时间</th>
                        <th className="px-4 py-3 font-medium">状态</th>
                        <th className="px-4 py-3 font-medium">最近错误</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pendingPlanItems.map((item) => (
                        <tr key={item.id} className="border-t">
                          <td className="px-4 py-3">第 {item.chapterOrder} 章 · {item.chapterTitle}</td>
                          <td className="px-4 py-3 font-mono text-xs">{item.plannedPublishTime}</td>
                          <td className="px-4 py-3">
                            <Badge variant={statusVariant(item.status)}>{itemStatusLabels[item.status]}</Badge>
                          </td>
                          <td className="px-4 py-3 text-muted-foreground">{item.lastError || "-"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
              <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                当前计划中没有待提交章节。
              </div>
            )}

            {completedPlanItems.length ? (
              <div className="space-y-2">
                <div className="text-sm font-medium">已在平台存在的章节</div>
                <div className="text-xs text-muted-foreground">这些章节已同步为草稿箱或已发布状态，不会再次参与本次提交。</div>
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead className="bg-muted/40 text-left">
                      <tr>
                        <th className="px-4 py-3 font-medium">章节</th>
                        <th className="px-4 py-3 font-medium">计划发布时间</th>
                        <th className="px-4 py-3 font-medium">状态</th>
                        <th className="px-4 py-3 font-medium">最近错误</th>
                      </tr>
                    </thead>
                    <tbody>
                      {completedPlanItems.map((item) => (
                        <tr key={item.id} className="border-t">
                          <td className="px-4 py-3">第 {item.chapterOrder} 章 · {item.chapterTitle}</td>
                          <td className="px-4 py-3 font-mono text-xs">{item.plannedPublishTime}</td>
                          <td className="px-4 py-3">
                            <Badge variant={statusVariant(item.status)}>{itemStatusLabels[item.status]}</Badge>
                          </td>
                          <td className="px-4 py-3 text-muted-foreground">{item.lastError || "-"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : null}
          </div>
        ) : (
          <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
            还没有可展示的发布时间表。
          </div>
        )}
      </section>

      <section className="space-y-3 rounded-lg border p-4">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-base font-medium">发布任务</h2>
          {latestDispatchJob ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => refreshJobMutation.mutate(latestDispatchJob.id)}
              disabled={refreshJobMutation.isPending}
            >
              <RefreshCw className={`h-4 w-4 ${refreshJobMutation.isPending ? "animate-spin" : ""}`} />
              刷新任务
            </Button>
          ) : null}
        </div>

        {detail.recentJobs.length ? (
          <div className="space-y-2">
            {detail.recentJobs.map((job) => (
              <div key={job.id} className="flex flex-wrap items-start justify-between gap-3 rounded-lg border p-3">
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={statusVariant(job.status)}>{job.status}</Badge>
                    <span className="text-sm font-medium">{job.bookTitle}</span>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {job.plannedPublishTime} · {job.chapterCount} 章 · {formatDateTime(job.submittedAt)}
                  </div>
                  {job.lastError ? <div className="text-xs text-red-600">{job.lastError}</div> : null}
                </div>
                <div className="text-xs text-muted-foreground">完成时间：{formatDateTime(job.completedAt)}</div>
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
            还没有发布任务记录。
          </div>
        )}
      </section>
    </div>
  );
}
