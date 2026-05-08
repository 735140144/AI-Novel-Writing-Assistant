import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useMutation } from "@tanstack/react-query";
import { registerWithEmail } from "@/api/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import AuthCardShell from "./AuthCardShell";

export default function RegisterPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const registerMutation = useMutation({
    mutationFn: registerWithEmail,
    onSuccess: async () => {
      navigate("/login", { replace: true });
    },
  });

  return (
    <AuthCardShell
      title="创建你的私有写作空间"
      subtitle="注册后即可拥有独立的小说、知识库、任务中心和模型路由。"
    >
      <form
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          registerMutation.mutate({ email, password });
        }}
      >
        <div className="space-y-2">
          <div className="text-sm font-medium">邮箱</div>
          <Input value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" />
        </div>
        <div className="space-y-2">
          <div className="text-sm font-medium">密码</div>
          <Input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="new-password" />
        </div>
        <Button type="submit" className="w-full" disabled={registerMutation.isPending}>
          {registerMutation.isPending ? "注册中..." : "注册"}
        </Button>
        <div className="text-sm text-slate-600">
          已有账号？<Link to="/login" className="hover:text-slate-900">返回登录</Link>
        </div>
      </form>
    </AuthCardShell>
  );
}
