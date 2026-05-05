import { useState } from "react";
import { Link } from "react-router-dom";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useMutation } from "@tanstack/react-query";
import { resetPasswordWithToken } from "@/api/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";
import AuthCardShell from "./AuthCardShell";

export default function ResetPasswordPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token")?.trim() ?? "";
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [completed, setCompleted] = useState(false);
  const resetPasswordMutation = useMutation({
    mutationFn: resetPasswordWithToken,
    onSuccess: () => {
      setCompleted(true);
      toast.success("密码已重置，请使用新密码登录。");
      navigate("/login", { replace: true });
    },
  });

  return (
    <AuthCardShell
      title="设置新的登录密码"
      subtitle="完成密码重置后，你可以继续使用原有私有创作空间。"
    >
      {!token ? (
        <div className="space-y-4 text-sm text-slate-600">
          <p>这个重置入口无效，请重新获取新的重置邮件。</p>
          <Link to="/forgot-password" className="inline-flex text-sm font-medium text-slate-900 hover:underline">重新获取重置入口</Link>
        </div>
      ) : completed ? (
        <div className="space-y-4 text-sm text-slate-600">
          <p>密码已更新，现在可以返回登录页继续使用你的账号。</p>
          <Link to="/login" className="inline-flex text-sm font-medium text-slate-900 hover:underline">返回登录</Link>
        </div>
      ) : (
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (password !== confirmPassword) {
              toast.error("两次输入的密码不一致。");
              return;
            }
            resetPasswordMutation.mutate({ token, password });
          }}
        >
          <div className="space-y-2">
            <div className="text-sm font-medium">新密码</div>
            <Input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="new-password"
              placeholder="请输入新密码"
            />
          </div>
          <div className="space-y-2">
            <div className="text-sm font-medium">确认新密码</div>
            <Input
              type="password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              autoComplete="new-password"
              placeholder="再次输入新密码"
            />
          </div>
          <Button type="submit" className="w-full" disabled={resetPasswordMutation.isPending}>
            {resetPasswordMutation.isPending ? "提交中..." : "设置新密码"}
          </Button>
          <Link to="/login" className="inline-flex text-sm text-slate-600 hover:text-slate-900">返回登录</Link>
        </form>
      )}
    </AuthCardShell>
  );
}
