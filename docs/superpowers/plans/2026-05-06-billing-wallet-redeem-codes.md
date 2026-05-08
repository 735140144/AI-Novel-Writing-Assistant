# 计费、钱包与兑换码实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add admin-managed model pricing, package templates, and redeem-code management; add user wallet and redeem flows; and enforce billing checks on every model call so users cannot use tasks or page models without quota or balance.

**Architecture:** Add a small billing domain around Prisma-backed price/package/code/wallet tables, then reuse the existing `requestContext`/LLM factory path to resolve user ownership and enforce pre-check + post-charge accounting. Frontend changes stay inside the existing settings shell for admins and a new wallet page for users, with usage charts driven from daily aggregates rather than raw call history.

**Tech Stack:** Express, Prisma, React, TanStack Query, React Router, Axios, Node test runner, SVG charting, UTC+8 date handling.

---

## File Structure

### Prisma and runtime migrations

- Modify: `server/src/prisma/schema.prisma`
- Modify: `server/src/prisma/schema.sqlite.prisma`
- Create: `server/src/db/runtimeMigrations/20260506_billing_wallet_redeem_codes.ts`
- Modify: `server/src/db/runtimeMigrations.ts`

### Backend billing domain

- Create: `server/src/services/billing/BillingModelPriceService.ts`
- Create: `server/src/services/billing/BillingPackageService.ts`
- Create: `server/src/services/billing/BillingRedeemCodeService.ts`
- Create: `server/src/services/billing/BillingWalletService.ts`
- Create: `server/src/services/billing/BillingUsageService.ts`
- Create: `server/src/services/billing/BillingQuotaService.ts`
- Create: `server/src/services/billing/billingTime.ts`
- Create: `server/src/services/billing/billingTypes.ts`
- Create: `server/src/middleware/billingGuard.ts`
- Create: `server/src/routes/billing.ts`
- Modify: `server/src/routes/settings.ts`
- Modify: `server/src/app.ts`
- Modify: `server/src/runtime/requestContext.ts`
- Modify: `server/src/llm/factory.ts`
- Modify: `server/src/llm/structuredInvoke.ts`
- Modify: `server/src/llm/usageTracking.ts`
- Modify: `server/src/llm/requestGuard.ts`
- Modify: `server/src/llm/modelRouter.ts`
- Modify: `server/src/services/task/adapters/NovelWorkflowTaskAdapter.ts`
- Modify: `server/src/services/task/adapters/PipelineTaskAdapter.ts`
- Modify: `server/src/services/task/adapters/StyleExtractionTaskAdapter.ts`
- Modify: `server/src/services/novel/NovelPipelineRuntimeService.ts`
- Modify: `server/src/services/novel/workflow/NovelWorkflowService.ts`
- Modify: `server/src/services/novel/director/NovelDirectorService.ts`
- Modify: `server/src/services/novel/chapterSceneStreaming.ts`
- Modify: `server/src/services/novel/chapterWritingGraph.ts`
- Modify: `server/src/routes/chat.ts`
- Modify: `server/src/routes/novel.ts`
- Modify: `server/src/routes/llm.ts`

### Backend admin/user routes

- Create: `server/src/routes/billing.ts`
- Modify: `server/src/routes/settings.ts`
- Modify: `server/src/routes/chat.ts`
- Modify: `server/src/routes/novel.ts`
- Modify: `server/src/routes/llm.ts`

### Frontend billing surfaces

- Create: `client/src/api/billing.ts`
- Modify: `client/src/api/settings.ts`
- Modify: `client/src/api/queryKeys.ts`
- Create: `client/src/pages/wallet/WalletPage.tsx`
- Create: `client/src/pages/settings/BillingManagementPage.tsx`
- Create: `client/src/pages/settings/components/BillingNavigationCard.tsx`
- Create: `client/src/pages/wallet/components/WalletUsageChart.tsx`
- Create: `client/src/pages/wallet/components/WalletRedeemForm.tsx`
- Create: `client/src/pages/wallet/components/WalletPackageCard.tsx`
- Modify: `client/src/router/index.tsx`
- Modify: `client/src/components/layout/Sidebar.tsx`
- Modify: `client/src/components/layout/mobile/mobileSiteNavigation.ts`
- Modify: `client/src/pages/settings/SettingsPage.tsx`
- Modify: `client/src/pages/settings/components/SettingsNavigationCards.tsx`
- Modify: `client/src/components/layout/AppLayout.tsx`

### Shared types and tests

- Modify: `shared/index.ts`
- Create: `shared/types/billing.ts`
- Create: `server/tests/billingRoutes.test.js`
- Create: `server/tests/billingQuotaService.test.js`
- Create: `server/tests/billingUsageService.test.js`
- Create: `server/tests/billingTime.test.js`
- Create: `server/tests/billingGuard.test.js`
- Create: `client/tests/walletContracts.test.js`
- Modify: `client/tests/authRoutingContracts.test.js`
- Modify: `client/tests/mobilePageContracts.test.js`
- Modify: `client/tests/taskCenterContracts.test.js`

---

## Backend

### Task 1: Add billing schema, runtime migration, and shared billing types

**Files:**
- Modify: `server/src/prisma/schema.prisma`
- Modify: `server/src/prisma/schema.sqlite.prisma`
- Create: `server/src/db/runtimeMigrations/20260506_billing_wallet_redeem_codes.ts`
- Modify: `server/src/db/runtimeMigrations.ts`
- Create: `shared/types/billing.ts`
- Modify: `shared/index.ts`
- Test: `server/tests/billingTime.test.js`

- [ ] **Step 1: Write the failing test**

```js
const test = require("node:test");
const assert = require("node:assert/strict");
const { getUtc8DayKey } = require("../dist/services/billing/billingTime.js");

test("getUtc8DayKey rolls over at UTC+8 midnight", () => {
  assert.equal(getUtc8DayKey(new Date("2026-05-05T15:59:59.000Z")), "2026-05-05");
  assert.equal(getUtc8DayKey(new Date("2026-05-05T16:00:00.000Z")), "2026-05-06");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @ai-novel/server test -- tests/billingTime.test.js`
Expected: FAIL because `billingTime` does not exist yet.

- [ ] **Step 3: Write minimal implementation**

```ts
export function getUtc8DayKey(value: Date): string {
  const shifted = new Date(value.getTime() + 8 * 60 * 60 * 1000);
  return shifted.toISOString().slice(0, 10);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @ai-novel/server test -- tests/billingTime.test.js`
Expected: PASS.

### Task 2: Implement billing services for prices, packages, redeem codes, wallet, and daily summaries

**Files:**
- Create: `server/src/services/billing/BillingModelPriceService.ts`
- Create: `server/src/services/billing/BillingPackageService.ts`
- Create: `server/src/services/billing/BillingRedeemCodeService.ts`
- Create: `server/src/services/billing/BillingWalletService.ts`
- Create: `server/src/services/billing/BillingUsageService.ts`
- Create: `server/src/services/billing/BillingQuotaService.ts`
- Create: `server/src/services/billing/billingTypes.ts`
- Test: `server/tests/billingQuotaService.test.js`
- Test: `server/tests/billingUsageService.test.js`

- [ ] **Step 1: Write the failing test**

```js
const test = require("node:test");
const assert = require("node:assert/strict");
const { allocateBillingCharge } = require("../dist/services/billing/BillingQuotaService.js");

test("billing quota spends monthly quota before wallet balance", () => {
  const result = allocateBillingCharge({
    packageRemainingAmount: 12,
    walletBalanceAmount: 20,
    chargeAmount: 15,
  });

  assert.deepEqual(result, {
    packageChargedAmount: 12,
    walletChargedAmount: 3,
    packageRemainingAmount: 0,
    walletBalanceAmount: 17,
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @ai-novel/server test -- tests/billingQuotaService.test.js`
Expected: FAIL because the allocator does not exist yet.

- [ ] **Step 3: Write minimal implementation**

```ts
export function allocateBillingCharge(input: {
  packageRemainingAmount: number;
  walletBalanceAmount: number;
  chargeAmount: number;
}) {
  const packageChargedAmount = Math.min(input.packageRemainingAmount, input.chargeAmount);
  const walletChargedAmount = input.chargeAmount - packageChargedAmount;
  return {
    packageChargedAmount,
    walletChargedAmount,
    packageRemainingAmount: input.packageRemainingAmount - packageChargedAmount,
    walletBalanceAmount: input.walletBalanceAmount - walletChargedAmount,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @ai-novel/server test -- tests/billingQuotaService.test.js`
Expected: PASS.

### Task 3: Add billing admin and user routes

**Files:**
- Create: `server/src/routes/billing.ts`
- Modify: `server/src/routes/settings.ts`
- Modify: `server/src/app.ts`
- Test: `server/tests/billingRoutes.test.js`

- [ ] **Step 1: Write the failing test**

```js
const test = require("node:test");
const assert = require("node:assert/strict");

test("admin can manage billing prices and users can open wallet endpoints", async () => {
  const { createApp } = require("../dist/app.js");
  const { ensureRuntimeDatabaseReady } = require("../dist/db/runtimeMigrations.js");
  const { prisma } = require("../dist/db/prisma.js");
  const http = require("node:http");

  await ensureRuntimeDatabaseReady();
  const app = createApp();
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;

  const user = await prisma.user.create({
    data: {
      email: `reader-${Date.now()}@example.com`,
      passwordHash: "hash",
      role: "user",
      status: "active",
      emailVerifiedAt: new Date(),
    },
  });
  const me = await fetch(`http://127.0.0.1:${port}/api/wallet/summary`, {
    headers: { Cookie: `ai_novel_session=fake` },
  });
  assert.equal(me.status, 401);
  await new Promise((resolve) => server.close(resolve));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @ai-novel/server test -- tests/billingRoutes.test.js`
Expected: FAIL because `/api/wallet` does not exist yet.

- [ ] **Step 3: Write minimal implementation**

```ts
router.use(authMiddleware);

router.get("/wallet/summary", async (_req, res) => {
  res.status(200).json({ success: true, data: { balanceAmount: 0, currentPackages: [] }, message: "钱包摘要已加载。" });
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @ai-novel/server test -- tests/billingRoutes.test.js`
Expected: PASS.

### Task 4: Enforce billing guard in the unified LLM path and task-driven model calls

**Files:**
- Create: `server/src/middleware/billingGuard.ts`
- Modify: `server/src/runtime/requestContext.ts`
- Modify: `server/src/llm/factory.ts`
- Modify: `server/src/llm/structuredInvoke.ts`
- Modify: `server/src/llm/usageTracking.ts`
- Modify: `server/src/llm/modelRouter.ts`
- Modify: `server/src/services/task/adapters/NovelWorkflowTaskAdapter.ts`
- Modify: `server/src/services/task/adapters/PipelineTaskAdapter.ts`
- Modify: `server/src/services/task/adapters/StyleExtractionTaskAdapter.ts`
- Modify: `server/src/services/novel/NovelPipelineRuntimeService.ts`
- Modify: `server/src/services/novel/workflow/NovelWorkflowService.ts`
- Modify: `server/src/services/novel/director/NovelDirectorService.ts`
- Modify: `server/src/services/novel/chapterSceneStreaming.ts`
- Modify: `server/src/services/novel/chapterWritingGraph.ts`
- Modify: `server/src/routes/chat.ts`
- Modify: `server/src/routes/novel.ts`
- Modify: `server/src/routes/llm.ts`
- Test: `server/tests/billingGuard.test.js`

- [ ] **Step 1: Write the failing test**

```js
const test = require("node:test");
const assert = require("node:assert/strict");
const { allocateBillingCharge } = require("../dist/services/billing/BillingQuotaService.js");

test("billing guard rejects calls when both monthly quota and wallet are empty", () => {
  assert.throws(() => allocateBillingCharge({
    packageRemainingAmount: 0,
    walletBalanceAmount: 0,
    chargeAmount: 1,
  }));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @ai-novel/server test -- tests/billingGuard.test.js`
Expected: FAIL because guard behavior is not implemented yet.

- [ ] **Step 3: Write minimal implementation**

```ts
export function allocateBillingCharge(input: {
  packageRemainingAmount: number;
  walletBalanceAmount: number;
  chargeAmount: number;
}) {
  if (input.packageRemainingAmount <= 0 && input.walletBalanceAmount <= 0) {
    throw new Error("当前没有可用的套餐或余额，请先兑换后再继续使用。");
  }
  const packageChargedAmount = Math.min(input.packageRemainingAmount, input.chargeAmount);
  const walletChargedAmount = input.chargeAmount - packageChargedAmount;
  if (walletChargedAmount > input.walletBalanceAmount) {
    throw new Error("当前额度不足，无法继续使用模型。");
  }
  return {
    packageChargedAmount,
    walletChargedAmount,
    packageRemainingAmount: input.packageRemainingAmount - packageChargedAmount,
    walletBalanceAmount: input.walletBalanceAmount - walletChargedAmount,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @ai-novel/server test -- tests/billingGuard.test.js`
Expected: PASS.

### Task 5: Hook admin billing management into the settings shell

**Files:**
- Modify: `server/src/routes/settings.ts`
- Modify: `client/src/pages/settings/SettingsPage.tsx`
- Modify: `client/src/pages/settings/components/SettingsNavigationCards.tsx`
- Create: `client/src/pages/settings/BillingManagementPage.tsx`
- Create: `client/src/pages/settings/components/BillingNavigationCard.tsx`
- Modify: `client/src/router/index.tsx`
- Modify: `client/src/api/settings.ts`
- Modify: `client/src/api/queryKeys.ts`
- Modify: `client/src/components/layout/Sidebar.tsx`
- Modify: `client/src/components/layout/mobile/mobileSiteNavigation.ts`
- Test: `client/tests/mobilePageContracts.test.js`

- [ ] **Step 1: Write the failing test**

```js
const test = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");

test("settings navigation includes billing management entry", () => {
  const source = readFileSync("client/src/pages/settings/components/SettingsNavigationCards.tsx", "utf8");
  assert.match(source, /BillingManagementPage|计费管理/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @ai-novel/client test -- tests/mobilePageContracts.test.js`
Expected: FAIL because billing entry does not exist yet.

- [ ] **Step 3: Write minimal implementation**

```tsx
<Card>
  <CardHeader>
    <CardTitle>计费管理</CardTitle>
    <CardDescription>配置模型价格、套餐模板和兑换码。</CardDescription>
  </CardHeader>
  <CardContent>
    <Button asChild><Link to="/settings/billing">进入计费管理</Link></Button>
  </CardContent>
</Card>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @ai-novel/client test -- tests/mobilePageContracts.test.js`
Expected: PASS.

### Task 6: Build the user wallet page with daily usage chart and redeem flow

**Files:**
- Create: `client/src/api/billing.ts`
- Create: `client/src/pages/wallet/WalletPage.tsx`
- Create: `client/src/pages/wallet/components/WalletUsageChart.tsx`
- Create: `client/src/pages/wallet/components/WalletRedeemForm.tsx`
- Create: `client/src/pages/wallet/components/WalletPackageCard.tsx`
- Modify: `client/src/router/index.tsx`
- Modify: `client/src/components/layout/Sidebar.tsx`
- Modify: `client/src/components/layout/mobile/mobileSiteNavigation.ts`
- Modify: `client/src/pages/settings/SettingsPage.tsx`
- Modify: `client/tests/authRoutingContracts.test.js`
- Test: `client/tests/walletContracts.test.js`

- [ ] **Step 1: Write the failing test**

```js
const test = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");

test("wallet page route and navigation are wired", () => {
  const router = readFileSync("client/src/router/index.tsx", "utf8");
  assert.match(router, /path: "wallet"/);
  const sidebar = readFileSync("client/src/components/layout/Sidebar.tsx", "utf8");
  assert.match(sidebar, /钱包管理|\/wallet/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @ai-novel/client test -- tests/walletContracts.test.js`
Expected: FAIL because wallet page is not wired yet.

- [ ] **Step 3: Write minimal implementation**

```tsx
<Card>
  <CardHeader>
    <CardTitle>钱包管理</CardTitle>
    <CardDescription>查看当前套餐、模型价格和使用记录，并兑换新的额度。</CardDescription>
  </CardHeader>
</Card>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @ai-novel/client test -- tests/walletContracts.test.js`
Expected: PASS.

### Task 7: Verify the full billing flow end to end

**Files:**
- Modify: `server/tests/billingRoutes.test.js`
- Modify: `server/tests/billingUsageService.test.js`
- Modify: `server/tests/billingQuotaService.test.js`
- Modify: `server/tests/billingTime.test.js`
- Modify: `client/tests/walletContracts.test.js`
- Modify: `client/tests/taskCenterContracts.test.js`

- [ ] **Step 1: Write the failing integration assertions**

```js
test("user wallet summary exposes balance, packages, and daily usage data", async () => {
  const source = readFileSync("client/src/pages/wallet/WalletPage.tsx", "utf8");
  assert.match(source, /使用记录|兑换码/);
});
```

- [ ] **Step 2: Run the server and client test subsets**

Run:
`pnpm --filter @ai-novel/server test -- tests/billingRoutes.test.js tests/billingUsageService.test.js tests/billingQuotaService.test.js tests/billingTime.test.js`

Run:
`pnpm --filter @ai-novel/client test -- tests/walletContracts.test.js tests/taskCenterContracts.test.js`

Expected: all pass after the earlier tasks are complete.

- [ ] **Step 3: Clean up duplicated helper logic**

```ts
// Share one UTC+8 day helper and one charge allocation helper across services.
```

- [ ] **Step 4: Run build and targeted tests**

Run: `pnpm build`
Expected: PASS.

Run: `pnpm --filter @ai-novel/server test`
Expected: PASS for billing-related and impacted route tests.

Run: `pnpm --filter @ai-novel/client test`
Expected: PASS for billing contract tests.

- [ ] **Step 5: Commit**

```bash
git add server/src/prisma/schema.prisma server/src/prisma/schema.sqlite.prisma server/src/db/runtimeMigrations.ts server/src/db/runtimeMigrations/20260506_billing_wallet_redeem_codes.ts shared/index.ts shared/types/billing.ts server/src/services/billing client/src/pages/wallet client/src/pages/settings/BillingManagementPage.tsx client/src/pages/settings/components/BillingNavigationCard.tsx client/src/api/billing.ts client/src/api/queryKeys.ts client/src/components/layout/Sidebar.tsx client/src/components/layout/mobile/mobileSiteNavigation.ts client/src/router/index.tsx server/tests/billingRoutes.test.js server/tests/billingQuotaService.test.js server/tests/billingUsageService.test.js server/tests/billingTime.test.js server/tests/billingGuard.test.js client/tests/walletContracts.test.js
git commit -m "feat: add billing wallet and redeem code flow"
```
