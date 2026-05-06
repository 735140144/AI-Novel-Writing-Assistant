import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createBillingPackageTemplate,
  createBillingRedeemCodes,
  getBillingModelPrices,
  getBillingPackageTemplates,
  getBillingRedeemCodes,
  saveBillingModelPrices,
  updateBillingPackageTemplate,
  updateBillingRedeemCodeStatus,
} from "@/api/billing";
import { queryKeys } from "@/api/queryKeys";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import SettingsActionResult from "./SettingsActionResult";

type ModelPriceForm = {
  inputPricePerM: string;
  outputPricePerM: string;
  cacheHitPricePerM: string;
  isActive: boolean;
};

type PackageTemplateForm = {
  kind: "balance" | "monthly";
  name: string;
  description: string;
  balanceAmount: string;
  dailyQuotaAmount: string;
  durationDays: string;
  sortOrder: string;
  isActive: boolean;
};

const emptyTemplateForm: PackageTemplateForm = {
  kind: "monthly",
  name: "",
  description: "",
  balanceAmount: "0",
  dailyQuotaAmount: "100",
  durationDays: "30",
  sortOrder: "0",
  isActive: true,
};

const EMPTY_MODEL_PRICES: ReadonlyArray<{
  id: string;
  provider: string;
  model: string;
  inputPricePerM: number;
  outputPricePerM: number;
  cacheHitPricePerM: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}> = [];

const EMPTY_PACKAGE_TEMPLATES: ReadonlyArray<{
  id: string;
  kind: "balance" | "monthly";
  name: string;
  description: string | null;
  balanceAmount: number | null;
  dailyQuotaAmount: number | null;
  durationDays: number;
  isActive: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}> = [];

const EMPTY_REDEEM_CODES: ReadonlyArray<{
  id: string;
  code: string;
  kind: "balance" | "monthly";
  status: "unused" | "redeemed" | "expired" | "disabled";
  templateId: string | null;
  templateName: string;
  balanceAmount: number | null;
  dailyQuotaAmount: number | null;
  durationDays: number | null;
  expiresAt: string | null;
  redeemedAt: string | null;
  redeemedByUserId: string | null;
  redeemedByUserEmail: string | null;
  createdByUserId: string | null;
  createdByUserEmail: string | null;
  createdAt: string;
  updatedAt: string;
}> = [];

function getTemplateKindLabel(kind: "balance" | "monthly") {
  return kind === "monthly" ? "包月套餐" : "总额度套餐";
}

function getRedeemStatusLabel(status: "unused" | "redeemed" | "expired" | "disabled") {
  switch (status) {
    case "unused":
      return "未兑换";
    case "redeemed":
      return "已兑换";
    case "expired":
      return "已过期";
    case "disabled":
      return "已停用";
    default:
      return status;
  }
}

export default function BillingManagementPage() {
  const queryClient = useQueryClient();
  const [result, setResult] = useState("");
  const [templateId, setTemplateId] = useState("");
  const [redeemTemplateId, setRedeemTemplateId] = useState("");
  const [redeemCount, setRedeemCount] = useState("1");
  const [templateForm, setTemplateForm] = useState<PackageTemplateForm>(emptyTemplateForm);
  const [modelForms, setModelForms] = useState<Record<string, ModelPriceForm>>({});

  const modelPricesQuery = useQuery({
    queryKey: queryKeys.settings.billingModelPrices,
    queryFn: getBillingModelPrices,
  });
  const packageTemplatesQuery = useQuery({
    queryKey: queryKeys.settings.billingPackageTemplates,
    queryFn: getBillingPackageTemplates,
  });
  const redeemCodesQuery = useQuery({
    queryKey: queryKeys.settings.billingRedeemCodes,
    queryFn: getBillingRedeemCodes,
  });

  const modelPrices = modelPricesQuery.data?.data ?? EMPTY_MODEL_PRICES;
  const packageTemplates = packageTemplatesQuery.data?.data ?? EMPTY_PACKAGE_TEMPLATES;
  const redeemCodes = redeemCodesQuery.data?.data ?? EMPTY_REDEEM_CODES;

  const selectedTemplate = useMemo(
    () => packageTemplates.find((item) => item.id === templateId) ?? null,
    [packageTemplates, templateId],
  );
  const selectedRedeemTemplate = useMemo(
    () => packageTemplates.find((item) => item.id === redeemTemplateId) ?? packageTemplates[0] ?? null,
    [packageTemplates, redeemTemplateId],
  );

  useEffect(() => {
    setModelForms((current) => {
      const next: Record<string, ModelPriceForm> = {};
      for (const item of modelPrices) {
        next[item.id] = current[item.id] ?? {
          inputPricePerM: String(item.inputPricePerM),
          outputPricePerM: String(item.outputPricePerM),
          cacheHitPricePerM: String(item.cacheHitPricePerM),
          isActive: item.isActive,
        };
      }
      return next;
    });
  }, [modelPrices]);

  useEffect(() => {
    if (!selectedTemplate) {
      setTemplateForm(emptyTemplateForm);
      return;
    }
    setTemplateForm({
      kind: selectedTemplate.kind,
      name: selectedTemplate.name,
      description: selectedTemplate.description ?? "",
      balanceAmount: String(selectedTemplate.balanceAmount ?? 0),
      dailyQuotaAmount: String(selectedTemplate.dailyQuotaAmount ?? 0),
      durationDays: String(selectedTemplate.durationDays),
      sortOrder: String(selectedTemplate.sortOrder),
      isActive: selectedTemplate.isActive,
    });
  }, [selectedTemplate]);

  const refreshAll = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.settings.billingModelPrices }),
      queryClient.invalidateQueries({ queryKey: queryKeys.settings.billingPackageTemplates }),
      queryClient.invalidateQueries({ queryKey: queryKeys.settings.billingRedeemCodes }),
    ]);
  };

  const saveModelPricesMutation = useMutation({
    mutationFn: () =>
      saveBillingModelPrices(
        modelPrices.map((item) => {
          const form = modelForms[item.id];
          return {
            provider: item.provider,
            model: item.model,
            inputPricePerM: Number(form?.inputPricePerM ?? item.inputPricePerM) || 0,
            outputPricePerM: Number(form?.outputPricePerM ?? item.outputPricePerM) || 0,
            cacheHitPricePerM: Number(form?.cacheHitPricePerM ?? item.cacheHitPricePerM) || 0,
            isActive: form?.isActive ?? item.isActive,
          };
        }),
      ),
    onSuccess: async (response) => {
      setResult(response.message ?? "模型价格已保存。");
      await refreshAll();
    },
  });

  const createTemplateMutation = useMutation({
    mutationFn: () =>
      createBillingPackageTemplate({
        kind: templateForm.kind,
        name: templateForm.name.trim(),
        description: templateForm.description.trim() || undefined,
        balanceAmount: templateForm.kind === "balance" ? Number(templateForm.balanceAmount) || 0 : null,
        dailyQuotaAmount: templateForm.kind === "monthly" ? Number(templateForm.dailyQuotaAmount) || 0 : null,
        durationDays: templateForm.kind === "monthly" ? Number(templateForm.durationDays) || 30 : 30,
        isActive: templateForm.isActive,
        sortOrder: Number(templateForm.sortOrder) || 0,
      }),
    onSuccess: async (response) => {
      setResult(response.message ?? "套餐模板已创建。");
      setTemplateId("");
      setTemplateForm(emptyTemplateForm);
      await refreshAll();
    },
  });

  const updateTemplateMutation = useMutation({
    mutationFn: () => {
      if (!selectedTemplate) {
        throw new Error("请先选择套餐模板。");
      }
      return updateBillingPackageTemplate(selectedTemplate.id, {
        name: templateForm.name.trim(),
        description: templateForm.description.trim() || undefined,
        balanceAmount: templateForm.kind === "balance" ? Number(templateForm.balanceAmount) || 0 : null,
        dailyQuotaAmount: templateForm.kind === "monthly" ? Number(templateForm.dailyQuotaAmount) || 0 : null,
        durationDays: templateForm.kind === "monthly" ? Number(templateForm.durationDays) || 30 : 30,
        isActive: templateForm.isActive,
        sortOrder: Number(templateForm.sortOrder) || 0,
      });
    },
    onSuccess: async (response) => {
      setResult(response.message ?? "套餐模板已更新。");
      await refreshAll();
    },
  });

  const createRedeemMutation = useMutation({
    mutationFn: () => {
      if (!selectedRedeemTemplate) {
        throw new Error("请先选择套餐模板。");
      }
      return createBillingRedeemCodes({
        templateId: selectedRedeemTemplate.id,
        count: Number.parseInt(redeemCount, 10) || 1,
      });
    },
    onSuccess: async (response) => {
      setResult(response.message ?? "兑换码已生成。");
      await refreshAll();
    },
  });

  const updateRedeemStatusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: "unused" | "redeemed" | "expired" | "disabled" }) =>
      updateBillingRedeemCodeStatus(id, status),
    onSuccess: async (response) => {
      setResult(response.message ?? "兑换码状态已更新。");
      await refreshAll();
    },
  });

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold">计费管理</h1>
        <p className="text-sm text-muted-foreground">管理模型价格、套餐模板和兑换码。</p>
      </div>
      <SettingsActionResult message={result} />

      <Card>
        <CardHeader>
          <CardTitle>模型价格</CardTitle>
          <CardDescription>按 1M tokens 设置输入、输出和缓存命中价格。</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {modelPrices.length === 0 ? (
            <div className="text-sm text-muted-foreground">暂无模型价格。</div>
          ) : (
            modelPrices.map((item) => {
              const form = modelForms[item.id] ?? {
                inputPricePerM: String(item.inputPricePerM),
                outputPricePerM: String(item.outputPricePerM),
                cacheHitPricePerM: String(item.cacheHitPricePerM),
                isActive: item.isActive,
              };
              return (
                <div key={item.id} className="grid gap-3 rounded-md border p-3 md:grid-cols-[1.2fr_1.2fr_1fr_1fr_1fr_auto]">
                  <div className="space-y-1">
                    <div className="text-xs text-muted-foreground">服务商</div>
                    <div className="font-medium">{item.provider}</div>
                  </div>
                  <div className="space-y-1">
                    <div className="text-xs text-muted-foreground">模型</div>
                    <div className="font-medium">{item.model}</div>
                  </div>
                  <label className="space-y-1 text-sm">
                    <div className="text-xs text-muted-foreground">输入</div>
                    <Input
                      value={form.inputPricePerM}
                      onChange={(event) =>
                        setModelForms((current) => ({
                          ...current,
                          [item.id]: { ...form, inputPricePerM: event.target.value },
                        }))
                      }
                    />
                  </label>
                  <label className="space-y-1 text-sm">
                    <div className="text-xs text-muted-foreground">输出</div>
                    <Input
                      value={form.outputPricePerM}
                      onChange={(event) =>
                        setModelForms((current) => ({
                          ...current,
                          [item.id]: { ...form, outputPricePerM: event.target.value },
                        }))
                      }
                    />
                  </label>
                  <label className="space-y-1 text-sm">
                    <div className="text-xs text-muted-foreground">缓存命中</div>
                    <Input
                      value={form.cacheHitPricePerM}
                      onChange={(event) =>
                        setModelForms((current) => ({
                          ...current,
                          [item.id]: { ...form, cacheHitPricePerM: event.target.value },
                        }))
                      }
                    />
                  </label>
                  <div className="flex items-end justify-between gap-3">
                    <div className="flex items-center gap-2 text-sm">
                      <span className="text-xs text-muted-foreground">启用</span>
                      <Switch
                        checked={form.isActive}
                        onCheckedChange={(checked) =>
                          setModelForms((current) => ({
                            ...current,
                            [item.id]: { ...form, isActive: checked },
                          }))
                        }
                      />
                    </div>
                    <Badge variant={item.isActive ? "default" : "outline"}>{item.isActive ? "启用" : "停用"}</Badge>
                  </div>
                </div>
              );
            })
          )}
          <Button onClick={() => saveModelPricesMutation.mutate()} disabled={saveModelPricesMutation.isPending}>
            保存模型价格
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>套餐模板</CardTitle>
          <CardDescription>创建总额度套餐或包月套餐，包月套餐按 UTC+8 每日刷新额度。</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-2">
            <label className="space-y-1 text-sm">
              <div className="text-xs text-muted-foreground">模板类型</div>
              <Select value={templateForm.kind} onValueChange={(value) => setTemplateForm((current) => ({ ...current, kind: value as PackageTemplateForm["kind"] }))}>
                <SelectTrigger>
                  <SelectValue placeholder="选择类型" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="monthly">包月套餐</SelectItem>
                  <SelectItem value="balance">总额度套餐</SelectItem>
                </SelectContent>
              </Select>
            </label>
            <label className="space-y-1 text-sm">
              <div className="text-xs text-muted-foreground">名称</div>
              <Input value={templateForm.name} onChange={(event) => setTemplateForm((current) => ({ ...current, name: event.target.value }))} />
            </label>
            <label className="space-y-1 text-sm md:col-span-2">
              <div className="text-xs text-muted-foreground">说明</div>
              <textarea
                className="min-h-20 rounded-md border bg-background px-3 py-2 text-sm"
                value={templateForm.description}
                onChange={(event) => setTemplateForm((current) => ({ ...current, description: event.target.value }))}
              />
            </label>
            <label className="space-y-1 text-sm">
              <div className="text-xs text-muted-foreground">总额度</div>
              <Input
                value={templateForm.balanceAmount}
                onChange={(event) => setTemplateForm((current) => ({ ...current, balanceAmount: event.target.value }))}
                disabled={templateForm.kind !== "balance"}
              />
            </label>
            <label className="space-y-1 text-sm">
              <div className="text-xs text-muted-foreground">每日额度</div>
              <Input
                value={templateForm.dailyQuotaAmount}
                onChange={(event) => setTemplateForm((current) => ({ ...current, dailyQuotaAmount: event.target.value }))}
                disabled={templateForm.kind !== "monthly"}
              />
            </label>
            <label className="space-y-1 text-sm">
              <div className="text-xs text-muted-foreground">有效期（天）</div>
              <Input
                value={templateForm.durationDays}
                onChange={(event) => setTemplateForm((current) => ({ ...current, durationDays: event.target.value }))}
                disabled={templateForm.kind !== "monthly"}
              />
            </label>
            <label className="space-y-1 text-sm">
              <div className="text-xs text-muted-foreground">排序</div>
              <Input value={templateForm.sortOrder} onChange={(event) => setTemplateForm((current) => ({ ...current, sortOrder: event.target.value }))} />
            </label>
            <div className="flex items-center justify-between rounded-md border px-3 py-2 md:col-span-2">
              <div>
                <div className="text-sm font-medium">启用模板</div>
                <div className="text-xs text-muted-foreground">启用后可用于生成兑换码。</div>
              </div>
              <Switch
                checked={templateForm.isActive}
                onCheckedChange={(checked) => setTemplateForm((current) => ({ ...current, isActive: checked }))}
              />
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button onClick={() => createTemplateMutation.mutate()} disabled={createTemplateMutation.isPending}>
              新建模板
            </Button>
            <Button
              variant="outline"
              onClick={() => updateTemplateMutation.mutate()}
              disabled={!selectedTemplate || updateTemplateMutation.isPending}
            >
              保存当前模板
            </Button>
          </div>

          <div className="space-y-2">
            {packageTemplates.length === 0 ? (
              <div className="text-sm text-muted-foreground">暂无套餐模板。</div>
            ) : (
              packageTemplates.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setTemplateId(item.id)}
                  className={`flex w-full items-center justify-between rounded-md border px-3 py-3 text-left transition ${
                    selectedTemplate?.id === item.id ? "border-primary bg-primary/5" : "hover:bg-muted/40"
                  }`}
                >
                  <div className="space-y-1">
                    <div className="font-medium">{item.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {item.kind === "monthly"
                        ? `包月套餐 · 每日额度 ${item.dailyQuotaAmount ?? 0} · 有效期 ${item.durationDays} 天`
                        : `总额度套餐 · 余额 ${item.balanceAmount ?? 0}`}
                    </div>
                  </div>
                  <Badge variant={item.isActive ? "default" : "outline"}>{item.isActive ? "启用" : "停用"}</Badge>
                </button>
              ))
            )}
          </div>
          <div className="text-xs text-muted-foreground">
            {selectedTemplate ? `当前编辑：${selectedTemplate.name}` : "当前编辑：新模板"}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>兑换码</CardTitle>
          <CardDescription>生成一次性兑换码并查看当前状态。</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <Select value={redeemTemplateId || selectedRedeemTemplate?.id || ""} onValueChange={setRedeemTemplateId}>
              <SelectTrigger className="w-64">
                <SelectValue placeholder="选择套餐模板" />
              </SelectTrigger>
              <SelectContent>
                {packageTemplates.map((item) => (
                  <SelectItem key={item.id} value={item.id}>
                    {item.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input value={redeemCount} onChange={(event) => setRedeemCount(event.target.value)} className="w-24" />
            <Button onClick={() => createRedeemMutation.mutate()} disabled={createRedeemMutation.isPending}>
              生成兑换码
            </Button>
          </div>

          <div className="space-y-2">
            {redeemCodes.length === 0 ? (
              <div className="text-sm text-muted-foreground">暂无兑换码。</div>
            ) : (
              redeemCodes.map((item) => (
                <div key={item.id} className="flex flex-wrap items-center justify-between gap-3 rounded-md border p-3">
                  <div className="space-y-1">
                    <div className="font-medium">{item.code}</div>
                    <div className="text-xs text-muted-foreground">
                      {item.templateName} · {getTemplateKindLabel(item.kind)}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {item.kind === "monthly"
                        ? `每日额度 ${item.dailyQuotaAmount ?? 0} · 有效期 ${item.durationDays ?? 0} 天`
                        : `余额 ${item.balanceAmount ?? 0}`}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={item.status === "unused" ? "secondary" : "outline"}>{getRedeemStatusLabel(item.status)}</Badge>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => updateRedeemStatusMutation.mutate({ id: item.id, status: "disabled" })}
                    >
                      停用
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
