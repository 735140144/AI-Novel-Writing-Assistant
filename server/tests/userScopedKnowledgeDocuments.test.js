const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");

const CHILD_FLAG = "AI_NOVEL_RUN_USER_SCOPED_KNOWLEDGE_CHILD";
const distRoot = path.join(__dirname, "../dist");

function clearDistModuleCache() {
  for (const cacheKey of Object.keys(require.cache)) {
    if (cacheKey.startsWith(distRoot)) {
      delete require.cache[cacheKey];
    }
  }
}

function createTempDatabaseFile() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "ai-novel-user-scoped-knowledge-"));
  const databasePath = path.join(tempDir, "user-scoped-knowledge.db");
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

async function createKnowledgeDocument(port, cookie, title, extraBody = {}) {
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
      ...extraBody,
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

async function createWorld(port, cookie, name) {
  return fetch(`http://127.0.0.1:${port}/api/worlds`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: cookie,
    },
    body: JSON.stringify({
      name,
      description: `${name} 的世界设定`,
    }),
  });
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
    const emailA = `knowledge-a-${timestamp}@example.com`;
    const emailB = `knowledge-b-${timestamp}@example.com`;
    const password = "StrongPass123!";

    try {
      const cookieA = await registerAndLogin(port, emailA, password);
      const cookieB = await registerAndLogin(port, emailB, password);

      const createDocAResponse = await createKnowledgeDocument(port, cookieA, `用户A知识库-${timestamp}`);
      assert.equal(createDocAResponse.status, 201);
      const createDocAPayload = await createDocAResponse.json();
      const documentAId = createDocAPayload.data.id;
      assert.ok(documentAId);

      const createDocBResponse = await createKnowledgeDocument(port, cookieB, `用户B知识库-${timestamp}`);
      assert.equal(createDocBResponse.status, 201);
      const createDocBPayload = await createDocBResponse.json();
      const documentBId = createDocBPayload.data.id;
      assert.ok(documentBId);

      const listAResponse = await fetch(`http://127.0.0.1:${port}/api/knowledge/documents`, {
        headers: { Cookie: cookieA },
      });
      const listBResponse = await fetch(`http://127.0.0.1:${port}/api/knowledge/documents`, {
        headers: { Cookie: cookieB },
      });
      assert.equal(listAResponse.status, 200);
      assert.equal(listBResponse.status, 200);

      const listAPayload = await listAResponse.json();
      const listBPayload = await listBResponse.json();
      assert.equal(listAPayload.data.length, 1);
      assert.equal(listBPayload.data.length, 1);
      assert.equal(listAPayload.data[0].id, documentAId);
      assert.equal(listBPayload.data[0].id, documentBId);

      const foreignDetailResponse = await fetch(`http://127.0.0.1:${port}/api/knowledge/documents/${documentAId}`, {
        headers: { Cookie: cookieB },
      });
      assert.equal(foreignDetailResponse.status, 404);

      const foreignVersionResponse = await fetch(
        `http://127.0.0.1:${port}/api/knowledge/documents/${documentAId}/versions`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Cookie: cookieB,
          },
          body: JSON.stringify({
            content: "越权新增版本",
          }),
        },
      );
      assert.equal(foreignVersionResponse.status, 404);

      const foreignStatusPatchResponse = await fetch(`http://127.0.0.1:${port}/api/knowledge/documents/${documentAId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Cookie: cookieB,
        },
        body: JSON.stringify({
          status: "archived",
        }),
      });
      assert.equal(foreignStatusPatchResponse.status, 404);

      const createNovelResponse = await createNovel(port, cookieA, `知识绑定小说-${timestamp}`);
      assert.equal(createNovelResponse.status, 201);
      const createNovelPayload = await createNovelResponse.json();
      const novelAId = createNovelPayload.data.id;

      const createWorldResponse = await createWorld(port, cookieA, `知识绑定世界-${timestamp}`);
      assert.equal(createWorldResponse.status, 201);
      const createWorldPayload = await createWorldResponse.json();
      const worldAId = createWorldPayload.data.id;

      const foreignNovelBindingResponse = await fetch(
        `http://127.0.0.1:${port}/api/novels/${novelAId}/knowledge-documents`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            Cookie: cookieB,
          },
          body: JSON.stringify({
            documentIds: [documentAId],
          }),
        },
      );
      assert.equal(foreignNovelBindingResponse.status, 404);

      const foreignWorldBindingResponse = await fetch(
        `http://127.0.0.1:${port}/api/worlds/${worldAId}/knowledge-documents`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            Cookie: cookieB,
          },
          body: JSON.stringify({
            documentIds: [documentAId],
          }),
        },
      );
      assert.equal(foreignWorldBindingResponse.status, 404);

      const crossUserNovelReferenceResponse = await fetch(`http://127.0.0.1:${port}/api/novels`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: cookieB,
        },
        body: JSON.stringify({
          title: `越权知识续写-${timestamp}`,
          writingMode: "continuation",
          sourceKnowledgeDocumentId: documentAId,
        }),
      });
      assert.equal(crossUserNovelReferenceResponse.status, 400);
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
  test("knowledge documents are isolated per authenticated user", async () => {
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
