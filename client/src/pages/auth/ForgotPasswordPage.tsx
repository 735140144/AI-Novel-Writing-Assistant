import { useState } from "react";
import { Link } from "react-router-dom";
import { useMutation } from "@tanstack/react-query";
import { requestPasswordReset } from "@/api/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";
import AuthCardShell from "./AuthCardShell";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const forgotPasswordMutation = useMutation({
    mutationFn: requestPasswordReset,
    onSuccess: () => {
      setSubmitted(true);
      toast.success("如果该邮箱已注册，我们会把重置入口发送到你的邮箱。");
    },
  });

  return (
    <AuthCardShell
      title="找回登录密码"
      subtitle="输入注册邮箱后，系统会把重置密码的入口发送到你的邮箱。"
    >
      {submitted ? (
        <div className="space-y-4 text-sm text-slate-600">
          <p>请前往邮箱查看重置密码入口。打开入口后即可设置新密码。</p>
          <Link to="/login" className="inline-flex text-sm font-medium text-slate-900 hover:underline">返回登录</Link>
        </div>
      ) : (
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            forgotPasswordMutation.mutate({ email });
          }}
        >
          <div className="space-y-2">
            <div className="text-sm font-medium">注册邮箱</div>
            <Input
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoComplete="email"
              placeholder="请输入注册邮箱"
            />
          </div>
          <Button type="submit" className="w-full" disabled={forgotPasswordMutation.isPending}>
            {forgotPasswordMutation.isPending ? "发送中..." : "发送重置入口"}
          </Button>
          <Link to="/login" className="inline-flex text-sm text-slate-600 hover:text-slate-900">返回登录</Link>
        </form>
      )}
    </AuthCardShell>
  );
}
