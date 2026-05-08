import { useState } from "react";
import AutoDirectorSettingsSection from "@/pages/settings/AutoDirectorSettingsSection";
import SettingsActionResult from "@/pages/settings/SettingsActionResult";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function PreferencesPage() {
  const [actionResult, setActionResult] = useState("");

  return (
    <div className="space-y-4">
      <Card className="min-w-0 overflow-hidden">
        <CardHeader>
          <CardTitle>个人偏好</CardTitle>
          <CardDescription>配置你自己的自动推进默认授权和导演跟进通道。</CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          这些设置只作用于当前账号。管理员可以在系统设置中配置公共邮件与模型厂商。
        </CardContent>
      </Card>
      <SettingsActionResult message={actionResult} />
      <AutoDirectorSettingsSection
        onActionResult={(message) => {
          setActionResult(message);
        }}
      />
    </div>
  );
}
