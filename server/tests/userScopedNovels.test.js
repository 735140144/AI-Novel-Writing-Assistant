const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");

const CHILD_FLAG = "AI_NOVEL_RUN_USER_SCOPED_NOVELS_CHILD";
const distRoot = path.join(__dirname, "../dist");

function clearDistModuleCache() {
  for (const cacheKey of Object.keys(require.cache)) {
    if (cacheKey.startsWith(distRoot)) {
      delete require.cache[cacheKey];
    }
  }
}

function createTempDatabaseFile() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "ai-novel-user-scoped-novels-"));
  const databasePath = path.join(tempDir, "user-scoped-novels.db");
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

async function createNovel(port, cookie, title, extraBody = {}) {
  const response = await fetch(`http://127.0.0.1:${port}/api/novels`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: cookie,
    },
    body: JSON.stringify({
      title,
      ...extraBody,
    }),
  });
  return response;
}

async function runScenario() {
  const { tempDir, databasePath } = createTempDatabaseFile();
  const originalDatabaseUrl = process.env.DATABASE_URL;
  const originalAuthTestMode = process.env.AUTH_TEST_MODE;
  const originalAuthDisableEmail = process.env.AUTH_DISABLE_EMAIL;

  process.env.DATABASE_URL = `file:${databasePath}`;
  process.env.AUTH_TEST_MODE = "strict";
  process.env.AUTH_DISABLE_EMAIL = "true";

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
    const emailA = `novel-a-${timestamp}@example.com`;
    const emailB = `novel-b-${timestamp}@example.com`;
    const password = "StrongPass123!";

    try {
      const cookieA = await registerAndLogin(port, emailA, password);
      const cookieB = await registerAndLogin(port, emailB, password);

      const createNovelAResponse = await createNovel(port, cookieA, `用户A小说-${timestamp}`);
      assert.equal(createNovelAResponse.status, 201);
      const createNovelAPayload = await createNovelAResponse.json();
      const novelAId = createNovelAPayload.data.id;
      assert.ok(novelAId);

      const createNovelBResponse = await createNovel(port, cookieB, `用户B小说-${timestamp}`);
      assert.equal(createNovelBResponse.status, 201);
      const createNovelBPayload = await createNovelBResponse.json();
      const novelBId = createNovelBPayload.data.id;
      assert.ok(novelBId);

      const createCredentialAResponse = await fetch(`http://127.0.0.1:${port}/api/novels/publishing/credentials`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: cookieA,
        },
        body: JSON.stringify({
          label: `用户A番茄账号-${timestamp}`,
          credentialUuid: `credential-a-${timestamp}`,
        }),
      });
      assert.equal(createCredentialAResponse.status, 201);
      const createCredentialAPayload = await createCredentialAResponse.json();
      const credentialAId = createCredentialAPayload.data.id;
      assert.ok(credentialAId);

      const createCredentialBResponse = await fetch(`http://127.0.0.1:${port}/api/novels/publishing/credentials`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: cookieB,
        },
        body: JSON.stringify({
          label: `用户B番茄账号-${timestamp}`,
          credentialUuid: `credential-b-${timestamp}`,
        }),
      });
      assert.equal(createCredentialBResponse.status, 201);

      const credentialListAResponse = await fetch(`http://127.0.0.1:${port}/api/novels/publishing/credentials`, {
        headers: { Cookie: cookieA },
      });
      const credentialListBResponse = await fetch(`http://127.0.0.1:${port}/api/novels/publishing/credentials`, {
        headers: { Cookie: cookieB },
      });
      assert.equal(credentialListAResponse.status, 200);
      assert.equal(credentialListBResponse.status, 200);
      const credentialListAPayload = await credentialListAResponse.json();
      const credentialListBPayload = await credentialListBResponse.json();
      assert.deepEqual(credentialListAPayload.data.map((credential) => credential.credentialUuid), [`credential-a-${timestamp}`]);
      assert.deepEqual(credentialListBPayload.data.map((credential) => credential.credentialUuid), [`credential-b-${timestamp}`]);

      const foreignCredentialBindingResponse = await fetch(
        `http://127.0.0.1:${port}/api/novels/${novelBId}/publishing/binding`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            Cookie: cookieB,
          },
          body: JSON.stringify({
            credentialId: credentialAId,
            bookId: `book-b-${timestamp}`,
            bookTitle: `用户B番茄书-${timestamp}`,
          }),
        },
      );
      assert.equal(foreignCredentialBindingResponse.status, 404);

      const listAResponse = await fetch(`http://127.0.0.1:${port}/api/novels`, {
        headers: { Cookie: cookieA },
      });
      const listBResponse = await fetch(`http://127.0.0.1:${port}/api/novels`, {
        headers: { Cookie: cookieB },
      });
      assert.equal(listAResponse.status, 200);
      assert.equal(listBResponse.status, 200);

      const listAPayload = await listAResponse.json();
      const listBPayload = await listBResponse.json();
      assert.equal(listAPayload.data.items.length, 1);
      assert.equal(listBPayload.data.items.length, 1);
      assert.equal(listAPayload.data.items[0].id, novelAId);
      assert.equal(listBPayload.data.items[0].id, novelBId);

      const foreignDetailResponse = await fetch(`http://127.0.0.1:${port}/api/novels/${novelAId}`, {
        headers: { Cookie: cookieB },
      });
      assert.equal(foreignDetailResponse.status, 404);

      const foreignUpdateResponse = await fetch(`http://127.0.0.1:${port}/api/novels/${novelAId}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Cookie: cookieB,
        },
        body: JSON.stringify({
          title: `越权修改-${timestamp}`,
        }),
      });
      assert.equal(foreignUpdateResponse.status, 404);

      const foreignDeleteResponse = await fetch(`http://127.0.0.1:${port}/api/novels/${novelAId}`, {
        method: "DELETE",
        headers: {
          Cookie: cookieB,
        },
      });
      assert.equal(foreignDeleteResponse.status, 404);

      const verifyOwnerNovelStillExistsResponse = await fetch(`http://127.0.0.1:${port}/api/novels/${novelAId}`, {
        headers: { Cookie: cookieA },
      });
      assert.equal(verifyOwnerNovelStillExistsResponse.status, 200);

      const createChapterResponse = await fetch(`http://127.0.0.1:${port}/api/novels/${novelAId}/chapters`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: cookieA,
        },
        body: JSON.stringify({
          title: `用户A章节-${timestamp}`,
          order: 1,
          content: "这是用户A的私有章节内容。",
        }),
      });
      assert.equal(createChapterResponse.status, 201);

      const foreignChaptersResponse = await fetch(`http://127.0.0.1:${port}/api/novels/${novelAId}/chapters`, {
        headers: { Cookie: cookieB },
      });
      assert.equal(foreignChaptersResponse.status, 404);

      const foreignPublishingWorkspaceResponse = await fetch(
        `http://127.0.0.1:${port}/api/novels/${novelAId}/publishing/workspace`,
        {
          headers: { Cookie: cookieB },
        },
      );
      assert.equal(foreignPublishingWorkspaceResponse.status, 404);

      const foreignDecisionsResponse = await fetch(`http://127.0.0.1:${port}/api/novels/${novelAId}/creative-decisions`, {
        headers: { Cookie: cookieB },
      });
      assert.equal(foreignDecisionsResponse.status, 404);

      const foreignWorkflowOverviewResponse = await fetch(
        `http://127.0.0.1:${port}/api/novel-workflows/novels/${novelAId}/auto-director`,
        {
          headers: { Cookie: cookieB },
        },
      );
      assert.equal(foreignWorkflowOverviewResponse.status, 404);

      const foreignTakeoverReadinessResponse = await fetch(
        `http://127.0.0.1:${port}/api/novels/director/takeover-readiness/${novelAId}`,
        {
          headers: { Cookie: cookieB },
        },
      );
      assert.equal(foreignTakeoverReadinessResponse.status, 404);

      const crossUserContinuationResponse = await createNovel(port, cookieB, `越权续写-${timestamp}`, {
        writingMode: "continuation",
        sourceNovelId: novelAId,
      });
      assert.equal(crossUserContinuationResponse.status, 400);
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
    if (originalAuthDisableEmail === undefined) {
      delete process.env.AUTH_DISABLE_EMAIL;
    } else {
      process.env.AUTH_DISABLE_EMAIL = originalAuthDisableEmail;
    }
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

if (process.env[CHILD_FLAG] === "1") {
  runScenario()
    .then(() => {
      process.exitCode = 0;
    })
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    });
} else {
  test("novels are isolated per authenticated user", async () => {
    const child = spawn(process.execPath, [__filename], {
      cwd: path.join(__dirname, ".."),
      env: {
        ...process.env,
        [CHILD_FLAG]: "1",
      },
      stdio: "inherit",
    });

    const exitCode = await new Promise((resolve, reject) => {
      child.once("error", reject);
      child.once("exit", resolve);
    });

    assert.equal(exitCode, 0);
  });
}
