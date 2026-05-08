const test = require("node:test");
const assert = require("node:assert/strict");

require("../dist/app.js");
const { prisma } = require("../dist/db/prisma.js");
const { AutoDirectorFollowUpNotificationService } = require("../dist/services/task/autoDirectorFollowUps/AutoDirectorFollowUpNotificationService.js");

function ensureUserSettingClient() {
  if (!prisma.userSetting) {
    prisma.userSetting = {};
  }
  return prisma.userSetting;
}

test("auto director notifications use the owning user's channel settings", async () => {
  const userSetting = ensureUserSettingClient();
  const originalFetch = global.fetch;
  const originalNotificationLogCreate = prisma.autoDirectorFollowUpNotificationLog.create;
  const originalAppSettingFindMany = prisma.appSetting.findMany;
  const originalUserSettingFindMany = userSetting.findMany;
  const fetchCalls = [];

  process.env.APP_BASE_URL = "https://global.example.test";
  prisma.appSetting.findMany = async () => ([
    { key: "autoDirector.baseUrl", value: "https://global.example.test" },
    { key: "autoDirector.channels.dingtalk.webhookUrl", value: "https://global.example.test/dingtalk" },
    { key: "autoDirector.channels.dingtalk.callbackToken", value: "global-token" },
    { key: "autoDirector.channels.dingtalk.operatorMapJson", value: "{\"global\":\"global_operator\"}" },
  ]);
  userSetting.findMany = async ({ where } = {}) => {
    if (where?.userId === "user-a") {
      return [
        { key: "autoDirector.baseUrl", value: "https://user-a.example.test" },
        { key: "autoDirector.channels.dingtalk.webhookUrl", value: "https://user-a.example.test/dingtalk" },
        { key: "autoDirector.channels.dingtalk.callbackToken", value: "user-a-token" },
        { key: "autoDirector.channels.dingtalk.operatorMapJson", value: "{\"ding_user_a\":\"user_a\"}" },
      ];
    }
    return [];
  };
  prisma.autoDirectorFollowUpNotificationLog.create = async ({ data }) => data;
  global.fetch = async (url, init) => {
    fetchCalls.push({
      url,
      method: init?.method ?? "GET",
      body: init?.body ? JSON.parse(String(init.body)) : null,
    });
    return new Response("ok", { status: 200 });
  };

  const service = new AutoDirectorFollowUpNotificationService();

  try {
    await service.handleTaskTransition({
      before: {
        id: "task_1",
        userId: "user-a",
        novelId: "novel_1",
        status: "running",
        currentStage: "章节执行",
        checkpointType: null,
        checkpointSummary: null,
        currentItemLabel: "执行中",
        pendingManualRecovery: false,
        updatedAt: new Date("2026-05-04T10:00:00.000Z"),
        novel: { title: "《测试之书》" },
      },
      after: {
        id: "task_1",
        userId: "user-a",
        novelId: "novel_1",
        status: "waiting_approval",
        currentStage: "章节执行",
        checkpointType: "front10_ready",
        checkpointSummary: "前 10 章已准备完成。",
        currentItemLabel: "等待继续自动执行",
        pendingManualRecovery: false,
        updatedAt: new Date("2026-05-04T10:00:01.000Z"),
        novel: { title: "《测试之书》" },
      },
    });

    assert.equal(fetchCalls.length, 1);
    assert.equal(fetchCalls[0].url, "https://user-a.example.test/dingtalk");
    assert.equal(fetchCalls[0].body.card.actions[0].callback.token, "user-a-token");
  } finally {
    global.fetch = originalFetch;
    prisma.autoDirectorFollowUpNotificationLog.create = originalNotificationLogCreate;
    prisma.appSetting.findMany = originalAppSettingFindMany;
    userSetting.findMany = originalUserSettingFindMany;
  }
});

