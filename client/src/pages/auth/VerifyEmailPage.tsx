import { Link } from "react-router-dom";
import AuthCardShell from "./AuthCardShell";

export default function VerifyEmailPage() {
  return (
    <AuthCardShell
      title="完成邮箱验证后继续创作"
      subtitle="系统会将验证链接发送到你的注册邮箱，验证后即可进入写作工作台。"
    >
      <div className="space-y-4 text-sm text-slate-600">
        <p>如果你已经验证完成，可以直接返回登录。</p>
        <Link to="/login" className="inline-flex text-sm font-medium text-slate-900 hover:underline">返回登录</Link>
      </div>
    </AuthCardShell>
  );
}
