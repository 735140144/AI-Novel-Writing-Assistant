import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import {
  consumeWalletRedeemCode,
  getWalletDailyUsage,
  getWalletRedeemHistory,
  getWalletSummary,
} from "@/api/billing";
import { queryKeys } from "@/api/queryKeys";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import WalletUsageChart from "./components/WalletUsageChart";

export default function WalletPage() {
  const queryClient = useQueryClient();
  const [code, setCode] = useState("");
  const summaryQuery = useQuery({ queryKey: queryKeys.wallet.summary, queryFn: getWalletSummary });
  const usageQuery = useQuery({ queryKey: queryKeys.wallet.dailyUsage(30), queryFn: () => getWalletDailyUsage(30) });
  const historyQuery = useQuery({ queryKey: queryKeys.wallet.redeemHistory, queryFn: getWalletRedeemHistory });

  const consumeMutation = useMutation({
    mutationFn: () => consumeWalletRedeemCode(code),
    onSuccess: async () => {
      setCode("");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.wallet.summary }),
        queryClient.invalidateQueries({ queryKey: queryKeys.wallet.dailyUsage(30) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.wallet.redeemHistory }),
      ]);
    },
  });

  const summary = summaryQuery.data?.data;
  const usage = usageQuery.data?.data ?? [];
  const history = historyQuery.data?.data ?? [];
  const modelPrices = summary?.modelPrices ?? [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">钱包</h1>
        <p className="text-sm text-muted-foreground">查看套餐、余额、模型价格和使用记录。</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>当前套餐</CardTitle>
          <CardDescription>先扣每日套餐额度，再扣钱包余额。</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-3 md:grid-cols-3">
            <div className="rounded-md border p-3">
              <div className="text-xs text-muted-foreground">钱包余额</div>
              <div className="mt-1 text-lg font-semibold">{summary?.wallet.balanceAmount ?? 0}</div>
            </div>
            <div className="rounded-md border p-3">
              <div className="text-xs text-muted-foreground">当前套餐数</div>
              <div className="mt-1 text-lg font-semibold">{summary?.totals.activePackageCount ?? 0}</div>
            </div>
            <div className="rounded-md border p-3">
              <div className="text-xs text-muted-foreground">今日可用额度</div>
              <div className="mt-1 text-lg font-semibold">{summary?.totals.totalDailyRemainingAmount ?? 0}</div>
            </div>
          </div>

          {summary?.activePackages.length ? (
            summary.activePackages.map((item) => (
              <div key={item.id} className="flex flex-wrap items-center justify-between gap-3 rounded-md border p-3">
                <div className="space-y-1">
                  <div className="font-medium">{item.templateName}</div>
                  <div className="text-xs text-muted-foreground">
                    {item.kind === "monthly"
                      ? `每日额度 ${item.dailyQuotaAmount ?? 0} · 剩余 ${item.dailyRemainingAmount ?? 0}`
                      : "总额度套餐"}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    有效期至 {item.expiresAt.slice(0, 10)}
                  </div>
                </div>
                <Badge>{item.status}</Badge>
              </div>
            ))
          ) : (
            <div className="text-sm text-muted-foreground">暂无可用套餐。</div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>模型价格</CardTitle>
          <CardDescription>按 1M tokens 计价。</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {modelPrices.map((item) => (
            <div key={`${item.provider}:${item.model}`} className="grid gap-2 rounded-md border p-3 md:grid-cols-4">
              <div>
                <div className="text-xs text-muted-foreground">服务商</div>
                <div className="font-medium">{item.provider}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">模型</div>
                <div className="font-medium">{item.model}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">输入 / 输出</div>
                <div className="font-medium">
                  {item.inputPricePerM} / {item.outputPricePerM}
                </div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">缓存命中</div>
                <div className="font-medium">{item.cacheHitPricePerM}</div>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>使用趋势</CardTitle>
          <CardDescription>最近 30 天的金额与 token 消耗。</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <WalletUsageChart data={usage} mode="money" />
          <WalletUsageChart data={usage} mode="tokens" />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>兑换码兑换</CardTitle>
        </CardHeader>
        <CardContent className="flex gap-2">
          <Input value={code} onChange={(event) => setCode(event.target.value)} placeholder="输入兑换码" />
          <Button onClick={() => consumeMutation.mutate()} disabled={consumeMutation.isPending}>
            {consumeMutation.isPending ? "兑换中..." : "兑换"}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>兑换记录</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {history.map((item) => (
            <div key={item.id} className="flex items-center justify-between rounded-md border p-3">
              <div>
                <div className="font-medium">{item.code}</div>
                <div className="text-xs text-muted-foreground">{item.templateName}</div>
              </div>
              <Badge>{item.kind === "monthly" ? "包月套餐" : "总额度套餐"}</Badge>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
