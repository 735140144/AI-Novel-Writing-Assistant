import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, QrCode, RefreshCw } from "lucide-react";
import type { PublishingLoginChallenge, PublishingPlatformCredential } from "@ai-novel/shared/types/publishing";
import {
  bootstrapPublishingCredentialLogin,
  createPublishingCredential,
  getPublishingAccounts,
  validatePublishingCredential,
} from "@/api/novel";
import { queryKeys } from "@/api/queryKeys";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const statusLabels: Record<PublishingPlatformCredential["status"], string> = {
  created: "待扫码",
  login_pending: "等待扫码",
  ready: "可发布",
  expired: "需要重新扫码",
  invalid: "不可用",
};

function parseChallenge(value: unknown): PublishingLoginChallenge | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as PublishingLoginChallenge;
}

function statusVariant(status: PublishingPlatformCredential["status"]) {
  if (status === "ready") return "default" as const;
  if (status === "expired" || status === "invalid") return "destructive" as const;
  return "secondary" as const;
}

export default function PublishingAccountsPage() {
  const queryClient = useQueryClient();
  const [accountLabel, setAccountLabel] = useState("番茄作者号");
  const [activeCredentialId, setActiveCredentialId] = useState("");

  const accountsQuery = useQuery({
    queryKey: queryKeys.publishingCredentials,
    queryFn: getPublishingAccounts,
  });

  const credentials = accountsQuery.data?.data?.credentials ?? [];
  const activeCredential = useMemo(
    () => credentials.find((credential) => credential.id === activeCredentialId) ?? credentials[0] ?? null,
    [activeCredentialId, credentials],
  );
  const latestChallenge = activeCredential?.status === "ready"
    ? null
    : parseChallenge(activeCredential?.lastLoginChallengeJson);

  const reloadAccounts = async () => {
    await queryClient.invalidateQueries({ queryKey: queryKeys.publishingCredentials });
  };

  const createMutation = useMutation({
    mutationFn: () => createPublishingCredential({ label: accountLabel.trim() || "番茄作者号", platform: "fanqie" }),
    onSuccess: async (response) => {
      if (response.data?.id) {
        setActiveCredentialId(response.data.id);
      }
      await reloadAccounts();
    },
  });

  const bootstrapMutation = useMutation({
    mutationFn: (credentialId: string) => bootstrapPublishingCredentialLogin(credentialId),
    onSuccess: async (_response, credentialId) => {
      setActiveCredentialId(credentialId);
      await reloadAccounts();
    },
  });

  const refreshMutation = useMutation({
    mutationFn: (credentialId: string) => validatePublishingCredential(credentialId),
    onSuccess: async (_response, credentialId) => {
      setActiveCredentialId(credentialId);
      await reloadAccounts();
    },
  });

  return (
    <div className="space-y-5">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">账号管理</h1>
        <p className="text-sm text-muted-foreground">绑定番茄账号，创建扫码账号，扫码登录后刷新账号状态。</p>
      </header>

      <section className="grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
        <div className="space-y-3 rounded-lg border p-4">
          <h2 className="text-base font-medium">绑定番茄账号</h2>
          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor="publishing-account-label">账号标签</label>
            <Input
              id="publishing-account-label"
              value={accountLabel}
              onChange={(event) => setAccountLabel(event.target.value)}
              placeholder="番茄作者号"
            />
          </div>
          <Button type="button" className="w-full" onClick={() => createMutation.mutate()} disabled={createMutation.isPending}>
            <QrCode className="h-4 w-4" />
            {createMutation.isPending ? "创建中..." : "创建扫码账号"}
          </Button>
        </div>

        <div className="space-y-3 rounded-lg border p-4">
          <h2 className="text-base font-medium">账号列表</h2>
          {accountsQuery.isLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              正在加载账号。
            </div>
          ) : credentials.length === 0 ? (
            <div className="text-sm text-muted-foreground">还没有绑定账号。</div>
          ) : (
            <div className="space-y-3">
              {credentials.map((credential) => (
                <div
                  key={credential.id}
                  className="rounded-md border p-3"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 space-y-1">
                      <div className="truncate font-medium">{credential.accountDisplayName || credential.label}</div>
                      <div className="truncate text-xs text-muted-foreground">{credential.credentialUuid}</div>
                    </div>
                    <Badge variant={statusVariant(credential.status)}>{statusLabels[credential.status]}</Badge>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => bootstrapMutation.mutate(credential.id)}
                      disabled={bootstrapMutation.isPending}
                    >
                      <QrCode className="h-4 w-4" />
                      扫码登录
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => refreshMutation.mutate(credential.id)}
                      disabled={refreshMutation.isPending}
                    >
                      <RefreshCw className="h-4 w-4" />
                      刷新
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {latestChallenge?.qrCodeBase64Png ? (
        <section className="space-y-2 rounded-lg border p-4">
          <h2 className="text-base font-medium">扫码登录</h2>
          <img
            src={`data:image/png;base64,${latestChallenge.qrCodeBase64Png}`}
            alt="番茄账号扫码登录二维码"
            className="h-40 w-40 rounded-md border bg-white object-contain"
          />
          <p className="text-xs text-muted-foreground">有效期：{latestChallenge.expiresAt ?? "请尽快扫码"}</p>
        </section>
      ) : null}
    </div>
  );
}
