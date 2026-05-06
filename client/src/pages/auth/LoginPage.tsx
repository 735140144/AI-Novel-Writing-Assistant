import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useMutation } from "@tanstack/react-query";
import { loginWithEmail } from "@/api/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuthStore } from "@/store/authStore";
import AuthCardShell from "./AuthCardShell";

export default function LoginPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const setUser = useAuthStore((state) => state.setUser);
  const next = searchParams.get("next") || "/";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const loginMutation = useMutation({
    mutationFn: loginWithEmail,
    onSuccess: async (response) => {
      setUser(response.data ?? null);
      navigate(next, { replace: true });
    },
  });

  return (
    <AuthCardShell
      title="继续你的写作工作台"
      subtitle="登录后进入小说、知识库、任务中心和模型路由。"
    >
      <form
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          loginMutation.mutate({ email, password });
        }}
      >
        <div className="space-y-2">
          <div className="text-sm font-medium">邮箱</div>
          <Input value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" />
        </div>
        <div className="space-y-2">
          <div className="text-sm font-medium">密码</div>
          <Input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" />
        </div>
        <Button type="submit" className="w-full" disabled={loginMutation.isPending}>
          {loginMutation.isPending ? "登录中..." : "登录"}
        </Button>
        <div className="flex items-center justify-between text-sm text-slate-600">
          <Link to="/register" className="hover:text-slate-900">创建账号</Link>
          <Link to="/forgot-password" className="hover:text-slate-900">忘记密码</Link>
        </div>
      </form>
    </AuthCardShell>
  );
}
