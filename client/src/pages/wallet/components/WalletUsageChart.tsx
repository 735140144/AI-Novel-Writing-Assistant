import type { BillingDailyUsageSummary } from "@ai-novel/shared/types/billing";

function buildSmoothPath(points: Array<{ x: number; y: number }>): string {
  if (points.length === 0) {
    return "";
  }
  if (points.length === 1) {
    return `M ${points[0].x} ${points[0].y}`;
  }

  let path = `M ${points[0].x} ${points[0].y}`;
  for (let index = 0; index < points.length - 1; index += 1) {
    const current = points[index];
    const next = points[index + 1];
    const controlX = (current.x + next.x) / 2;
    path += ` Q ${controlX} ${current.y}, ${next.x} ${next.y}`;
  }
  return path;
}

export default function WalletUsageChart({
  data,
  mode,
}: {
  data: BillingDailyUsageSummary[];
  mode: "money" | "tokens";
}) {
  if (data.length === 0) {
    return (
      <div className="flex h-48 items-center justify-center rounded-md border bg-background text-sm text-muted-foreground">
        暂无使用记录
      </div>
    );
  }

  const values = data.map((item) => mode === "money" ? item.moneySpent : item.totalTokens);
  const max = Math.max(1, ...values);
  const points = values.map((value, index) => {
    const x = data.length > 1 ? (index / (data.length - 1)) * 100 : 100;
    const y = 100 - (value / max) * 100;
    return { x, y };
  });
  const path = buildSmoothPath(points);
  return (
    <div className="space-y-2">
      <div className="text-xs text-muted-foreground">{mode === "money" ? "金额消耗" : "Token 消耗"}</div>
      <svg viewBox="0 0 100 100" className="h-48 w-full rounded-md border bg-background">
        <path d={path} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    </div>
  );
}
