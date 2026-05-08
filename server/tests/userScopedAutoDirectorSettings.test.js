const test = require("node:test");
const assert = require("node:assert/strict");

const { prisma } = require("../dist/db/prisma.js");
const {
  getAutoDirectorApprovalPreferenceSettings,
  getAutoDirectorChannelSettings,
  saveAutoDirectorApprovalPreferenceSettings,
  saveAutoDirectorChannelSettings,
} = require("../dist/services/settings/AutoDirectorChannelSettingsService.js");
const {
  getAutoDirectorApprovalPreferenceSettings: getApprovalPreferenceSettings,
  saveAutoDirectorApprovalPreferenceSettings: saveApprovalPreferenceSettings,
} = require("../dist/services/settings/AutoDirectorApprovalPreferenceService.js");

function ensureUserSettingClient() {
  if (!prisma.userSetting) {
    prisma.userSetting = {};
  }
  return prisma.userSetting;
}

test("auto director channel settings are isolated by user", async () => {
  const userSetting = ensureUserSettingClient();
  const originalAppSettingFindMany = prisma.appSetting.findMany;
  const originalUserSettingFindMany = userSetting.findMany;

  process.env.APP_BASE_URL = "https://global.example.test";
  prisma.appSetting.findMany = async () => ([
    { key: "autoDirector.baseUrl", value: "https://global.example.test" },
    { key: "autoDirector.channels.dingtalk.webhookUrl", value: "https://global.example.test/dingtalk" },
    { key: "autoDirector.channels.dingtalk.callbackToken", value: "global-token" },
    { key: "autoDirector.channels.dingtalk.operatorMapJson", value: "{\"global_user\":\"global_operator\"}" },
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

  try {
    const userASettings = await getAutoDirectorChannelSettings({ userId: "user-a" });
    assert.equal(userASettings.baseUrl, "https://user-a.example.test");
    assert.equal(userASettings.dingtalk.webhookUrl, "https://user-a.example.test/dingtalk");
    assert.equal(userASettings.dingtalk.callbackToken, "user-a-token");
    assert.equal(userASettings.dingtalk.operatorMapJson, "{\"ding_user_a\":\"user_a\"}");

    const userBSettings = await getAutoDirectorChannelSettings({ userId: "user-b" });
    assert.equal(userBSettings.baseUrl, "");
    assert.equal(userBSettings.dingtalk.webhookUrl, "");
    assert.equal(userBSettings.dingtalk.callbackToken, "");
  } finally {
    prisma.appSetting.findMany = originalAppSettingFindMany;
    userSetting.findMany = originalUserSettingFindMany;
  }
});

test("auto director channel settings save into the current user's storage", async () => {
  const userSetting = ensureUserSettingClient();
  const originalAppSettingUpsert = prisma.appSetting.upsert;
  const originalUserSettingUpsert = userSetting.upsert;
  const calls = [];

  prisma.appSetting.upsert = async () => {
    calls.push("app");
    return null;
  };
  userSetting.upsert = async ({ where, create, update }) => {
    calls.push({
      key: where.userId_key.key,
      userId: where.userId_key.userId,
      value: update.value ?? create.value,
    });
    return create;
  };

  try {
    await saveAutoDirectorChannelSettings(
      {
        baseUrl: "https://user-a.example.test",
        dingtalk: {
          webhookUrl: "https://user-a.example.test/dingtalk",
          callbackToken: "user-a-token",
          operatorMapJson: "{\"ding_user_a\":\"user_a\"}",
          eventTypes: ["auto_director.exception"],
        },
      },
      { userId: "user-a" },
    );

    assert.deepEqual(calls[0], {
      key: "autoDirector.baseUrl",
      userId: "user-a",
      value: "https://user-a.example.test",
    });
    assert.equal(calls.includes("app"), false);
  } finally {
    prisma.appSetting.upsert = originalAppSettingUpsert;
    userSetting.upsert = originalUserSettingUpsert;
  }
});

test("auto director approval preferences save into the current user's storage", async () => {
  const userSetting = ensureUserSettingClient();
  const originalAppSettingUpsert = prisma.appSetting.upsert;
  const originalUserSettingUpsert = userSetting.upsert;
  const calls = [];

  prisma.appSetting.upsert = async () => {
    calls.push("app");
    return null;
  };
  userSetting.upsert = async ({ where, create, update }) => {
    calls.push({
      key: where.userId_key.key,
      userId: where.userId_key.userId,
      value: update.value ?? create.value,
    });
    return create;
  };

  try {
    const data = await saveApprovalPreferenceSettings(
      {
        approvalPointCodes: ["chapter_execution_continue", "rewrite_cleanup_confirmed"],
      },
      { userId: "user-a" },
    );

    assert.deepEqual(data.approvalPointCodes, [
      "chapter_execution_continue",
      "rewrite_cleanup_confirmed",
    ]);
    assert.deepEqual(calls[0], {
      key: "autoDirector.approvalPreference.approvalPointCodes",
      userId: "user-a",
      value: "chapter_execution_continue,rewrite_cleanup_confirmed",
    });
    assert.equal(calls.includes("app"), false);
  } finally {
    prisma.appSetting.upsert = originalAppSettingUpsert;
    userSetting.upsert = originalUserSettingUpsert;
  }
});
