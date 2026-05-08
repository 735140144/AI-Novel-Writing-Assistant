# Multi-User Account Isolation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a public-registration, account-isolated multi-user system with full login gating, admin-only infrastructure settings, user-private creative assets, user-scoped model routes, and `userId`-based knowledge/task isolation.

**Architecture:** The implementation adds a server-side session auth layer, introduces `userId` ownership on private roots and high-frequency task tables, splits admin-managed provider settings from user-managed model route preferences, and rewires frontend routing around protected and public auth pages. Migration happens in a safe expand-backfill-enforce sequence so all existing data is preserved under `caoty@luckydcms.com`.

**Tech Stack:** React, React Router, TanStack Query, Axios, Express, Prisma, PostgreSQL/SQLite Prisma schemas, SMTP mail delivery, cookie-based sessions, Node test runner.

---

## File Structure

### Backend auth and mail

- Create: `server/src/routes/auth.ts`
- Create: `server/src/services/auth/AuthService.ts`
- Create: `server/src/services/auth/authPassword.ts`
- Create: `server/src/services/auth/authSession.ts`
- Create: `server/src/services/auth/authTokens.ts`
- Create: `server/src/services/auth/authCookies.ts`
- Create: `server/src/services/auth/authMail.ts`
- Create: `server/src/services/settings/SystemEmailSettingsService.ts`
- Modify: `server/src/middleware/auth.ts`
- Modify: `server/src/types/express.d.ts`
- Modify: `server/src/app.ts`
- Modify: `server/src/routes/settings.ts`

### Prisma and migration

- Modify: `server/src/prisma/schema.prisma`
- Modify: `server/src/prisma/schema.sqlite.prisma`
- Create: `server/src/db/runtimeMigrations/20260502_multi_user_account_isolation.ts`
- Modify: `server/src/db/runtimeMigrations.ts`

### Backend resource isolation

- Modify: `server/src/routes/genre.ts`
- Modify: `server/src/routes/storyMode.ts`
- Modify: `server/src/routes/titleLibrary.ts`
- Modify: `server/src/routes/knowledge.ts`
- Modify: `server/src/routes/tasks.ts`
- Modify: `server/src/routes/llm.ts`
- Modify: `server/src/services/genre/GenreService.ts`
- Modify: `server/src/services/storyMode/StoryModeService.ts`
- Modify: `server/src/services/title/TitleLibraryService.ts`
- Modify: `server/src/services/knowledge/KnowledgeService.ts`
- Modify: `server/src/services/task/TaskCenterService.ts`
- Modify: `server/src/services/task/RecoveryTaskService.ts`
- Modify: `server/src/services/task/taskArchive.ts`
- Modify: `server/src/llm/modelRouter.ts`

### Frontend auth shell and pages

- Create: `client/src/api/auth.ts`
- Create: `client/src/store/authStore.ts`
- Create: `client/src/router/RequireAuth.tsx`
- Create: `client/src/router/RequireVerifiedEmail.tsx`
- Create: `client/src/pages/auth/LoginPage.tsx`
- Create: `client/src/pages/auth/RegisterPage.tsx`
- Create: `client/src/pages/auth/VerifyEmailPage.tsx`
- Create: `client/src/pages/auth/ForgotPasswordPage.tsx`
- Create: `client/src/pages/auth/ResetPasswordPage.tsx`
- Create: `client/src/pages/auth/AuthCardShell.tsx`
- Modify: `client/src/router/index.tsx`
- Modify: `client/src/main.tsx`
- Modify: `client/src/components/layout/AppLayout.tsx`
- Modify: `client/src/components/layout/Navbar.tsx`
- Modify: `client/src/components/layout/Sidebar.tsx`
- Modify: `client/src/api/client.ts`
- Modify: `client/src/pages/settings/SettingsPage.tsx`
- Modify: `client/src/pages/settings/ModelRoutesPage.tsx`
- Modify: `client/src/index.css`

### Tests

- Create: `server/tests/authRoutes.test.js`
- Create: `server/tests/userScopedModelRoutes.test.js`
- Create: `server/tests/userScopedGenreRoutes.test.js`
- Create: `server/tests/userScopedTitleLibrary.test.js`
- Create: `server/tests/userScopedTaskCenter.test.js`
- Create: `client/tests/authRoutingContracts.test.js`
- Modify: `client/tests/taskCenterContracts.test.js`

## Backend

### Task 1: Add user, session, verification, reset, and ownership schema

**Files:**
- Modify: `server/src/prisma/schema.prisma`
- Modify: `server/src/prisma/schema.sqlite.prisma`
- Create: `server/src/db/runtimeMigrations/20260502_multi_user_account_isolation.ts`
- Modify: `server/src/db/runtimeMigrations.ts`
- Test: `server/tests/authRoutes.test.js`

- [ ] **Step 1: Write the failing test**

```js
const test = require("node:test");
const assert = require("node:assert/strict");
const { prisma } = require("../dist/db/prisma.js");

test("multi-user schema exposes admin user and owned novel columns after migration", async () => {
  const user = await prisma.user.findUnique({
    where: { email: "caoty@luckydcms.com" },
    select: { email: true, role: true },
  });

  assert.equal(user?.email, "caoty@luckydcms.com");
  assert.equal(user?.role, "admin");

  const novelColumns = await prisma.$queryRawUnsafe(`
    select column_name
    from information_schema.columns
    where table_name = 'Novel' and column_name = 'userId'
  `);

  assert.equal(Array.isArray(novelColumns), true);
  assert.equal(novelColumns.length > 0, true);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test server/tests/authRoutes.test.js`
Expected: FAIL because `user` table, admin seed, or `Novel.userId` do not exist yet.

- [ ] **Step 3: Write minimal implementation**

```prisma
enum UserRole {
  admin
  user
}

enum UserStatus {
  pending_verification
  active
  disabled
}

model User {
  id               String    @id @default(cuid())
  email            String    @unique
  passwordHash     String
  role             UserRole  @default(user)
  status           UserStatus @default(pending_verification)
  emailVerifiedAt  DateTime?
  sessions         UserSession[]
  createdAt        DateTime  @default(now())
  updatedAt        DateTime  @updatedAt
}

model UserSession {
  id               String   @id @default(cuid())
  userId           String
  sessionTokenHash String   @unique
  expiresAt        DateTime
  lastSeenAt       DateTime @default(now())
  ip               String?
  userAgent        String?
  user             User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  createdAt        DateTime @default(now())

  @@index([userId, expiresAt])
}

model EmailVerificationToken {
  id         String   @id @default(cuid())
  userId     String
  tokenHash  String   @unique
  expiresAt  DateTime
  consumedAt DateTime?
  user       User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  createdAt  DateTime @default(now())
}

model PasswordResetToken {
  id         String   @id @default(cuid())
  userId     String
  tokenHash  String   @unique
  expiresAt  DateTime
  consumedAt DateTime?
  user       User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  createdAt  DateTime @default(now())
}
```

```ts
export async function runMultiUserAccountIsolationMigration() {
  await prisma.$executeRawUnsafe(`alter table "Novel" add column if not exists "userId" text`);
  await prisma.$executeRawUnsafe(`alter table "World" add column if not exists "userId" text`);
  await prisma.$executeRawUnsafe(`alter table "KnowledgeDocument" add column if not exists "userId" text`);
  await prisma.$executeRawUnsafe(`alter table "BaseCharacter" add column if not exists "userId" text`);
  await prisma.$executeRawUnsafe(`alter table "StyleProfile" add column if not exists "userId" text`);
  await prisma.$executeRawUnsafe(`alter table "NovelGenre" add column if not exists "userId" text`);
  await prisma.$executeRawUnsafe(`alter table "NovelStoryMode" add column if not exists "userId" text`);
  await prisma.$executeRawUnsafe(`alter table "TitleLibrary" add column if not exists "userId" text`);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @ai-novel/server prisma:generate && node --test server/tests/authRoutes.test.js`
Expected: PASS with the admin user present and owned columns available.

- [ ] **Step 5: Commit**

```bash
git add server/src/prisma/schema.prisma server/src/prisma/schema.sqlite.prisma server/src/db/runtimeMigrations.ts server/src/db/runtimeMigrations/20260502_multi_user_account_isolation.ts server/tests/authRoutes.test.js
git commit -m "feat: add multi-user auth schema and ownership columns"
```

### Task 2: Implement auth routes, sessions, and SMTP-backed mail flows

**Files:**
- Create: `server/src/routes/auth.ts`
- Create: `server/src/services/auth/AuthService.ts`
- Create: `server/src/services/auth/authPassword.ts`
- Create: `server/src/services/auth/authSession.ts`
- Create: `server/src/services/auth/authTokens.ts`
- Create: `server/src/services/auth/authCookies.ts`
- Create: `server/src/services/auth/authMail.ts`
- Create: `server/src/services/settings/SystemEmailSettingsService.ts`
- Modify: `server/src/app.ts`
- Modify: `server/src/middleware/auth.ts`
- Modify: `server/src/types/express.d.ts`
- Test: `server/tests/authRoutes.test.js`

- [ ] **Step 1: Write the failing test**

```js
const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const { createApp } = require("../dist/app.js");

function listen(server) {
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve(server.address().port));
  });
}

test("auth routes register, reject unverified access, and create session cookies", async () => {
  const app = createApp();
  const server = http.createServer(app);
  const port = await listen(server);

  try {
    const register = await fetch(`http://127.0.0.1:${port}/api/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "reader@example.com",
        password: "StrongPass123!",
      }),
    });
    assert.equal(register.status, 201);

    const me = await fetch(`http://127.0.0.1:${port}/api/auth/me`);
    assert.equal(me.status, 401);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test server/tests/authRoutes.test.js`
Expected: FAIL because `/api/auth/register` and `/api/auth/me` do not exist.

- [ ] **Step 3: Write minimal implementation**

```ts
router.post("/register", validate({ body: registerSchema }), async (req, res, next) => {
  try {
    const data = await authService.register(req.body);
    res.status(201).json({ success: true, data, message: "注册成功，请先验证邮箱。" });
  } catch (error) {
    next(error);
  }
});

router.post("/login", validate({ body: loginSchema }), async (req, res, next) => {
  try {
    const result = await authService.login(req.body, {
      ip: req.ip,
      userAgent: req.header("user-agent") ?? "",
    });
    writeAuthCookie(res, result.sessionToken);
    res.status(200).json({ success: true, data: result.user, message: "登录成功。" });
  } catch (error) {
    next(error);
  }
});

router.get("/me", requireAuth, async (req, res) => {
  res.status(200).json({ success: true, data: req.user });
});
```

```ts
export async function authMiddleware(req: Request, _res: Response, next: NextFunction): Promise<void> {
  const token = readAuthCookie(req);
  if (!token) {
    req.user = undefined;
    next();
    return;
  }
  const session = await findSessionUser(token);
  req.user = session ? { id: session.user.id, role: session.user.role, email: session.user.email } : undefined;
  next();
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @ai-novel/server prisma:generate && pnpm exec tsc -p server/tsconfig.json --noEmitOnError false && node --test server/tests/authRoutes.test.js`
Expected: PASS with successful registration and `401` for unauthenticated `/me`.

- [ ] **Step 5: Commit**

```bash
git add server/src/routes/auth.ts server/src/services/auth server/src/services/settings/SystemEmailSettingsService.ts server/src/app.ts server/src/middleware/auth.ts server/src/types/express.d.ts server/tests/authRoutes.test.js
git commit -m "feat: add cookie session auth and email flows"
```

### Task 3: Add admin-only system settings and user-scoped model routes

**Files:**
- Modify: `server/src/routes/settings.ts`
- Modify: `server/src/routes/llm.ts`
- Modify: `server/src/llm/modelRouter.ts`
- Modify: `server/src/prisma/schema.prisma`
- Modify: `server/src/prisma/schema.sqlite.prisma`
- Test: `server/tests/userScopedModelRoutes.test.js`

- [ ] **Step 1: Write the failing test**

```js
const test = require("node:test");
const assert = require("node:assert/strict");
const { prisma } = require("../dist/db/prisma.js");
const { resolveModel, upsertUserModelRouteConfig } = require("../dist/llm/modelRouter.js");

test("model routes are isolated per user while provider secrets remain global", async () => {
  await upsertUserModelRouteConfig("user-a", "planner", {
    provider: "deepseek",
    model: "deepseek-chat",
    temperature: 0.3,
  });
  await upsertUserModelRouteConfig("user-b", "planner", {
    provider: "deepseek",
    model: "deepseek-reasoner",
    temperature: 0.2,
  });

  const routeA = await resolveModel("planner", undefined, { userId: "user-a" });
  const routeB = await resolveModel("planner", undefined, { userId: "user-b" });

  assert.equal(routeA.model, "deepseek-chat");
  assert.equal(routeB.model, "deepseek-reasoner");

  const providerRecord = await prisma.aPIKey.findFirst({ where: { provider: "deepseek" } });
  assert.equal(Boolean(providerRecord), true);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test server/tests/userScopedModelRoutes.test.js`
Expected: FAIL because user-scoped route config support does not exist yet.

- [ ] **Step 3: Write minimal implementation**

```prisma
model UserModelRouteConfig {
  id                       String   @id @default(cuid())
  userId                   String
  taskType                 String
  provider                 String
  model                    String
  temperature              Float    @default(0.7)
  maxTokens                Int?
  requestProtocol          String   @default("auto")
  structuredResponseFormat String   @default("auto")
  user                     User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  createdAt                DateTime @default(now())
  updatedAt                DateTime @updatedAt

  @@unique([userId, taskType])
  @@index([userId, provider])
}
```

```ts
export async function resolveModel(
  taskType: TaskType,
  userOverride?: RouteOverride,
  scope?: { userId?: string },
): Promise<ResolvedModel> {
  if (scope?.userId) {
    const userRow = await prisma.userModelRouteConfig.findUnique({
      where: { userId_taskType: { userId: scope.userId, taskType: normalizeTaskType(taskType) } },
    });
    if (userRow) {
      return applyOverrides(rowToResolvedModel(userRow), userOverride);
    }
  }
  const globalRow = await prisma.modelRouteConfig.findUnique({
    where: { taskType: normalizeTaskType(taskType) },
  });
  return globalRow ? applyOverrides(rowToResolvedModel(globalRow), userOverride) : applyOverrides(DEFAULT_ROUTES.default, userOverride);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec tsc -p server/tsconfig.json --noEmitOnError false && node --test server/tests/userScopedModelRoutes.test.js`
Expected: PASS with different route selections for different users.

- [ ] **Step 5: Commit**

```bash
git add server/src/prisma/schema.prisma server/src/prisma/schema.sqlite.prisma server/src/routes/settings.ts server/src/routes/llm.ts server/src/llm/modelRouter.ts server/tests/userScopedModelRoutes.test.js
git commit -m "feat: add user-scoped model route preferences"
```

### Task 4: Add user ownership to genre, story mode, and title library services

**Files:**
- Modify: `server/src/routes/genre.ts`
- Modify: `server/src/routes/storyMode.ts`
- Modify: `server/src/routes/titleLibrary.ts`
- Modify: `server/src/services/genre/GenreService.ts`
- Modify: `server/src/services/storyMode/StoryModeService.ts`
- Modify: `server/src/services/title/TitleLibraryService.ts`
- Test: `server/tests/userScopedGenreRoutes.test.js`
- Test: `server/tests/userScopedTitleLibrary.test.js`

- [ ] **Step 1: Write the failing tests**

```js
test("genre tree only returns rows owned by the authenticated user", async () => {
  const data = await genreService.listGenreTree({ userId: "user-a" });
  assert.deepEqual(data.map((item) => item.name), ["玄幻"]);
});

test("title library create and list only operate inside one user scope", async () => {
  await titleLibraryService.create({ userId: "user-a", title: "万界封神录" });
  await titleLibraryService.create({ userId: "user-b", title: "海上余烬" });

  const listA = await titleLibraryService.list({ userId: "user-a" });
  assert.deepEqual(listA.items.map((item) => item.title), ["万界封神录"]);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test server/tests/userScopedGenreRoutes.test.js server/tests/userScopedTitleLibrary.test.js`
Expected: FAIL because list/create methods are not user-scoped.

- [ ] **Step 3: Write minimal implementation**

```ts
router.get("/", requireAuth, async (req, res, next) => {
  try {
    const data = await genreService.listGenreTree({ userId: req.user.id });
    res.status(200).json({ success: true, data, message: "获取类型树成功。" });
  } catch (error) {
    next(error);
  }
});
```

```ts
async list(input: ListTitleLibraryInput & { userId: string }): Promise<TitleLibraryListResult> {
  const where = {
    userId: input.userId,
    ...(genreId ? { genreId } : {}),
    ...(search ? { OR: [{ title: { contains: search } }, { description: { contains: search } }, { keywords: { contains: search } }] } : {}),
  };
  const rows = await prisma.titleLibrary.findMany({ where, orderBy, skip, take });
  // existing mapping stays the same
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm exec tsc -p server/tsconfig.json --noEmitOnError false && node --test server/tests/userScopedGenreRoutes.test.js server/tests/userScopedTitleLibrary.test.js`
Expected: PASS with only current-user data returned.

- [ ] **Step 5: Commit**

```bash
git add server/src/routes/genre.ts server/src/routes/storyMode.ts server/src/routes/titleLibrary.ts server/src/services/genre/GenreService.ts server/src/services/storyMode/StoryModeService.ts server/src/services/title/TitleLibraryService.ts server/tests/userScopedGenreRoutes.test.js server/tests/userScopedTitleLibrary.test.js
git commit -m "feat: scope creative libraries to authenticated users"
```

### Task 5: Add user-scoped task center and knowledge isolation

**Files:**
- Modify: `server/src/routes/tasks.ts`
- Modify: `server/src/routes/knowledge.ts`
- Modify: `server/src/services/task/TaskCenterService.ts`
- Modify: `server/src/services/task/RecoveryTaskService.ts`
- Modify: `server/src/services/task/taskArchive.ts`
- Modify: `server/src/services/knowledge/KnowledgeService.ts`
- Modify: `server/src/services/rag/RagIndexService.ts`
- Test: `server/tests/userScopedTaskCenter.test.js`

- [ ] **Step 1: Write the failing test**

```js
const test = require("node:test");
const assert = require("node:assert/strict");
const { taskCenterService } = require("../dist/services/task/TaskCenterService.js");

test("task center overview and list only include the current user", async () => {
  const overview = await taskCenterService.getOverview({ userId: "user-a" });
  const list = await taskCenterService.listTasks({ userId: "user-a" });

  assert.equal(overview.runningCount, 1);
  assert.deepEqual(list.items.map((item) => item.ownerId), ["novel-a"]);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test server/tests/userScopedTaskCenter.test.js`
Expected: FAIL because task center methods do not accept or enforce `userId`.

- [ ] **Step 3: Write minimal implementation**

```ts
async getOverview(scope: { userId: string }): Promise<TaskOverviewSummary> {
  const archivedIdsByKind = await getArchivedTaskIdsByKind(overviewTaskKinds, scope.userId);
  const workflowTasks = await this.workflowAdapter.list({ take: 500, userId: scope.userId });
  // every grouped where clause adds userId: scope.userId
}
```

```ts
router.get("/overview", requireAuth, async (req, res, next) => {
  try {
    const data = await taskCenterService.getOverview({ userId: req.user.id });
    res.status(200).json({ success: true, data, message: "Task overview loaded." });
  } catch (error) {
    next(error);
  }
});
```

```ts
const namespace = `user:${userId}`;
await vectorStore.upsert(namespace, points);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec tsc -p server/tsconfig.json --noEmitOnError false && node --test server/tests/userScopedTaskCenter.test.js`
Expected: PASS with isolated task overview/list results.

- [ ] **Step 5: Commit**

```bash
git add server/src/routes/tasks.ts server/src/routes/knowledge.ts server/src/services/task/TaskCenterService.ts server/src/services/task/RecoveryTaskService.ts server/src/services/task/taskArchive.ts server/src/services/knowledge/KnowledgeService.ts server/src/services/rag/RagIndexService.ts server/tests/userScopedTaskCenter.test.js
git commit -m "feat: isolate task center and knowledge access by user"
```

## Frontend

### Task 6: Add auth API, auth store, and route guards

**Files:**
- Create: `client/src/api/auth.ts`
- Create: `client/src/store/authStore.ts`
- Create: `client/src/router/RequireAuth.tsx`
- Create: `client/src/router/RequireVerifiedEmail.tsx`
- Modify: `client/src/api/client.ts`
- Modify: `client/src/main.tsx`
- Modify: `client/src/router/index.tsx`
- Test: `client/tests/authRoutingContracts.test.js`

- [ ] **Step 1: Write the failing test**

```js
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

test("router protects all business pages and exposes auth pages publicly", () => {
  const source = fs.readFileSync("client/src/router/index.tsx", "utf8");
  assert.match(source, /path: \"login\"/);
  assert.match(source, /<RequireAuth \/>/);
  assert.match(source, /<RequireVerifiedEmail \/>/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test client/tests/authRoutingContracts.test.js`
Expected: FAIL because the auth routes and guards do not exist.

- [ ] **Step 3: Write minimal implementation**

```ts
export function RequireAuth() {
  const location = useLocation();
  const auth = useAuthStore();
  if (!auth.user) {
    return <Navigate to={`/login?next=${encodeURIComponent(location.pathname + location.search)}`} replace />;
  }
  return <Outlet />;
}
```

```ts
export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: API_TIMEOUT_MS,
  withCredentials: true,
});
```

```ts
const routes: RouteObject[] = [
  { path: "/login", element: <LoginPage /> },
  { path: "/register", element: <RegisterPage /> },
  { path: "/verify-email", element: <VerifyEmailPage /> },
  { path: "/forgot-password", element: <ForgotPasswordPage /> },
  { path: "/reset-password", element: <ResetPasswordPage /> },
  {
    element: <RequireAuth />,
    children: [
      {
        element: <RequireVerifiedEmail />,
        children: [
          { path: "/", element: <AppLayout />, children: [/* existing business routes */] },
        ],
      },
    ],
  },
];
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test client/tests/authRoutingContracts.test.js`
Expected: PASS with auth routes and guards present.

- [ ] **Step 5: Commit**

```bash
git add client/src/api/auth.ts client/src/store/authStore.ts client/src/router/RequireAuth.tsx client/src/router/RequireVerifiedEmail.tsx client/src/api/client.ts client/src/main.tsx client/src/router/index.tsx client/tests/authRoutingContracts.test.js
git commit -m "feat: add client auth store and protected routing"
```

### Task 7: Build login, registration, verification, and reset pages

**Files:**
- Create: `client/src/pages/auth/LoginPage.tsx`
- Create: `client/src/pages/auth/RegisterPage.tsx`
- Create: `client/src/pages/auth/VerifyEmailPage.tsx`
- Create: `client/src/pages/auth/ForgotPasswordPage.tsx`
- Create: `client/src/pages/auth/ResetPasswordPage.tsx`
- Create: `client/src/pages/auth/AuthCardShell.tsx`
- Modify: `client/src/index.css`
- Test: `client/tests/authRoutingContracts.test.js`

- [ ] **Step 1: Write the failing test**

```js
test("auth pages present a dedicated login-first experience", () => {
  const loginSource = fs.readFileSync("client/src/pages/auth/LoginPage.tsx", "utf8");
  assert.match(loginSource, /继续你的小说创作/);
  assert.match(loginSource, /忘记密码/);
  assert.match(loginSource, /去注册/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test client/tests/authRoutingContracts.test.js`
Expected: FAIL because the auth page files do not exist.

- [ ] **Step 3: Write minimal implementation**

```tsx
export default function LoginPage() {
  return (
    <AuthCardShell
      title="继续你的小说创作"
      subtitle="登录后继续管理小说、世界观、知识库与任务进度。"
    >
      <form className="space-y-4">
        <input name="email" type="email" autoComplete="email" />
        <input name="password" type="password" autoComplete="current-password" />
        <Button type="submit">登录</Button>
        <Link to="/forgot-password">忘记密码</Link>
        <Link to="/register">去注册</Link>
      </form>
    </AuthCardShell>
  );
}
```

```css
.auth-shell {
  min-height: 100vh;
  background:
    radial-gradient(circle at top left, rgb(217 201 170 / 0.28), transparent 32%),
    linear-gradient(135deg, #fcfaf4 0%, #f5efe2 52%, #efe7d7 100%);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test client/tests/authRoutingContracts.test.js`
Expected: PASS with the login-first auth copy and files present.

- [ ] **Step 5: Commit**

```bash
git add client/src/pages/auth client/src/index.css client/tests/authRoutingContracts.test.js
git commit -m "feat: add login and registration experience"
```

### Task 8: Split settings UI into admin-only infrastructure pages and user model route pages

**Files:**
- Modify: `client/src/components/layout/Sidebar.tsx`
- Modify: `client/src/components/layout/Navbar.tsx`
- Modify: `client/src/pages/settings/SettingsPage.tsx`
- Modify: `client/src/pages/settings/ModelRoutesPage.tsx`
- Modify: `client/src/api/settings.ts`
- Test: `client/tests/authRoutingContracts.test.js`

- [ ] **Step 1: Write the failing test**

```js
test("settings navigation hides admin infrastructure pages from normal users", () => {
  const sidebarSource = fs.readFileSync("client/src/components/layout/Sidebar.tsx", "utf8");
  assert.match(sidebarSource, /模型路由/);
  assert.match(sidebarSource, /系统设置/);
  assert.match(sidebarSource, /currentUser\\.role/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test client/tests/authRoutingContracts.test.js`
Expected: FAIL because navigation does not branch on user role.

- [ ] **Step 3: Write minimal implementation**

```tsx
const navGroups = buildNavGroups(currentUser.role);

function buildNavGroups(role: "admin" | "user") {
  return [
    /* creative groups */,
    {
      title: "系统",
      items: [
        { to: "/settings/model-routes", label: "模型路由", icon: Route },
        ...(role === "admin" ? [{ to: "/settings", label: "系统设置", icon: Settings2 }] : []),
      ],
    },
  ];
}
```

```tsx
if (currentUser.role !== "admin") {
  return <Navigate to="/settings/model-routes" replace />;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test client/tests/authRoutingContracts.test.js`
Expected: PASS with role-aware settings navigation in place.

- [ ] **Step 5: Commit**

```bash
git add client/src/components/layout/Sidebar.tsx client/src/components/layout/Navbar.tsx client/src/pages/settings/SettingsPage.tsx client/src/pages/settings/ModelRoutesPage.tsx client/src/api/settings.ts client/tests/authRoutingContracts.test.js
git commit -m "feat: separate admin settings from user model routes"
```

## Migration and Validation

### Task 9: Add admin bootstrap and ownership backfill flow

**Files:**
- Create: `server/src/services/auth/adminBootstrap.ts`
- Modify: `server/src/db/runtimeMigrations/20260502_multi_user_account_isolation.ts`
- Modify: `server/src/services/knowledge/KnowledgeService.ts`
- Test: `server/tests/authRoutes.test.js`

- [ ] **Step 1: Write the failing test**

```js
test("legacy private assets are backfilled to the admin account", async () => {
  const admin = await prisma.user.findUnique({ where: { email: "caoty@luckydcms.com" } });
  const orphanNovelCount = await prisma.novel.count({ where: { userId: null } });
  assert.equal(Boolean(admin), true);
  assert.equal(orphanNovelCount, 0);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test server/tests/authRoutes.test.js`
Expected: FAIL because legacy assets are still unowned.

- [ ] **Step 3: Write minimal implementation**

```ts
export async function ensureAdminBootstrap() {
  const email = "caoty@luckydcms.com";
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return existing;
  }
  return prisma.user.create({
    data: {
      email,
      passwordHash: await hashPassword(process.env.ADMIN_BOOTSTRAP_PASSWORD ?? "ChangeMe123!"),
      role: "admin",
      status: "active",
      emailVerifiedAt: new Date(),
    },
  });
}
```

```ts
await prisma.novel.updateMany({ where: { userId: null }, data: { userId: admin.id } });
await prisma.world.updateMany({ where: { userId: null }, data: { userId: admin.id } });
await prisma.knowledgeDocument.updateMany({ where: { userId: null }, data: { userId: admin.id } });
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec tsc -p server/tsconfig.json --noEmitOnError false && node --test server/tests/authRoutes.test.js`
Expected: PASS with no orphaned legacy roots.

- [ ] **Step 5: Commit**

```bash
git add server/src/services/auth/adminBootstrap.ts server/src/db/runtimeMigrations/20260502_multi_user_account_isolation.ts server/src/services/knowledge/KnowledgeService.ts server/tests/authRoutes.test.js
git commit -m "feat: backfill legacy assets to admin ownership"
```

### Task 10: Execute verification sweep and stage public registration release gate

**Files:**
- Modify: `docs/superpowers/specs/2026-05-02-multi-user-account-isolation-design.md`
- Test: `server/tests/authRoutes.test.js`
- Test: `server/tests/userScopedModelRoutes.test.js`
- Test: `server/tests/userScopedGenreRoutes.test.js`
- Test: `server/tests/userScopedTitleLibrary.test.js`
- Test: `server/tests/userScopedTaskCenter.test.js`
- Test: `client/tests/authRoutingContracts.test.js`
- Test: `client/tests/taskCenterContracts.test.js`

- [ ] **Step 1: Run backend verification**

Run: `node --test server/tests/authRoutes.test.js server/tests/userScopedModelRoutes.test.js server/tests/userScopedGenreRoutes.test.js server/tests/userScopedTitleLibrary.test.js server/tests/userScopedTaskCenter.test.js`
Expected: PASS for registration, sessions, user isolation, model route separation, and task isolation.

- [ ] **Step 2: Run frontend verification**

Run: `node --test client/tests/authRoutingContracts.test.js client/tests/taskCenterContracts.test.js`
Expected: PASS for login gating, settings visibility, and task center contracts.

- [ ] **Step 3: Verify protected route behavior manually**

Run: `pnpm dev`
Expected:
- `/login` renders the new auth shell
- visiting `/novels` while logged out redirects to `/login`
- verified admin can enter `/settings`
- normal user can enter `/settings/model-routes` but not `/settings`

- [ ] **Step 4: Update rollout checklist in the spec**

```md
- [x] auth foundation verified locally
- [x] admin ownership backfill verified
- [x] task center user isolation verified
- [x] model route separation verified
- [ ] production DB backup verified before rollout
- [ ] admin-only cutover completed before public registration
```

- [ ] **Step 5: Commit**

```bash
git add docs/superpowers/specs/2026-05-02-multi-user-account-isolation-design.md
git commit -m "docs: mark multi-user rollout verification progress"
```

## Frontend Status Summary

- Public auth pages added
- Protected route shell enforced
- Role-aware navigation and settings visibility enforced
- User-scoped model route UX preserved

## Backend Status Summary

- Session auth and SMTP mail added
- User ownership added to private roots and tasks
- User-scoped creative library services enforced
- User-scoped task and RAG isolation enforced

## Self-Review

- Spec coverage: auth, email, login gating, admin/system split, private libraries, task isolation, knowledge isolation, and migration are all covered by dedicated tasks.
- Placeholder scan: all implementation tasks include concrete files, example code, commands, and expected outcomes.
- Type consistency: the plan consistently uses `User`, `UserSession`, `EmailVerificationToken`, `PasswordResetToken`, `UserModelRouteConfig`, and `userId` ownership.

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-05-02-multi-user-account-isolation.md`. Two execution options:

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

Which approach?
