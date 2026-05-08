const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const { prisma } = require("../dist/db/prisma.js");
const { ensureRuntimeDatabaseReady } = require("../dist/db/runtimeMigrations.js");

function listen(server) {
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      resolve(address.port);
    });
  });
}

async function registerAndLogin(port, email, password) {
  await fetch(`http://127.0.0.1:${port}/api/auth/register`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ email, password }),
  });

  const loginResponse = await fetch(`http://127.0.0.1:${port}/api/auth/login`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ email, password }),
  });
  assert.equal(loginResponse.status, 200);
  return loginResponse.headers.get("set-cookie");
}

test("model routes are isolated per authenticated user", async () => {
  const previousAuthTestMode = process.env.AUTH_TEST_MODE;
  process.env.AUTH_TEST_MODE = "strict";
  await ensureRuntimeDatabaseReady();

  delete require.cache[require.resolve("../dist/app.js")];
  const { createApp } = require("../dist/app.js");
  const app = createApp();
  const server = http.createServer(app);
  const port = await listen(server);

  const emailA = `reader-a-${Date.now()}@example.com`;
  const emailB = `reader-b-${Date.now()}@example.com`;
  const password = "StrongPass123!";

  try {
    const cookieA = await registerAndLogin(port, emailA, password);
    const cookieB = await registerAndLogin(port, emailB, password);

    const updateA = await fetch(`http://127.0.0.1:${port}/api/llm/model-routes`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Cookie: cookieA,
      },
      body: JSON.stringify({
        taskType: "planner",
        provider: "deepseek",
        model: "deepseek-reasoner",
        temperature: 0.3,
      }),
    });
    assert.equal(updateA.status, 200);

    const updateB = await fetch(`http://127.0.0.1:${port}/api/llm/model-routes`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Cookie: cookieB,
      },
      body: JSON.stringify({
        taskType: "planner",
        provider: "openai",
        model: "gpt-5-mini",
        temperature: 0.4,
      }),
    });
    assert.equal(updateB.status, 200);

    const routesAResponse = await fetch(`http://127.0.0.1:${port}/api/llm/model-routes`, {
      headers: {
        Cookie: cookieA,
      },
    });
    const routesBResponse = await fetch(`http://127.0.0.1:${port}/api/llm/model-routes`, {
      headers: {
        Cookie: cookieB,
      },
    });
    assert.equal(routesAResponse.status, 200);
    assert.equal(routesBResponse.status, 200);

    const routesAPayload = await routesAResponse.json();
    const routesBPayload = await routesBResponse.json();
    const plannerRouteA = routesAPayload.data.routes.find((item) => item.taskType === "planner");
    const plannerRouteB = routesBPayload.data.routes.find((item) => item.taskType === "planner");

    assert.equal(plannerRouteA.provider, "deepseek");
    assert.equal(plannerRouteA.model, "deepseek-reasoner");
    assert.equal(plannerRouteB.provider, "openai");
    assert.equal(plannerRouteB.model, "gpt-5-mini");
  } finally {
    await prisma.userModelRouteConfig.deleteMany({
      where: {
        user: {
          email: {
            in: [emailA, emailB],
          },
        },
      },
    }).catch(() => undefined);
    await prisma.userSession.deleteMany({
      where: {
        user: {
          email: {
            in: [emailA, emailB],
          },
        },
      },
    });
    await prisma.emailVerificationToken.deleteMany({
      where: {
        user: {
          email: {
            in: [emailA, emailB],
          },
        },
      },
    });
    await prisma.passwordResetToken.deleteMany({
      where: {
        user: {
          email: {
            in: [emailA, emailB],
          },
        },
      },
    });
    await prisma.user.deleteMany({
      where: {
        email: {
          in: [emailA, emailB],
        },
      },
    });
    await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
    if (previousAuthTestMode === undefined) {
      delete process.env.AUTH_TEST_MODE;
    } else {
      process.env.AUTH_TEST_MODE = previousAuthTestMode;
    }
  }
});
