import { Clock, QrCode, RefreshCw, Send, UploadCloud } from "lucide-react";
import type {
  PublishDispatchJobStatus,
  PublishItemStatus,
  PublishMode,
  PublishingCredentialStatus,
} from "@ai-novel/shared/types/publishing";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type { PublishingTabViewProps } from "./NovelEditView.types";

const credentialStatusLabels: Record<PublishingCredentialStatus, string> = {
  created: "待扫码",
  login_pending: "等待扫码",
  ready: "可发布",
  expired: "需要重新扫码",
  invalid: "不可用",
};

const dispatchStatusLabels: Record<PublishDispatchJobStatus, string> = {
  queued: "排队中",
  leased: "准备执行",
  running: "执行中",
  completed: "已完成",
  failed: "失败",
};

function getStatusBadgeVariant(status: PublishItemStatus | PublishingCredentialStatus | PublishDispatchJobStatus) {
  if (status === "ready" || status === "draft_box" || status === "published" || status === "completed") {
    return "default" as const;
  }
  if (status === "failed" || status === "invalid" || status === "expired" || status === "relogin_required") {
    return "destructive" as const;
  }
  return "secondary" as const;
}

function modeLabel(mode: PublishMode): string {
  return mode === "publish" ? "提交发布" : "提交到草稿箱";
}

function formatDateTime(value: string | null | undefined): string {
  if (!value) {
    return "-";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString("zh-CN");
}

export default function PublishingWorkspaceTab(props: PublishingTabViewProps) {
  const {
    credentials,
    knownBooks,
    binding,
    activePlan,
    recentJobs,
    isLoading,
    accountLabel,
    onAccountLabelChange,
    selectedCredentialId,
    onSelectedCredentialIdChange,
    selectedKnownBookKey,
    onSelectedKnownBookKeyChange,
    bookId,
    onBookIdChange,
    bookTitle,
    onBookTitleChange,
    scheduleInstruction,
    onScheduleInstructionChange,
    selectedMode,
    onSelectedModeChange,
    latestChallenge,
    onCreateCredential,
    isCreatingCredential,
    onBootstrapLogin,
    bootstrappingCredentialId,
    onValidateCredential,
    validatingCredentialId,
    onSaveBinding,
    isSavingBinding,
    onGeneratePlan,
    isGeneratingPlan,
    onSubmitPlan,
    submittingMode,
    onRefreshJob,
    refreshingJobId,
    statusLabels,
    message,
  } = props;

  const readyCredentialCount = credentials.filter((credential) => credential.status === "ready").length;
  const plannedCount = activePlan?.items.length ?? 0;
  const submittedCount = activePlan?.items.filter((item) => item.status !== "unpublished").length ?? 0;
  const selectedCredential = credentials.find((credential) => credential.id === selectedCredentialId) ?? null;

  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-3">
        <div className="rounded-xl border border-border/70 bg-background p-4">
          <div className="text-xs text-muted-foreground">可用账号</div>
          <div className="mt-1 text-xl font-semibold">{readyCredentialCount}/{credentials.length}</div>
        </div>
        <div className="rounded-xl border border-border/70 bg-background p-4">
          <div className="text-xs text-muted-foreground">绑定书籍</div>
          <div className="mt-1 truncate text-sm font-semibold">{binding?.bookTitle ?? "待绑定"}</div>
        </div>
        <div className="rounded-xl border border-border/70 bg-background p-4">
          <div className="text-xs text-muted-foreground">发布进度</div>
          <div className="mt-1 text-xl font-semibold">{submittedCount}/{plannedCount}</div>
        </div>
      </div>

      {message ? (
        <div className="rounded-xl border border-border/70 bg-muted/20 p-3 text-sm leading-6 text-muted-foreground">
          {message}
        </div>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-[360px_1fr]">
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">绑定番茄账号</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-2">
                <label className="text-xs font-medium text-muted-foreground" htmlFor="publishing-account-label">
                  账号标签
                </label>
                <Input
                  id="publishing-account-label"
                  value={accountLabel}
                  onChange={(event) => onAccountLabelChange(event.target.value)}
                  placeholder="番茄作者号"
                />
              </div>
              <Button type="button" onClick={onCreateCredential} disabled={isCreatingCredential} className="w-full">
                <QrCode className="h-4 w-4" />
                {isCreatingCredential ? "创建中..." : "创建扫码账号"}
              </Button>

              <div className="space-y-2">
                {credentials.map((credential) => (
                  <div key={credential.id} className="rounded-lg border border-border/70 p-3">
                    <div className="flex min-w-0 items-center justify-between gap-2">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium">{credential.label}</div>
                        <div className="mt-0.5 truncate text-xs text-muted-foreground">
                          {credential.accountDisplayName || credential.credentialUuid}
                        </div>
                      </div>
                      <Badge variant={getStatusBadgeVariant(credential.status)}>
                        {credentialStatusLabels[credential.status]}
                      </Badge>
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => onBootstrapLogin(credential.id, credential.status === "login_pending" ? "refresh" : "create")}
                        disabled={bootstrappingCredentialId === credential.id}
                      >
                        <QrCode className="h-4 w-4" />
                        {bootstrappingCredentialId === credential.id ? "生成中..." : "扫码"}
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => onValidateCredential(credential.id)}
                        disabled={validatingCredentialId === credential.id}
                      >
                        <RefreshCw className="h-4 w-4" />
                        {validatingCredentialId === credential.id ? "刷新中..." : "刷新"}
                      </Button>
                    </div>
                  </div>
                ))}
                {credentials.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-border/80 p-4 text-sm text-muted-foreground">
                    创建账号后扫码登录番茄。
                  </div>
                ) : null}
              </div>

              {latestChallenge && selectedCredential?.status !== "ready" ? (
                <div className="rounded-lg border border-border/70 bg-muted/20 p-3">
                  <div className="text-sm font-medium">扫码登录</div>
                  {latestChallenge.qrCodeBase64Png ? (
                    <img
                      src={`data:image/png;base64,${latestChallenge.qrCodeBase64Png}`}
                      alt="番茄账号扫码登录二维码"
                      className="mt-3 h-40 w-40 rounded-md border border-border bg-white object-contain"
                    />
                  ) : (
                    <div className="mt-3 rounded-md border border-dashed border-border/80 p-3 text-xs text-muted-foreground">
                      扫码入口可用，请刷新账号状态或重新生成二维码。
                    </div>
                  )}
                  <div className="mt-2 text-xs text-muted-foreground">
                    有效期：{latestChallenge.expiresAt ?? "请尽快扫码"}
                  </div>
                </div>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">绑定番茄书籍</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-2">
                <label className="text-xs font-medium text-muted-foreground" htmlFor="publishing-credential">
                  发布账号
                </label>
                <select
                  id="publishing-credential"
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                  value={selectedCredentialId}
                  onChange={(event) => onSelectedCredentialIdChange(event.target.value)}
                >
                  <option value="">选择账号</option>
                  {credentials.map((credential) => (
                    <option key={credential.id} value={credential.id}>
                      {credential.label} · {credentialStatusLabels[credential.status]}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <label className="text-xs font-medium text-muted-foreground" htmlFor="publishing-book-choice">
                  已维护番茄书籍
                </label>
                <select
                  id="publishing-book-choice"
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                  value={selectedKnownBookKey}
                  onChange={(event) => onSelectedKnownBookKeyChange(event.target.value)}
                >
                  <option value="">选择本地已维护书籍</option>
                  {knownBooks
                    .filter((item) => !selectedCredentialId || item.credentialId === selectedCredentialId)
                    .map((item) => (
                      <option key={item.key} value={item.key}>
                        {item.bookTitle}
                        {item.sourceNovelTitle ? ` · 来源《${item.sourceNovelTitle}》` : ""}
                      </option>
                    ))}
                </select>
                <div className="text-xs text-muted-foreground">
                  系统会自动带出番茄书名和书籍编号；如果没有合适选项，再补充下方信息。
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-xs font-medium text-muted-foreground" htmlFor="publishing-book-id">
                  番茄书籍编号
                </label>
                <Input
                  id="publishing-book-id"
                  value={bookId}
                  onChange={(event) => onBookIdChange(event.target.value)}
                  placeholder="优先通过上方书籍下拉自动带出"
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-medium text-muted-foreground" htmlFor="publishing-book-title">
                  番茄书名
                </label>
                <Input
                  id="publishing-book-title"
                  value={bookTitle}
                  onChange={(event) => onBookTitleChange(event.target.value)}
                  placeholder="优先通过上方书籍下拉选择"
                />
              </div>
              <Button type="button" onClick={onSaveBinding} disabled={isSavingBinding} className="w-full">
                {isSavingBinding ? "保存中..." : "保存书籍绑定"}
              </Button>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">生成发布时间表</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid gap-3 lg:grid-cols-[1fr_180px]">
                <textarea
                  className="min-h-24 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm outline-none ring-offset-background placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
                  value={scheduleInstruction}
                  onChange={(event) => onScheduleInstructionChange(event.target.value)}
                  placeholder="每日 8 点发布 2 章节"
                />
                <div className="space-y-2">
                  <label className="text-xs font-medium text-muted-foreground" htmlFor="publishing-mode">
                    提交方式
                  </label>
                  <select
                    id="publishing-mode"
                    className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                    value={selectedMode}
                    onChange={(event) => onSelectedModeChange(event.target.value as PublishMode)}
                  >
                    <option value="draft">提交到草稿箱</option>
                    <option value="publish">提交发布</option>
                  </select>
                  <Button type="button" onClick={onGeneratePlan} disabled={isGeneratingPlan} className="w-full">
                    <Clock className="h-4 w-4" />
                    {isGeneratingPlan ? "生成中..." : "生成发布时间表"}
                  </Button>
                </div>
              </div>

              {activePlan ? (
                <div className="rounded-lg border border-border/70 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <div className="text-sm font-medium">当前计划</div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        {activePlan.resolvedSchedule.startDate} 起，每天 {activePlan.resolvedSchedule.publishTime} 发布 {activePlan.resolvedSchedule.chaptersPerDay} 章
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => onSubmitPlan("draft")}
                        disabled={Boolean(submittingMode)}
                      >
                        <UploadCloud className="h-4 w-4" />
                        {submittingMode === "draft" ? "提交中..." : "提交到草稿箱"}
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        onClick={() => onSubmitPlan("publish")}
                        disabled={Boolean(submittingMode)}
                      >
                        <Send className="h-4 w-4" />
                        {submittingMode === "publish" ? "提交中..." : "提交发布"}
                      </Button>
                    </div>
                  </div>
                </div>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">章节发布状态</CardTitle>
            </CardHeader>
            <CardContent>
              {activePlan?.items.length ? (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[720px] text-left text-sm">
                    <thead className="border-b text-xs text-muted-foreground">
                      <tr>
                        <th className="py-2 pr-3 font-medium">章节</th>
                        <th className="py-2 pr-3 font-medium">计划发布时间</th>
                        <th className="py-2 pr-3 font-medium">状态</th>
                        <th className="py-2 pr-3 font-medium">最近错误</th>
                      </tr>
                    </thead>
                    <tbody>
                      {activePlan.items.map((item) => (
                        <tr key={item.id} className="border-b border-border/60">
                          <td className="py-2 pr-3">
                            第 {item.chapterOrder} 章：{item.chapterTitle}
                          </td>
                          <td className="py-2 pr-3 font-mono text-xs">{item.plannedPublishTime}</td>
                          <td className="py-2 pr-3">
                            <Badge variant={getStatusBadgeVariant(item.status)}>{statusLabels[item.status]}</Badge>
                          </td>
                          <td className="max-w-[240px] truncate py-2 pr-3 text-xs text-muted-foreground">
                            {item.lastError ?? "-"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="rounded-lg border border-dashed border-border/80 p-4 text-sm text-muted-foreground">
                  生成发布时间表后，每章的计划时间和发布状态会显示在这里。
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">发布任务</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {recentJobs.map((job) => (
                <div key={job.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border/70 p-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant={getStatusBadgeVariant(job.status)}>{dispatchStatusLabels[job.status]}</Badge>
                      <span className="text-sm font-medium">{modeLabel(job.mode)}</span>
                      <span className="font-mono text-xs text-muted-foreground">{job.plannedPublishTime}</span>
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      {job.chapterCount} 章 · {formatDateTime(job.submittedAt)}
                    </div>
                    {job.lastError ? <div className="mt-1 text-xs text-red-600">{job.lastError}</div> : null}
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => onRefreshJob(job.id)}
                    disabled={refreshingJobId === job.id || !job.externalJobId}
                  >
                    <RefreshCw className="h-4 w-4" />
                    {refreshingJobId === job.id ? "刷新中..." : "刷新状态"}
                  </Button>
                </div>
              ))}
              {!recentJobs.length && !isLoading ? (
                <div className="rounded-lg border border-dashed border-border/80 p-4 text-sm text-muted-foreground">
                  提交章节后，发布任务会显示在这里。
                </div>
              ) : null}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
