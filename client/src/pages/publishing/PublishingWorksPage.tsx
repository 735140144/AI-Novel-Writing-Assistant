import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { PublishingKnownBookOption } from "@ai-novel/shared/types/publishing";
import { Link } from "react-router-dom";
import { Loader2, Plus } from "lucide-react";
import {
  createNovelPlatformBinding,
  getNovelList,
  getPublishingAccounts,
  getPublishingWorks,
} from "@/api/novel";
import { queryKeys } from "@/api/queryKeys";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/components/ui/toast";

function credentialStatusVariant(status: string) {
  if (status === "ready") return "default" as const;
  if (status === "expired" || status === "invalid") return "destructive" as const;
  return "secondary" as const;
}

function formatSyncTime(value?: string | null): string {
  if (!value) return "-";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString("zh-CN");
}

function formatProgress(published: number, completed: number, estimated?: number | null): string {
  return `${published}/${completed}/${estimated ?? "-"}`;
}

function findBookOption(
  knownBooks: PublishingKnownBookOption[],
  credentialId: string,
  bookKey: string,
): PublishingKnownBookOption | null {
  return knownBooks.find((item) => item.credentialId === credentialId && item.key === bookKey) ?? null;
}

export default function PublishingWorksPage() {
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedNovelId, setSelectedNovelId] = useState("");
  const [selectedCredentialId, setSelectedCredentialId] = useState("");
  const [selectedKnownBookKey, setSelectedKnownBookKey] = useState("");

  const worksQuery = useQuery({
    queryKey: queryKeys.publishingWorks,
    queryFn: getPublishingWorks,
  });
  const accountsQuery = useQuery({
    queryKey: queryKeys.publishingCredentials,
    queryFn: getPublishingAccounts,
  });
  const novelsQuery = useQuery({
    queryKey: queryKeys.novels.list(1, 100),
    queryFn: () => getNovelList({ page: 1, limit: 100 }),
  });

  const items = worksQuery.data?.data?.items ?? [];
  const credentials = accountsQuery.data?.data?.credentials ?? [];
  const knownBooks: PublishingKnownBookOption[] = accountsQuery.data?.data?.knownBooks ?? [];
  const novels = novelsQuery.data?.data?.items ?? [];

  const selectableNovels = useMemo(() => novels, [novels]);
  const selectedNovel = selectableNovels.find((novel) => novel.id === selectedNovelId) ?? null;
  const filteredKnownBooks: PublishingKnownBookOption[] = knownBooks.filter((item: PublishingKnownBookOption) =>
    !selectedCredentialId || item.credentialId === selectedCredentialId,
  );
  const selectedKnownBook = selectedCredentialId
    ? findBookOption(filteredKnownBooks, selectedCredentialId, selectedKnownBookKey)
    : null;

  const createBindingMutation = useMutation({
    mutationFn: async () => {
      if (!selectedNovelId) {
        throw new Error("请先选择小说。");
      }
      if (!selectedCredentialId) {
        throw new Error("请先选择发布账号。");
      }
      if (!selectedKnownBook) {
        throw new Error("请选择本地已维护书籍。");
      }
      return createNovelPlatformBinding(selectedNovelId, {
        platform: "fanqie",
        credentialId: selectedCredentialId,
        bookId: selectedKnownBook.bookId,
        bookTitle: selectedKnownBook.bookTitle,
      });
    },
    onSuccess: async () => {
      toast.success("绑定作品已加入作品列表。");
      setDialogOpen(false);
      setSelectedNovelId("");
      setSelectedCredentialId("");
      setSelectedKnownBookKey("");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.publishingWorks }),
        queryClient.invalidateQueries({ queryKey: queryKeys.publishingCredentials }),
      ]);
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "绑定作品失败。");
    },
  });

  return (
    <div className="space-y-5">
      <header className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">作品列表</h1>
          <p className="text-sm text-muted-foreground">每一条记录对应一本小说绑定一个发布账号，后续可进入发布详情生成计划并顺序提交章节。</p>
        </div>
        <Button type="button" variant="outline" onClick={() => setDialogOpen(true)}>
          <Plus className="h-4 w-4" />
          添加作品
        </Button>
      </header>

      <div className="overflow-x-auto rounded-lg border">
        <table className="min-w-full text-sm">
          <thead className="bg-muted/40 text-left">
            <tr>
              <th className="px-4 py-3 font-medium">书名</th>
              <th className="px-4 py-3 font-medium">进度</th>
              <th className="px-4 py-3 font-medium">发布平台</th>
              <th className="px-4 py-3 font-medium">发布平台笔名</th>
              <th className="px-4 py-3 font-medium">发布书名</th>
              <th className="px-4 py-3 font-medium">账号状态</th>
              <th className="px-4 py-3 font-medium">最近同步时间</th>
              <th className="px-4 py-3 font-medium">操作</th>
            </tr>
          </thead>
          <tbody>
            {worksQuery.isLoading ? (
              <tr>
                <td className="px-4 py-8 text-muted-foreground" colSpan={8}>
                  <span className="inline-flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    正在加载作品列表。
                  </span>
                </td>
              </tr>
            ) : items.length === 0 ? (
              <tr>
                <td className="px-4 py-8 text-muted-foreground" colSpan={8}>
                  还没有已绑定账号的发布作品。
                </td>
              </tr>
            ) : (
              items.map((item) => (
                <tr key={item.bindingId} className="border-t">
                  <td className="px-4 py-3 align-top">
                    <div className="font-medium">{item.novelTitle}</div>
                    <div className="mt-1 text-xs text-muted-foreground">{item.novelDescription || "-"}</div>
                  </td>
                  <td className="px-4 py-3 align-top text-muted-foreground">
                    {formatProgress(item.publishedChapterCount, item.completedChapterCount, item.estimatedChapterCount)}
                  </td>
                  <td className="px-4 py-3 align-top">番茄</td>
                  <td className="px-4 py-3 align-top">{item.credentialAccountDisplayName || item.credentialLabel}</td>
                  <td className="px-4 py-3 align-top">{item.bookTitle}</td>
                  <td className="px-4 py-3 align-top">
                    <Badge variant={credentialStatusVariant(item.credentialStatus)}>{item.credentialStatus}</Badge>
                  </td>
                  <td className="px-4 py-3 align-top text-muted-foreground">{formatSyncTime(item.lastSyncedAt)}</td>
                  <td className="px-4 py-3 align-top">
                    <Button asChild size="sm" variant="outline">
                      <Link to={`/publishing/works/${item.bindingId}`}>发布详情</Link>
                    </Button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>绑定作品</DialogTitle>
            <DialogDescription>从现有小说里选择作品，再绑定已登录的发布账号和本地已维护书籍。</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">选择小说</label>
              <Select value={selectedNovelId || undefined} onValueChange={setSelectedNovelId}>
                <SelectTrigger>
                  <SelectValue placeholder="选择现有小说" />
                </SelectTrigger>
                <SelectContent>
                  {selectableNovels.map((novel) => (
                    <SelectItem key={novel.id} value={novel.id}>
                      {novel.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">选择发布账号</label>
              <Select
                value={selectedCredentialId || undefined}
                onValueChange={(value) => {
                  setSelectedCredentialId(value);
                  setSelectedKnownBookKey("");
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="选择已登录账号" />
                </SelectTrigger>
                <SelectContent>
                  {credentials.map((credential) => (
                    <SelectItem key={credential.id} value={credential.id}>
                      {(credential.accountDisplayName || credential.label).trim()}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">选择本地已维护书籍</label>
              <Select
                value={selectedKnownBookKey || undefined}
                onValueChange={setSelectedKnownBookKey}
                disabled={!selectedCredentialId}
              >
                <SelectTrigger>
                  <SelectValue placeholder="选择本地已维护书籍" />
                </SelectTrigger>
                <SelectContent>
                  {filteredKnownBooks.map((item) => (
                    <SelectItem key={item.key} value={item.key}>
                      {item.bookTitle}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {selectedNovel ? (
              <section className="rounded-lg border p-4">
                <div className="space-y-2">
                  <div className="text-sm font-medium">{selectedNovel.title}</div>
                  <div className="text-sm text-muted-foreground">{selectedNovel.description || "暂无简介。"}</div>
                  <div className="text-sm text-muted-foreground">
                    已有章节数量/预期章节数量：{selectedNovel._count.chapters}/{selectedNovel.estimatedChapterCount ?? "-"}
                  </div>
                  {selectedKnownBook ? (
                    <div className="text-sm text-muted-foreground">
                      发布书名：{selectedKnownBook.bookTitle}
                      {selectedKnownBook.sourceNovelTitle ? ` · 来源《${selectedKnownBook.sourceNovelTitle}》` : ""}
                    </div>
                  ) : null}
                </div>
              </section>
            ) : null}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
              关闭
            </Button>
            <Button type="button" onClick={() => createBindingMutation.mutate()} disabled={createBindingMutation.isPending}>
              {createBindingMutation.isPending ? "绑定中..." : "保存绑定"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
