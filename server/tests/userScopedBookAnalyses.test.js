const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");

const CHILD_FLAG = "AI_NOVEL_RUN_USER_SCOPED_BOOK_ANALYSES_CHILD";
const distRoot = path.join(__dirname, "../dist");

const BOOK_ANALYSIS_SECTIONS = [
  { key: "overview", title: "整体概览" },
  { key: "plot_structure", title: "情节结构" },
  { key: "timeline", title: "时间线" },
  { key: "character_system", title: "角色系统" },
  { key: "worldbuilding", title: "世界设定" },
  { key: "themes", title: "主题表达" },
  { key: "style_technique", title: "文风技法" },
  { key: "market_highlights", title: "市场亮点" },
];

function clearDistModuleCache() {
  for (const cacheKey of Object.keys(require.cache)) {
    if (cacheKey.startsWith(distRoot)) {
      delete require.cache[cacheKey];
    }
  }
}

function createTempDatabaseFile() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "ai-novel-user-scoped-book-analyses-"));
  const databasePath = path.join(tempDir, "user-scoped-book-analyses.db");
  return { tempDir, databasePath };
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

async function createKnowledgeDocument(port, cookie, title) {
  return fetch(`http://127.0.0.1:${port}/api/knowledge/documents`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: cookie,
    },
    body: JSON.stringify({
      title,
      fileName: `${title}.txt`,
      content: `${title} 的正文内容`,
    }),
  });
}

async function createNovel(port, cookie, title) {
  return fetch(`http://127.0.0.1:${port}/api/novels`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: cookie,
    },
    body: JSON.stringify({ title }),
  });
}

async function hasBookAnalysisUserIdColumn(prisma) {
  const columns = await prisma.$queryRawUnsafe(`PRAGMA table_info("BookAnalysis")`);
  return Array.isArray(columns) && columns.some((column) => column?.name === "userId");
}

async function seedBookAnalysis(prisma, input) {
  const document = await prisma.knowledgeDocument.findUnique({
    where: { id: input.documentId },
    select: {
      id: true,
      userId: true,
      activeVersionId: true,
      activeVersionNumber: true,
    },
  });
  assert.ok(document?.activeVersionId);

  const analysis = await prisma.bookAnalysis.create({
    data: {
      documentId: input.documentId,
      documentVersionId: document.activeVersionId,
      title: input.title,
      status: input.status ?? "queued",
      summary: `${input.title} 摘要`,
      progress: input.status === "succeeded" ? 1 : 0,
      pendingManualRecovery: input.pendingManualRecovery ?? false,
      lastError: input.pendingManualRecovery ? "服务重启后任务已暂停，等待手动恢复。" : null,
    },
  });

  if (await hasBookAnalysisUserIdColumn(prisma)) {
    await prisma.$executeRawUnsafe(
      `UPDATE "BookAnalysis" SET "userId" = ? WHERE "id" = ?`,
      document.userId,
      analysis.id,
    );
  }

  await prisma.bookAnalysisSection.createMany({
    data: BOOK_ANALYSIS_SECTIONS.map((section, index) => ({
      analysisId: analysis.id,
      sectionKey: section.key,
      title: section.title,
      status: "succeeded",
      aiContent: `${input.title}-${section.title}-内容`,
      editedContent: section.key === "overview" ? `${input.title} 的整体概览` : null,
      notes: `${input.title}-${section.title}-备注`,
      sortOrder: index,
    })),
  });

  return analysis.id;
}

async function runScenario() {
  const { tempDir, databasePath } = createTempDatabaseFile();
  const originalDatabaseUrl = process.env.DATABASE_URL;
  const originalAuthTestMode = process.env.AUTH_TEST_MODE;

  process.env.DATABASE_URL = `file:${databasePath}`;
  process.env.AUTH_TEST_MODE = "strict";

  clearDistModuleCache();

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
    const emailA = `book-analysis-a-${timestamp}@example.com`;
    const emailB = `book-analysis-b-${timestamp}@example.com`;
    const password = "StrongPass123!";

    try {
      const cookieA = await registerAndLogin(port, emailA, password);
      const cookieB = await registerAndLogin(port, emailB, password);

      const [userA, userB] = await Promise.all([
        prisma.user.findUnique({ where: { email: emailA }, select: { id: true } }),
        prisma.user.findUnique({ where: { email: emailB }, select: { id: true } }),
      ]);
      assert.ok(userA?.id);
      assert.ok(userB?.id);

      const createDocAResponse = await createKnowledgeDocument(port, cookieA, `用户A拆书文档-${timestamp}`);
      assert.equal(createDocAResponse.status, 201);
      const createDocAPayload = await createDocAResponse.json();
      const documentAId = createDocAPayload.data.id;
      assert.ok(documentAId);

      const createDocBResponse = await createKnowledgeDocument(port, cookieB, `用户B拆书文档-${timestamp}`);
      assert.equal(createDocBResponse.status, 201);
      const createDocBPayload = await createDocBResponse.json();
      const documentBId = createDocBPayload.data.id;
      assert.ok(documentBId);

      const analysisAId = await seedBookAnalysis(prisma, {
        userId: userA.id,
        documentId: documentAId,
        title: `用户A拆书-${timestamp}`,
        status: "queued",
        pendingManualRecovery: true,
      });
      const analysisBId = await seedBookAnalysis(prisma, {
        userId: userB.id,
        documentId: documentBId,
        title: `用户B拆书-${timestamp}`,
        status: "queued",
        pendingManualRecovery: true,
      });

      await prisma.ragIndexJob.deleteMany({});

      const createNovelAResponse = await createNovel(port, cookieA, `用户A小说-${timestamp}`);
      assert.equal(createNovelAResponse.status, 201);
      const createNovelAPayload = await createNovelAResponse.json();
      const novelAId = createNovelAPayload.data.id;
      assert.ok(novelAId);

      const listAResponse = await fetch(`http://127.0.0.1:${port}/api/book-analysis`, {
        headers: { Cookie: cookieA },
      });
      const listBResponse = await fetch(`http://127.0.0.1:${port}/api/book-analysis`, {
        headers: { Cookie: cookieB },
      });
      assert.equal(listAResponse.status, 200);
      assert.equal(listBResponse.status, 200);

      const listAPayload = await listAResponse.json();
      const listBPayload = await listBResponse.json();
      assert.equal(listAPayload.data.length, 1);
      assert.equal(listBPayload.data.length, 1);
      assert.equal(listAPayload.data[0].id, analysisAId);
      assert.equal(listBPayload.data[0].id, analysisBId);

      const foreignDetailResponse = await fetch(`http://127.0.0.1:${port}/api/book-analysis/${analysisAId}`, {
        headers: { Cookie: cookieB },
      });
      assert.equal(foreignDetailResponse.status, 404);

      const foreignCopyResponse = await fetch(`http://127.0.0.1:${port}/api/book-analysis/${analysisAId}/copy`, {
        method: "POST",
        headers: {
          Cookie: cookieB,
        },
      });
      assert.equal(foreignCopyResponse.status, 404);

      const taskListAResponse = await fetch(`http://127.0.0.1:${port}/api/tasks?kind=book_analysis`, {
        headers: { Cookie: cookieA },
      });
      assert.equal(taskListAResponse.status, 200);
      const taskListAPayload = await taskListAResponse.json();
      assert.equal(taskListAPayload.data.items.length, 1);
      assert.equal(taskListAPayload.data.items[0].id, analysisAId);

      const overviewAResponse = await fetch(`http://127.0.0.1:${port}/api/tasks/overview`, {
        headers: { Cookie: cookieA },
      });
      assert.equal(overviewAResponse.status, 200);
      const overviewAPayload = await overviewAResponse.json();
      assert.equal(overviewAPayload.data.queuedCount, 1);
      assert.equal(overviewAPayload.data.recoveryCandidateCount, 1);

      const recoveryAResponse = await fetch(`http://127.0.0.1:${port}/api/tasks/recovery-candidates`, {
        headers: { Cookie: cookieA },
      });
      assert.equal(recoveryAResponse.status, 200);
      const recoveryAPayload = await recoveryAResponse.json();
      assert.equal(recoveryAPayload.data.items.length, 1);
      assert.equal(recoveryAPayload.data.items[0].id, analysisAId);

      const foreignPublishResponse = await fetch(`http://127.0.0.1:${port}/api/book-analysis/${analysisBId}/publish`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: cookieB,
        },
        body: JSON.stringify({
          novelId: novelAId,
        }),
      });
      assert.equal(foreignPublishResponse.status, 404);
    } finally {
      await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
    }
  } finally {
    await prisma.$disconnect().catch(() => undefined);
    clearDistModuleCache();
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
}

if (process.env[CHILD_FLAG] === "1") {
  runScenario().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
} else {
  test("book analyses are isolated per authenticated user", async () => {
    await new Promise((resolve, reject) => {
      const child = spawn(process.execPath, [__filename], {
        cwd: path.join(__dirname, ".."),
        env: {
          ...process.env,
          [CHILD_FLAG]: "1",
        },
        stdio: "inherit",
      });
      child.on("exit", (code) => {
        if (code === 0) {
          resolve();
          return;
        }
        reject(new Error(`child scenario exited with code ${code ?? -1}`));
      });
      child.on("error", reject);
    });
  });
}
