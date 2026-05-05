# Forgot Password Flow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a complete forgot-password and reset-password flow that lets users recover access from the login page through email without exposing whether an email is registered.

**Architecture:** Extend the existing auth module with two new routes backed by `AuthService`, reuse opaque token hashing already used for sessions and email verification, and send reset links through the global SMTP settings. Keep frontend changes limited to the existing auth pages and auth API client so the flow stays aligned with the current login experience.

**Tech Stack:** Express, Prisma, TypeScript, React, TanStack Query, Axios, SMTP via Nodemailer

---

### Task 1: Lock the backend contract with failing auth-route tests

**Files:**
- Modify: `server/tests/authRoutes.test.js`
- Test: `server/tests/authRoutes.test.js`

- [ ] **Step 1: Write the failing test for forgot-password on a registered user**

```js
      if (scenario === "forgot_password_existing_user") {
        const registerResponse = await fetch(`http://127.0.0.1:${port}/api/auth/register`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ email, password }),
        });
        assert.equal(registerResponse.status, 201);

        const forgotPasswordResponse = await fetch(`http://127.0.0.1:${port}/api/auth/forgot-password`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ email }),
        });
        assert.equal(forgotPasswordResponse.status, 200);

        const forgotPasswordPayload = await forgotPasswordResponse.json();
        assert.equal(forgotPasswordPayload.success, true);

        const resetTokens = await prisma.passwordResetToken.findMany({
          where: { user: { email } },
        });
        assert.equal(resetTokens.length, 1);
        assert.ok(resetTokens[0].tokenHash);
        assert.equal(resetTokens[0].usedAt, null);
        return;
      }
```

- [ ] **Step 2: Write the failing test for forgot-password on an unknown user**

```js
      if (scenario === "forgot_password_unknown_user") {
        const forgotPasswordResponse = await fetch(`http://127.0.0.1:${port}/api/auth/forgot-password`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ email }),
        });
        assert.equal(forgotPasswordResponse.status, 200);

        const forgotPasswordPayload = await forgotPasswordResponse.json();
        assert.equal(forgotPasswordPayload.success, true);

        const resetTokens = await prisma.passwordResetToken.findMany({
          where: { user: { email } },
        });
        assert.equal(resetTokens.length, 0);
        return;
      }
```

- [ ] **Step 3: Write the failing test for reset-password success and session invalidation**

```js
      if (scenario === "reset_password_success") {
        const registerResponse = await fetch(`http://127.0.0.1:${port}/api/auth/register`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ email, password }),
        });
        assert.equal(registerResponse.status, 201);

        const loginResponse = await fetch(`http://127.0.0.1:${port}/api/auth/login`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ email, password }),
        });
        assert.equal(loginResponse.status, 200);
        const cookieHeader = loginResponse.headers.get("set-cookie");
        assert.ok(cookieHeader);

        const { createOpaqueToken, hashOpaqueToken } = require("../dist/services/auth/authTokens.js");
        const resetToken = createOpaqueToken();
        const expiresAt = new Date(Date.now() + 60 * 60 * 1000);
        await prisma.passwordResetToken.create({
          data: {
            userId: (await prisma.user.findUniqueOrThrow({ where: { email } })).id,
            tokenHash: hashOpaqueToken(resetToken),
            expiresAt,
          },
        });

        const newPassword = "EvenStrongerPass456!";
        const resetPasswordResponse = await fetch(`http://127.0.0.1:${port}/api/auth/reset-password`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ token: resetToken, password: newPassword }),
        });
        assert.equal(resetPasswordResponse.status, 200);

        const meWithOldSessionResponse = await fetch(`http://127.0.0.1:${port}/api/auth/me`, {
          headers: { Cookie: cookieHeader },
        });
        assert.equal(meWithOldSessionResponse.status, 401);

        const oldPasswordLoginResponse = await fetch(`http://127.0.0.1:${port}/api/auth/login`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ email, password }),
        });
        assert.equal(oldPasswordLoginResponse.status, 401);

        const newPasswordLoginResponse = await fetch(`http://127.0.0.1:${port}/api/auth/login`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ email, password: newPassword }),
        });
        assert.equal(newPasswordLoginResponse.status, 200);
        return;
      }
```

- [ ] **Step 4: Write the failing test for invalid and expired reset tokens**

```js
      if (scenario === "reset_password_invalid_token") {
        const resetPasswordResponse = await fetch(`http://127.0.0.1:${port}/api/auth/reset-password`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ token: "invalid-token", password: "StrongPass123!" }),
        });
        assert.equal(resetPasswordResponse.status, 400);
        return;
      }

      if (scenario === "reset_password_expired_token") {
        const registerResponse = await fetch(`http://127.0.0.1:${port}/api/auth/register`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ email, password }),
        });
        assert.equal(registerResponse.status, 201);

        const { createOpaqueToken, hashOpaqueToken } = require("../dist/services/auth/authTokens.js");
        const resetToken = createOpaqueToken();
        await prisma.passwordResetToken.create({
          data: {
            userId: (await prisma.user.findUniqueOrThrow({ where: { email } })).id,
            tokenHash: hashOpaqueToken(resetToken),
            expiresAt: new Date(Date.now() - 1000),
          },
        });

        const resetPasswordResponse = await fetch(`http://127.0.0.1:${port}/api/auth/reset-password`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ token: resetToken, password: "StrongPass123!" }),
        });
        assert.equal(resetPasswordResponse.status, 400);
        return;
      }
```

- [ ] **Step 5: Register the new scenarios in the test runner**

```js
  test("forgot-password returns success and creates a reset token for existing users", async () => {
    await runChildScenario("forgot_password_existing_user");
  });

  test("forgot-password returns the same success response for unknown users", async () => {
    await runChildScenario("forgot_password_unknown_user");
  });

  test("reset-password updates the password and invalidates existing sessions", async () => {
    await runChildScenario("reset_password_success");
  });

  test("reset-password rejects invalid tokens", async () => {
    await runChildScenario("reset_password_invalid_token");
  });

  test("reset-password rejects expired tokens", async () => {
    await runChildScenario("reset_password_expired_token");
  });
```

- [ ] **Step 6: Run the auth-route tests to verify they fail for the missing endpoints**

Run: `pnpm --filter @ai-novel/server test -- tests/authRoutes.test.js`

Expected: FAIL with 404 or route-missing assertions for `/api/auth/forgot-password` and `/api/auth/reset-password`.

### Task 2: Implement the backend forgot-password and reset-password behavior

**Files:**
- Modify: `server/src/routes/auth.ts`
- Modify: `server/src/services/auth/AuthService.ts`
- Modify: `server/src/services/auth/authMail.ts`
- Modify: `server/package.json`
- Test: `server/tests/authRoutes.test.js`

- [ ] **Step 1: Add the failing route schemas to auth routes**

```ts
const forgotPasswordSchema = z.object({
  email: z.string().trim().email("请输入正确的邮箱地址。"),
});

const resetPasswordSchema = z.object({
  token: z.string().trim().min(1, "重置入口无效，请重新获取。"),
  password: z.string().trim().min(8, "密码至少需要 8 个字符。"),
});
```

- [ ] **Step 2: Add the forgot-password and reset-password route handlers**

```ts
router.post(
  "/forgot-password",
  validate({ body: forgotPasswordSchema }),
  async (req, res, next) => {
    try {
      await authService.forgotPassword({
        email: (req.body as z.infer<typeof forgotPasswordSchema>).email,
        requestOrigin: `${req.protocol}://${req.get("host")}`,
      });
      res.status(200).json({
        success: true,
        data: null,
        message: "如果该邮箱已注册，我们会把重置入口发送到你的邮箱。",
      } satisfies ApiResponse<null>);
    } catch (error) {
      next(error);
    }
  },
);

router.post(
  "/reset-password",
  validate({ body: resetPasswordSchema }),
  async (req, res, next) => {
    try {
      await authService.resetPassword(req.body as z.infer<typeof resetPasswordSchema>);
      res.status(200).json({
        success: true,
        data: null,
        message: "密码已重置，请使用新密码登录。",
      } satisfies ApiResponse<null>);
    } catch (error) {
      next(error);
    }
  },
);
```

- [ ] **Step 3: Add minimal forgot-password logic in AuthService**

```ts
  async forgotPassword(input: {
    email: string;
    requestOrigin?: string;
  }): Promise<void> {
    const email = normalizeEmail(input.email);
    if (!email) {
      return;
    }

    const user = await prisma.user.findUnique({
      where: { email },
      select: { id: true, email: true, status: true },
    });

    if (!user || user.status === "disabled") {
      return;
    }

    await prisma.passwordResetToken.deleteMany({
      where: { userId: user.id },
    });

    const resetToken = createOpaqueToken();
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000);

    await prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash: hashOpaqueToken(resetToken),
        expiresAt,
      },
    });

    await sendPasswordResetEmail({
      email: user.email,
      token: resetToken,
      requestOrigin: input.requestOrigin,
      expiresAt,
    });
  }
```

- [ ] **Step 4: Add minimal reset-password logic in AuthService**

```ts
  async resetPassword(input: {
    token: string;
    password: string;
  }): Promise<void> {
    const token = input.token.trim();
    const password = input.password.trim();
    validatePasswordStrength(password);

    const resetToken = await prisma.passwordResetToken.findUnique({
      where: { tokenHash: hashOpaqueToken(token) },
      include: { user: true },
    });

    if (!resetToken || resetToken.usedAt || resetToken.expiresAt.getTime() <= Date.now()) {
      throw new AppError("重置入口无效或已过期，请重新获取。", 400);
    }

    if (!resetToken.user || resetToken.user.status === "disabled") {
      throw new AppError("当前账户不可用，请联系管理员处理。", 400);
    }

    await prisma.$transaction([
      prisma.user.update({
        where: { id: resetToken.userId },
        data: { passwordHash: hashPassword(password) },
      }),
      prisma.passwordResetToken.update({
        where: { id: resetToken.id },
        data: { usedAt: new Date() },
      }),
      prisma.passwordResetToken.deleteMany({
        where: {
          userId: resetToken.userId,
          id: { not: resetToken.id },
        },
      }),
      prisma.userSession.deleteMany({
        where: { userId: resetToken.userId },
      }),
    ]);
  }
```

- [ ] **Step 5: Replace the placeholder auth mail sender with real SMTP support**

```ts
import nodemailer from "nodemailer";
import { AppError } from "../../middleware/errorHandler";
import { getSystemEmailSettings } from "../settings/SystemEmailSettingsService";

function resolveAuthAppBaseUrl(requestOrigin?: string): string {
  const explicitBaseUrl = process.env.AUTH_PUBLIC_APP_URL?.trim()
    || process.env.APP_PUBLIC_URL?.trim()
    || process.env.WEB_PUBLIC_URL?.trim();

  if (explicitBaseUrl) {
    return explicitBaseUrl.replace(/\/+$/, "");
  }

  return (requestOrigin ?? "").replace(/\/+$/, "");
}

async function sendMail(input: {
  to: string;
  subject: string;
  text: string;
  html: string;
}): Promise<void> {
  const settings = await getSystemEmailSettings();
  if (!settings.smtpHost || !settings.smtpPort || !settings.fromEmail) {
    throw new AppError("系统邮件服务尚未配置完成，请联系管理员检查系统设置。", 500);
  }

  const transporter = nodemailer.createTransport({
    host: settings.smtpHost,
    port: settings.smtpPort,
    secure: settings.smtpSecure,
    auth: settings.smtpUser ? {
      user: settings.smtpUser,
      pass: settings.smtpPassword,
    } : undefined,
  });

  await transporter.sendMail({
    from: settings.fromName ? `${settings.fromName} <${settings.fromEmail}>` : settings.fromEmail,
    to: input.to,
    subject: input.subject,
    text: input.text,
    html: input.html,
  });
}
```

- [ ] **Step 6: Add reset-link mail composition**

```ts
export async function sendPasswordResetEmail(input: {
  email: string;
  token: string;
  requestOrigin?: string;
  expiresAt: Date;
}): Promise<void> {
  const baseUrl = resolveAuthAppBaseUrl(input.requestOrigin);
  const resetUrl = `${baseUrl}/reset-password?token=${encodeURIComponent(input.token)}`;
  const expiryText = "1 小时";

  await sendMail({
    to: input.email,
    subject: "重置你的登录密码",
    text: [
      "你正在为 AI 小说写作助手重置登录密码。",
      `请在 ${expiryText} 内打开以下入口设置新密码：`,
      resetUrl,
      "如果这不是你的操作，可以直接忽略这封邮件。",
    ].join("\n\n"),
    html: [
      "<p>你正在为 AI 小说写作助手重置登录密码。</p>",
      `<p>请在 ${expiryText} 内打开以下入口设置新密码：</p>`,
      `<p><a href=\"${resetUrl}\">${resetUrl}</a></p>`,
      "<p>如果这不是你的操作，可以直接忽略这封邮件。</p>",
    ].join(""),
  });
}
```

- [ ] **Step 7: Add the SMTP dependency**

```json
  "dependencies": {
    "nodemailer": "^6.10.1"
  }
```

- [ ] **Step 8: Run the auth-route tests to verify the backend passes**

Run: `pnpm --filter @ai-novel/server test -- tests/authRoutes.test.js`

Expected: PASS for all auth route scenarios including forgot-password and reset-password.

### Task 3: Add client auth API and real auth-page forms

**Files:**
- Modify: `client/src/api/auth.ts`
- Modify: `client/src/pages/auth/ForgotPasswordPage.tsx`
- Modify: `client/src/pages/auth/ResetPasswordPage.tsx`
- Test: manual verification via `pnpm --filter @ai-novel/client build`

- [ ] **Step 1: Add the auth API client calls**

```ts
export async function requestPasswordReset(payload: { email: string }) {
  const { data } = await apiClient.post<ApiResponse<null>>("/auth/forgot-password", payload);
  return data;
}

export async function resetPasswordWithToken(payload: { token: string; password: string }) {
  const { data } = await apiClient.post<ApiResponse<null>>("/auth/reset-password", payload);
  return data;
}
```

- [ ] **Step 2: Replace the forgot-password placeholder with a working form**

```tsx
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const forgotPasswordMutation = useMutation({
    mutationFn: requestPasswordReset,
    onSuccess: () => {
      setSubmitted(true);
      toast.success("如果该邮箱已注册，我们会把重置入口发送到你的邮箱。");
    },
  });
```

```tsx
      {submitted ? (
        <div className="space-y-4 text-sm text-slate-600">
          <p>请前往邮箱查看重置密码入口。收到邮件后，打开入口即可设置新密码。</p>
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
            <Input value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" />
          </div>
          <Button type="submit" className="w-full" disabled={forgotPasswordMutation.isPending}>
            {forgotPasswordMutation.isPending ? "发送中..." : "发送重置入口"}
          </Button>
          <Link to="/login" className="inline-flex text-sm text-slate-600 hover:text-slate-900">返回登录</Link>
        </form>
      )}
```

- [ ] **Step 3: Replace the reset-password placeholder with a working form**

```tsx
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token")?.trim() ?? "";
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const resetPasswordMutation = useMutation({
    mutationFn: resetPasswordWithToken,
    onSuccess: () => {
      toast.success("密码已重置，请使用新密码登录。");
      navigate("/login", { replace: true });
    },
  });
```

```tsx
      {!token ? (
        <div className="space-y-4 text-sm text-slate-600">
          <p>这个重置入口无效，请重新回到登录页获取新的重置邮件。</p>
          <Link to="/forgot-password" className="inline-flex text-sm font-medium text-slate-900 hover:underline">重新获取重置入口</Link>
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
            <Input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="new-password" />
          </div>
          <div className="space-y-2">
            <div className="text-sm font-medium">确认新密码</div>
            <Input type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} autoComplete="new-password" />
          </div>
          <Button type="submit" className="w-full" disabled={resetPasswordMutation.isPending}>
            {resetPasswordMutation.isPending ? "提交中..." : "设置新密码"}
          </Button>
          <Link to="/login" className="inline-flex text-sm text-slate-600 hover:text-slate-900">返回登录</Link>
        </form>
      )}
```

- [ ] **Step 4: Run the client build to catch type errors**

Run: `pnpm --filter @ai-novel/client build`

Expected: PASS with a successful Vite production build.

### Task 4: Verify end-to-end behavior and clean up

**Files:**
- Modify: `server/src/services/auth/AuthService.ts` if needed for refactor cleanup
- Test: `server/tests/authRoutes.test.js`

- [ ] **Step 1: Re-run the focused backend auth tests**

Run: `pnpm --filter @ai-novel/server test -- tests/authRoutes.test.js`

Expected: PASS.

- [ ] **Step 2: Re-run the client build**

Run: `pnpm --filter @ai-novel/client build`

Expected: PASS.

- [ ] **Step 3: Sanity-check the final behavior**

Check:
- Forgot-password response message is uniform for existing and unknown emails.
- Reset-password invalidates old sessions.
- Reset-password rejects expired or invalid tokens.
- Pages no longer show “接入中” placeholder copy.

- [ ] **Step 4: Stop and report verification evidence before any commit or release step**

Report:
- Exact test commands run
- Exact build command run
- Any remaining deployment or SMTP environment prerequisites
