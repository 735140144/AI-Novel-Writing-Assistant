const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");

const CHILD_FLAG = "AI_NOVEL_RUN_AUTH_ROUTES_CHILD";
const SCENARIO_ENV = "AI_NOVEL_AUTH_ROUTES_SCENARIO";
const distRoot = path.join(__dirname, "../dist");

function clearDistModuleCache() {
  for (const cacheKey of Object.keys(require.cache)) {
    if (cacheKey.startsWith(distRoot)) {
      delete require.cache[cacheKey];
    }
  }
}

function createTempDatabaseFile() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "ai-novel-auth-routes-"));
  const databasePath = path.join(tempDir, "auth-routes.db");
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

async function runScenario(scenario) {
  const { tempDir, databasePath } = createTempDatabaseFile();
  const originalDatabaseUrl = process.env.DATABASE_URL;
  const originalAuthTestMode = process.env.AUTH_TEST_MODE;
  const originalAuthDisableEmail = process.env.AUTH_DISABLE_EMAIL;

  process.env.DATABASE_URL = `file:${databasePath}`;
  process.env.AUTH_TEST_MODE = "strict";
  process.env.AUTH_DISABLE_EMAIL = "true";

  clearDistModuleCache();

  const { ensureRuntimeDatabaseReady } = require("../dist/db/runtimeMigrations.js");
  const { createApp } = require("../dist/app.js");
  const { prisma } = require("../dist/db/prisma.js");

  try {
    await ensureRuntimeDatabaseReady();

    const app = createApp();
    const server = http.createServer(app);
    const port = await listen(server);
    const email = `reader-${Date.now()}@example.com`;
    const password = "StrongPass123!";

    try {
      if (scenario === "protected_routes") {
        const healthResponse = await fetch(`http://127.0.0.1:${port}/api/health`);
        assert.equal(healthResponse.status, 200);

        const modelRoutesResponse = await fetch(`http://127.0.0.1:${port}/api/llm/model-routes`);
        assert.equal(modelRoutesResponse.status, 401);
        return;
      }

      if (scenario === "auth_roundtrip") {
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

        const meResponse = await fetch(`http://127.0.0.1:${port}/api/auth/me`, {
          headers: {
            Cookie: cookieHeader,
          },
        });
        assert.equal(meResponse.status, 200);
        const mePayload = await meResponse.json();
        assert.equal(mePayload.success, true);
        assert.equal(mePayload.data.email, email);
        assert.equal(mePayload.data.status, "pending_verification");

        const logoutResponse = await fetch(`http://127.0.0.1:${port}/api/auth/logout`, {
          method: "POST",
          headers: {
            Cookie: cookieHeader,
          },
        });
        assert.equal(logoutResponse.status, 200);

        const meAfterLogoutResponse = await fetch(`http://127.0.0.1:${port}/api/auth/me`, {
          headers: {
            Cookie: cookieHeader,
          },
        });
        assert.equal(meAfterLogoutResponse.status, 401);
        return;
      }

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
        assert.equal(resetTokens[0].consumedAt, null);
        return;
      }

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
        const user = await prisma.user.findUniqueOrThrow({ where: { email } });
        await prisma.passwordResetToken.create({
          data: {
            userId: user.id,
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

        const updatedResetToken = await prisma.passwordResetToken.findUnique({
          where: { tokenHash: hashOpaqueToken(resetToken) },
        });
        assert.ok(updatedResetToken?.consumedAt);

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
        const user = await prisma.user.findUniqueOrThrow({ where: { email } });
        await prisma.passwordResetToken.create({
          data: {
            userId: user.id,
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

      throw new Error(`Unknown auth test scenario: ${scenario}`);
    } finally {
      await prisma.userSession.deleteMany({ where: { user: { email } } }).catch(() => undefined);
      await prisma.emailVerificationToken.deleteMany({ where: { user: { email } } }).catch(() => undefined);
      await prisma.passwordResetToken.deleteMany({ where: { user: { email } } }).catch(() => undefined);
      await prisma.user.deleteMany({ where: { email } }).catch(() => undefined);
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
  runScenario(process.env[SCENARIO_ENV] ?? "")
    .then(() => {
      process.exitCode = 0;
    })
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    });
} else {
  async function runChildScenario(scenario) {
    const child = spawn(process.execPath, [__filename], {
      cwd: path.join(__dirname, ".."),
      env: {
        ...process.env,
        [CHILD_FLAG]: "1",
        [SCENARIO_ENV]: scenario,
      },
      stdio: "inherit",
    });

    const exitCode = await new Promise((resolve, reject) => {
      child.once("error", reject);
      child.once("exit", resolve);
    });

    assert.equal(exitCode, 0);
  }

  test("protected API routes reject anonymous requests", async () => {
    await runChildScenario("protected_routes");
  });

  test("auth routes register, login, return session user, and logout", async () => {
    await runChildScenario("auth_roundtrip");
  });

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
}
