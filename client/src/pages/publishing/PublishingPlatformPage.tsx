import { useEffect, useMemo } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { getNovelList } from "@/api/novel";
import { queryKeys } from "@/api/queryKeys";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import PublishingWorkspaceTab from "@/pages/novels/components/PublishingWorkspaceTab";
import { useNovelPublishingWorkspace } from "@/pages/novels/hooks/useNovelPublishingWorkspace";

const DIRECTOR_CREATE_LINK = "/novels/create?mode=director";
const MANUAL_CREATE_LINK = "/novels/create";

const defaultPublishingLlm = {};

function formatNovelStatus(status: string): string {
  return status === "published" ? "已发布" : "草稿";
}

export default function PublishingPlatformPage() {
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedNovelId = searchParams.get("novelId") ?? "";

  const novelListQuery = useQuery({
    queryKey: queryKeys.novels.list(1, 100),
    queryFn: () => getNovelList({ page: 1, limit: 100 }),
    staleTime: 30_000,
  });

  const novels = useMemo(() => novelListQuery.data?.data?.items ?? [], [novelListQuery.data?.data?.items]);
  const selectedNovel = useMemo(
    () => novels.find((novel) => novel.id === selectedNovelId) ?? null,
    [novels, selectedNovelId],
  );
  const activeNovelId = selectedNovel?.id ?? "";

  useEffect(() => {
    if (!novelListQuery.isSuccess || novels.length === 0 || selectedNovel) {
      return;
    }
    const next = new URLSearchParams(searchParams);
    next.set("novelId", novels[0].id);
    setSearchParams(next, { replace: true });
  }, [novelListQuery.isSuccess, novels, searchParams, selectedNovel, setSearchParams]);

  const { tab: publishingTab } = useNovelPublishingWorkspace({
    novelId: activeNovelId,
    llm: defaultPublishingLlm,
    queryClient,
  });

  const handleSelectNovel = (novelId: string) => {
    const next = new URLSearchParams(searchParams);
    next.set("novelId", novelId);
    setSearchParams(next);
  };

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">发布平台</h1>
          <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
            选择要发布的小说，绑定平台账号和书籍，生成每章发布时间并跟踪提交状态。
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild>
            <Link to="/novels/create?mode=director">AI 自动导演开书</Link>
          </Button>
          <Button asChild variant="outline">
            <Link to={MANUAL_CREATE_LINK}>手动创建小说</Link>
          </Button>
        </div>
      </header>

      {novelListQuery.isPending ? (
        <Card>
          <CardContent className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            正在读取可发布的小说。
          </CardContent>
        </Card>
      ) : novelListQuery.isError ? (
        <Card>
          <CardHeader>
            <CardTitle>加载小说失败</CardTitle>
            <CardDescription>当前无法读取小说项目，可以重试一次。</CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={() => void novelListQuery.refetch()}>重新加载</Button>
          </CardContent>
        </Card>
      ) : novels.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>先创建一本小说</CardTitle>
            <CardDescription>
              发布平台会读取小说章节并生成发布时间表。创建小说后，可以在这里选择项目并开始绑定平台账号。
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            <Button asChild>
              <Link to={DIRECTOR_CREATE_LINK}>AI 自动导演开书</Link>
            </Button>
            <Button asChild variant="outline">
              <Link to={MANUAL_CREATE_LINK}>手动创建小说</Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 xl:grid-cols-[300px_minmax(0,1fr)]">
          <aside className="space-y-3">
            <Card className="xl:sticky xl:top-4">
              <CardHeader>
                <CardTitle className="text-base">选择小说</CardTitle>
                <CardDescription>发布计划会应用到当前选中的小说。</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <select
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                  value={activeNovelId}
                  onChange={(event) => handleSelectNovel(event.target.value)}
                >
                  {novels.map((novel) => (
                    <option key={novel.id} value={novel.id}>
                      {novel.title}
                    </option>
                  ))}
                </select>

                <div className="max-h-[520px] space-y-2 overflow-auto pr-1">
                  {novels.map((novel) => {
                    const isSelected = novel.id === activeNovelId;
                    return (
                      <button
                        key={novel.id}
                        type="button"
                        className={cn(
                          "w-full rounded-lg border px-3 py-3 text-left text-sm transition",
                          isSelected
                            ? "border-primary bg-primary/10 text-primary"
                            : "border-border/70 bg-background hover:border-primary/40 hover:bg-primary/5",
                        )}
                        onClick={() => handleSelectNovel(novel.id)}
                      >
                        <div className="flex min-w-0 items-center justify-between gap-2">
                          <span className="truncate font-medium">{novel.title}</span>
                          <Badge variant={novel.status === "published" ? "default" : "secondary"}>
                            {formatNovelStatus(novel.status)}
                          </Badge>
                        </div>
                        <div className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                          {novel.description || "可选择这本小说生成发布计划。"}
                        </div>
                        <div className="mt-2 text-xs text-muted-foreground">
                          {novel._count.chapters} 章
                        </div>
                      </button>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          </aside>

          <section className="min-w-0 space-y-4">
            {selectedNovel ? (
              <div className="rounded-xl border border-border/70 bg-muted/20 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 space-y-1">
                    <div className="flex min-w-0 flex-wrap items-center gap-2">
                      <h2 className="truncate text-lg font-semibold">{selectedNovel.title}</h2>
                      <Badge variant={selectedNovel.status === "published" ? "default" : "secondary"}>
                        {formatNovelStatus(selectedNovel.status)}
                      </Badge>
                    </div>
                    <p className="text-sm leading-6 text-muted-foreground">
                      {selectedNovel.description || "为这本小说绑定平台书籍，生成发布时间表并提交章节。"}
                    </p>
                  </div>
                  <Button asChild variant="outline" size="sm">
                    <Link to={`/novels/${selectedNovel.id}/edit`}>进入小说工作台</Link>
                  </Button>
                </div>
              </div>
            ) : null}

            {activeNovelId ? (
              <PublishingWorkspaceTab {...publishingTab} />
            ) : (
              <Card>
                <CardContent className="py-8 text-sm text-muted-foreground">
                  请选择要发布的小说。
                </CardContent>
              </Card>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
