const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");

function createTempDatabaseFile() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "ai-novel-settings-admin-"));
  return {
    tempDir,
    databasePath: path.join(tempDir, "settings-admin.db"),
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

test("system settings routes require admin access", async () => {
  const { tempDir, databasePath } = createTempDatabaseFile();
  const originalDatabaseUrl = process.env.DATABASE_URL;
  const originalAuthTestMode = process.env.AUTH_TEST_MODE;
  const originalAuthDevBypass = process.env.AUTH_DEV_BYPASS;

  process.env.DATABASE_URL = `file:${databasePath}`;
  process.env.AUTH_TEST_MODE = "strict";
  process.env.AUTH_DEV_BYPASS = "false";

  try {
    const { ensureRuntimeDatabaseReady } = require("../dist/db/runtimeMigrations.js");
    const { createApp } = require("../dist/app.js");
    const { createUserSession } = require("../dist/services/auth/authSession.js");
    const { prisma } = require("../dist/db/prisma.js");

    await ensureRuntimeDatabaseReady();
    const user = await prisma.user.create({
      data: {
        email: `reader-${Date.now()}@example.com`,
        passwordHash: "sha256:120000:test:test",
        role: "user",
        status: "active",
        emailVerifiedAt: new Date(),
      },
    });
    const session = await createUserSession({ userId: user.id });
    const cookie = `ai_novel_session=${encodeURIComponent(session.token)}`;

    const app = createApp();
    const server = http.createServer(app);
    const port = await listen(server);
    try {
      const autoDirectorResponse = await fetch(`http://127.0.0.1:${port}/api/settings/auto-director/channels`, {
        headers: {
          Cookie: cookie,
        },
      });
      assert.equal(autoDirectorResponse.status, 200);

      const systemEmailResponse = await fetch(`http://127.0.0.1:${port}/api/settings/system-email`, {
        headers: {
          Cookie: cookie,
        },
      });
      assert.equal(systemEmailResponse.status, 403);
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
    if (originalAuthDevBypass === undefined) {
      delete process.env.AUTH_DEV_BYPASS;
    } else {
      process.env.AUTH_DEV_BYPASS = originalAuthDevBypass;
    }
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

