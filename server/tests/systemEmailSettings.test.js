const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");

const { createApp } = require("../dist/app.js");
const { prisma } = require("../dist/db/prisma.js");

function listen(server) {
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      resolve(address.port);
    });
  });
}

test("system email settings are available to admins", async () => {
  const originalFindMany = prisma.appSetting.findMany;
  const originalUpsert = prisma.appSetting.upsert;
  const upserts = [];

  prisma.appSetting.findMany = async () => [
    { key: "systemEmail.smtpHost", value: "smtp.example.test" },
    { key: "systemEmail.smtpPort", value: "587" },
    { key: "systemEmail.smtpSecure", value: "false" },
    { key: "systemEmail.smtpUser", value: "mailer" },
    { key: "systemEmail.smtpPassword", value: "secret" },
    { key: "systemEmail.fromEmail", value: "noreply@example.test" },
    { key: "systemEmail.fromName", value: "AI Novel" },
  ];
  prisma.appSetting.upsert = async ({ where, update }) => {
    upserts.push({ key: where.key, value: update.value });
    return null;
  };

  const app = createApp();
  const server = http.createServer(app);
  const port = await listen(server);

  try {
    const getResponse = await fetch(`http://127.0.0.1:${port}/api/settings/system-email`);
    assert.equal(getResponse.status, 200);

    const putResponse = await fetch(`http://127.0.0.1:${port}/api/settings/system-email`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        smtpHost: "smtp.example.test",
        smtpPort: 587,
        smtpSecure: false,
        smtpUser: "mailer",
        smtpPassword: "secret",
        fromEmail: "noreply@example.test",
        fromName: "AI Novel",
      }),
    });
    assert.equal(putResponse.status, 200);
    assert.ok(upserts.length > 0);
  } finally {
    prisma.appSetting.findMany = originalFindMany;
    prisma.appSetting.upsert = originalUpsert;
    await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
});

