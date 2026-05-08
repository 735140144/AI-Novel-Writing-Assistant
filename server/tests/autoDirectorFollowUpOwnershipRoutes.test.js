const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");

function createTempDatabaseFile() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "ai-novel-followup-ownership-"));
  return {
    tempDir,
    databasePath: path.join(tempDir, "followup-ownership.db"),
  };
}

function listen(server) {
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      resolve(address.port);
    });
  });
}

async function registerAndLogin(port, email, password) {
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

  const cookie = loginResponse.headers.get("set-cookie");
  assert.ok(cookie);
  return cookie;
}

test("auto director follow-up routes are isolated to the authenticated task owner", async () => {
  const { tempDir, databasePath } = createTempDatabaseFile();
  const originalDatabaseUrl = process.env.DATABASE_URL;
  const originalAuthTestMode = process.env.AUTH_TEST_MODE;

  process.env.DATABASE_URL = `file:${databasePath}`;
  process.env.AUTH_TEST_MODE = "strict";

  const { ensureRuntimeDatabaseReady } = require("../dist/db/runtimeMigrations.js");
  const { ensureSystemResourceStarterData } = require("../dist/services/bootstrap/SystemResourceBootstrapService.js");
  const { createApp } = require("../dist/app.js");
  const { prisma } = require("../dist/db/prisma.js");

  try {
    await ensureRuntimeDatabaseReady();
    await ensureSystemResourceStarterData();

    const app = createApp();
    const server = http.createServer(app);
    const port = await listen(server);
    const timestamp = Date.now();
    const emailA = `followup-a-${timestamp}@example.com`;
    const emailB = `followup-b-${timestamp}@example.com`;
    const password = "StrongPass123!";

    try {
      const cookieA = await registerAndLogin(port, emailA, password);
      const cookieB = await registerAndLogin(port, emailB, password);

      const userA = await prisma.user.findUniqueOrThrow({
        where: { email: emailA },
        select: { id: true },
      });
      const userB = await prisma.user.findUniqueOrThrow({
        where: { email: emailB },
        select: { id: true },
      });

      const novelA = await prisma.novel.create({
        data: {
          user: {
            connect: { id: userA.id },
          },
          title: `用户A小说-${timestamp}`,
          description: "导演跟进权限隔离测试",
          targetAudience: "内部测试",
        },
      });

      const workflowA = await prisma.novelWorkflowTask.create({
        data: {
          user: {
            connect: { id: userA.id },
          },
          novel: {
            connect: { id: novelA.id },
          },
          lane: "auto_director",
          title: "AI 自动导演",
          status: "waiting_approval",
          progress: 0.45,
          currentStage: "章节执行",
          currentItemKey: "auto_director",
          currentItemLabel: "等待继续",
          checkpointType: "front10_ready",
          checkpointSummary: "前 10 章准备完成",
          resumeTargetJson: JSON.stringify({ stage: "chapter", novelId: novelA.id }),
          attemptCount: 0,
          maxAttempts: 3,
          pendingManualRecovery: false,
        },
      });

      const ownerOverviewResponse = await fetch(
        `http://127.0.0.1:${port}/api/auto-director/follow-ups/overview`,
        {
          headers: { Cookie: cookieA },
        },
      );
      assert.equal(ownerOverviewResponse.status, 200);
      const ownerOverviewPayload = await ownerOverviewResponse.json();
      assert.equal(ownerOverviewPayload.success, true);
      assert.equal(ownerOverviewPayload.data.totalCount, 1);

      const foreignOverviewResponse = await fetch(
        `http://127.0.0.1:${port}/api/auto-director/follow-ups/overview`,
        {
          headers: { Cookie: cookieB },
        },
      );
      assert.equal(foreignOverviewResponse.status, 200);
      const foreignOverviewPayload = await foreignOverviewResponse.json();
      assert.equal(foreignOverviewPayload.success, true);
      assert.equal(foreignOverviewPayload.data.totalCount, 0);

      const ownerListResponse = await fetch(
        `http://127.0.0.1:${port}/api/auto-director/follow-ups?section=pending&page=1&pageSize=20`,
        {
          headers: { Cookie: cookieA },
        },
      );
      assert.equal(ownerListResponse.status, 200);
      const ownerListPayload = await ownerListResponse.json();
      assert.equal(ownerListPayload.success, true);
      assert.equal(ownerListPayload.data.items.length, 1);
      assert.equal(ownerListPayload.data.items[0].taskId, workflowA.id);

      const foreignListResponse = await fetch(
        `http://127.0.0.1:${port}/api/auto-director/follow-ups?section=pending&page=1&pageSize=20`,
        {
          headers: { Cookie: cookieB },
        },
      );
      assert.equal(foreignListResponse.status, 200);
      const foreignListPayload = await foreignListResponse.json();
      assert.equal(foreignListPayload.success, true);
      assert.equal(foreignListPayload.data.items.length, 0);

      const ownerDetailResponse = await fetch(
        `http://127.0.0.1:${port}/api/auto-director/follow-ups/${workflowA.id}`,
        {
          headers: { Cookie: cookieA },
        },
      );
      assert.equal(ownerDetailResponse.status, 200);

      const foreignDetailResponse = await fetch(
        `http://127.0.0.1:${port}/api/auto-director/follow-ups/${workflowA.id}`,
        {
          headers: { Cookie: cookieB },
        },
      );
      assert.equal(foreignDetailResponse.status, 404);

      const foreignActionResponse = await fetch(
        `http://127.0.0.1:${port}/api/auto-director/follow-ups/${workflowA.id}/actions`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Cookie: cookieB,
          },
          body: JSON.stringify({
            actionCode: "continue_auto_execution",
            idempotencyKey: `foreign-${workflowA.id}`,
          }),
        },
      );
      assert.equal(foreignActionResponse.status, 404);
    } finally {
      await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
    }
  } finally {
    if (originalDatabaseUrl === undefined) {
      delete process.env.DATABASE_URL;
    } else {
      process.env.DATABASE_URL = originalDatabaseUrl;
    }
    if (originalAuthTestMode === undefined) {
      delete process.env.AUTH_TEST_MODE;
    } else {
      process.env.AUTH_TEST_MODE = originalAuthTestMode;
    }
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});
