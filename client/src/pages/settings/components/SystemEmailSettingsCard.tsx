import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getSystemEmailSettings, saveSystemEmailSettings, type SystemEmailSettings } from "@/api/settings";
import { queryKeys } from "@/api/queryKeys";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";

export default function SystemEmailSettingsCard(props: {
  onActionResult: (message: string) => void;
}) {
  const { onActionResult } = props;
  const queryClient = useQueryClient();
  const settingsQuery = useQuery({
    queryKey: queryKeys.settings.systemEmail,
    queryFn: getSystemEmailSettings,
  });
  const [form, setForm] = useState<SystemEmailSettings>({
    smtpHost: "",
    smtpPort: 587,
    smtpSecure: false,
    smtpUser: "",
    smtpPassword: "",
    fromEmail: "",
    fromName: "",
  });

  useEffect(() => {
    if (!settingsQuery.data?.data) {
      return;
    }
    setForm(settingsQuery.data.data);
  }, [settingsQuery.data?.data]);

  const mutation = useMutation({
    mutationFn: (payload: SystemEmailSettings) => saveSystemEmailSettings(payload),
    onSuccess: async (response) => {
      onActionResult(response.message ?? "系统邮件设置已保存。");
      await queryClient.invalidateQueries({ queryKey: queryKeys.settings.systemEmail });
    },
    onError: (error) => {
      onActionResult(error instanceof Error ? error.message : "保存系统邮件设置失败。");
    },
  });

  return (
    <Card className="min-w-0 overflow-hidden">
      <CardHeader>
        <CardTitle>系统邮件</CardTitle>
        <CardDescription>设置验证邮件和重置密码邮件的发件服务器、发件人和登录信息。</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 md:grid-cols-2">
          <Input value={form.smtpHost} placeholder="SMTP 主机" onChange={(event) => setForm((prev) => ({ ...prev, smtpHost: event.target.value }))} />
          <Input value={String(form.smtpPort)} placeholder="SMTP 端口" onChange={(event) => setForm((prev) => ({ ...prev, smtpPort: Number(event.target.value) || 0 }))} />
          <Input value={form.smtpUser} placeholder="SMTP 用户名" onChange={(event) => setForm((prev) => ({ ...prev, smtpUser: event.target.value }))} />
          <Input value={form.smtpPassword} placeholder="SMTP 密码" type="password" onChange={(event) => setForm((prev) => ({ ...prev, smtpPassword: event.target.value }))} />
          <Input value={form.fromEmail} placeholder="发件邮箱" onChange={(event) => setForm((prev) => ({ ...prev, fromEmail: event.target.value }))} />
          <Input value={form.fromName} placeholder="发件名称" onChange={(event) => setForm((prev) => ({ ...prev, fromName: event.target.value }))} />
        </div>
        <label className="flex items-center gap-3 rounded-md border px-3 py-2">
          <Switch checked={form.smtpSecure} onCheckedChange={(checked) => setForm((prev) => ({ ...prev, smtpSecure: checked }))} />
          <span className="text-sm">使用加密连接</span>
        </label>
        <div className="flex justify-end">
          <Button onClick={() => mutation.mutate(form)} disabled={mutation.isPending}>
            {mutation.isPending ? "保存中..." : "保存系统邮件设置"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
