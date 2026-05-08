const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");

const CHILD_FLAG = "AI_NOVEL_RUN_USER_SCOPED_WORLDS_CHILD";
const distRoot = path.join(__dirname, "../dist");

function clearDistModuleCache() {
  for (const cacheKey of Object.keys(require.cache)) {
    if (cacheKey.startsWith(distRoot)) {
      delete require.cache[cacheKey];
    }
  }
}

function createTempDatabaseFile() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "ai-novel-user-scoped-worlds-"));
  const databasePath = path.join(tempDir, "user-scoped-worlds.db");
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

async function createWorld(port, cookie, name, extraBody = {}) {
  const response = await fetch(`http://127.0.0.1:${port}/api/worlds`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: cookie,
    },
    body: JSON.stringify({
      name,
      description: `${name} 的世界设定`,
      ...extraBody,
    }),
  });
  return response;
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
    const emailA = `world-a-${timestamp}@example.com`;
    const emailB = `world-b-${timestamp}@example.com`;
    const password = "StrongPass123!";

    try {
      const cookieA = await registerAndLogin(port, emailA, password);
      const cookieB = await registerAndLogin(port, emailB, password);

      const createWorldAResponse = await createWorld(port, cookieA, `用户A世界-${timestamp}`);
      assert.equal(createWorldAResponse.status, 201);
      const createWorldAPayload = await createWorldAResponse.json();
      const worldAId = createWorldAPayload.data.id;
      assert.ok(worldAId);

      const createWorldBResponse = await createWorld(port, cookieB, `用户B世界-${timestamp}`);
      assert.equal(createWorldBResponse.status, 201);
      const createWorldBPayload = await createWorldBResponse.json();
      const worldBId = createWorldBPayload.data.id;
      assert.ok(worldBId);

      const listAResponse = await fetch(`http://127.0.0.1:${port}/api/worlds`, {
        headers: { Cookie: cookieA },
      });
      const listBResponse = await fetch(`http://127.0.0.1:${port}/api/worlds`, {
        headers: { Cookie: cookieB },
      });
      assert.equal(listAResponse.status, 200);
      assert.equal(listBResponse.status, 200);

      const listAPayload = await listAResponse.json();
      const listBPayload = await listBResponse.json();
      assert.equal(listAPayload.data.length, 1);
      assert.equal(listBPayload.data.length, 1);
      assert.equal(listAPayload.data[0].id, worldAId);
      assert.equal(listBPayload.data[0].id, worldBId);

      const foreignDetailResponse = await fetch(`http://127.0.0.1:${port}/api/worlds/${worldAId}`, {
        headers: { Cookie: cookieB },
      });
      assert.equal(foreignDetailResponse.status, 404);

      const foreignStructureResponse = await fetch(`http://127.0.0.1:${port}/api/worlds/${worldAId}/structure`, {
        headers: { Cookie: cookieB },
      });
      assert.equal(foreignStructureResponse.status, 404);

      const foreignUpdateResponse = await fetch(`http://127.0.0.1:${port}/api/worlds/${worldAId}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Cookie: cookieB,
        },
        body: JSON.stringify({
          description: `越权修改-${timestamp}`,
        }),
      });
      assert.equal(foreignUpdateResponse.status, 404);

      const foreignDeleteResponse = await fetch(`http://127.0.0.1:${port}/api/worlds/${worldAId}`, {
        method: "DELETE",
        headers: {
          Cookie: cookieB,
        },
      });
      assert.equal(foreignDeleteResponse.status, 404);

      const ownerWorldStillExistsResponse = await fetch(`http://127.0.0.1:${port}/api/worlds/${worldAId}`, {
        headers: { Cookie: cookieA },
      });
      assert.equal(ownerWorldStillExistsResponse.status, 200);

      const createLibraryItemResponse = await fetch(`http://127.0.0.1:${port}/api/worlds/library`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: cookieA,
        },
        body: JSON.stringify({
          name: `用户A世界素材-${timestamp}`,
          category: "forces",
          description: "只有用户A可见的世界素材。",
          sourceWorldId: worldAId,
        }),
      });
      assert.equal(createLibraryItemResponse.status, 201);
      const createLibraryItemPayload = await createLibraryItemResponse.json();
      const libraryItemId = createLibraryItemPayload.data.id;
      assert.ok(libraryItemId);

      const listLibraryAResponse = await fetch(`http://127.0.0.1:${port}/api/worlds/library`, {
        headers: { Cookie: cookieA },
      });
      const listLibraryBResponse = await fetch(`http://127.0.0.1:${port}/api/worlds/library`, {
        headers: { Cookie: cookieB },
      });
      assert.equal(listLibraryAResponse.status, 200);
      assert.equal(listLibraryBResponse.status, 200);

      const listLibraryAPayload = await listLibraryAResponse.json();
      const listLibraryBPayload = await listLibraryBResponse.json();
      assert.ok(listLibraryAPayload.data.some((item) => item.id === libraryItemId));
      assert.ok(!listLibraryBPayload.data.some((item) => item.id === libraryItemId));

      const foreignLibraryUseResponse = await fetch(
        `http://127.0.0.1:${port}/api/worlds/library/${libraryItemId}/use`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Cookie: cookieB,
          },
          body: JSON.stringify({
            worldId: worldBId,
            targetField: "description",
          }),
        },
      );
      assert.equal(foreignLibraryUseResponse.status, 404);

      const foreignSourceWorldReferenceResponse = await fetch(`http://127.0.0.1:${port}/api/worlds/library`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: cookieB,
        },
        body: JSON.stringify({
          name: `越权世界素材-${timestamp}`,
          category: "forces",
          sourceWorldId: worldAId,
        }),
      });
      assert.equal(foreignSourceWorldReferenceResponse.status, 400);

      const invalidNovelReferenceResponse = await fetch(`http://127.0.0.1:${port}/api/novels`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: cookieB,
        },
        body: JSON.stringify({
          title: `越权世界引用小说-${timestamp}`,
          worldId: worldAId,
        }),
      });
      assert.equal(invalidNovelReferenceResponse.status, 400);
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
  test("worlds are isolated per authenticated user", async () => {
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
