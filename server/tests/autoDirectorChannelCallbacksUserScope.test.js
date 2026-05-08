const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");

const { createApp } = require("../dist/app.js");
const { AutoDirectorFollowUpActionExecutor } = require("../dist/services/task/autoDirectorFollowUps/AutoDirectorFollowUpActionExecutor.js");
const { prisma } = require("../dist/db/prisma.js");

function ensureUserSettingClient() {
  if (!prisma.userSetting) {
    prisma.userSetting = {};
  }
  return prisma.userSetting;
}

function listen(server) {
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      resolve(address.port);
    });
  });
}

test("auto director callback routes resolve token and operator mapping from the task owner", async () => {
  const userSetting = ensureUserSettingClient();
  const originals = {
    execute: AutoDirectorFollowUpActionExecutor.prototype.execute,
    taskFindUnique: prisma.novelWorkflowTask.findUnique,
    appSettingFindMany: prisma.appSetting.findMany,
    userSettingFindMany: userSetting.findMany,
  };
  const calls = [];

  prisma.novelWorkflowTask.findUnique = async () => ({
    id: "task_1",
    userId: "user-a",
  });
  prisma.appSetting.findMany = async () => ([
    { key: "autoDirector.channels.dingtalk.callbackToken", value: "global-token" },
    { key: "autoDirector.channels.dingtalk.operatorMapJson", value: "{\"global_user\":\"global_operator\"}" },
  ]);
  userSetting.findMany = async ({ where } = {}) => {
    if (where?.userId === "user-a") {
      return [
        { key: "autoDirector.channels.dingtalk.callbackToken", value: "user-a-token" },
        { key: "autoDirector.channels.dingtalk.operatorMapJson", value: "{\"ding_user_a\":\"user_a\"}" },
      ];
    }
    return [];
  };
  AutoDirectorFollowUpActionExecutor.prototype.execute = async function executeMock(input) {
    calls.push(input);
    return {
      taskId: input.taskId,
      actionCode: input.actionCode,
      code: "executed",
      message: "执行成功",
      task: {
        id: input.taskId,
        kind: "novel_workflow",
        status: "running",
      },
    };
  };

  const app = createApp();
  const server = http.createServer(app);
  const port = await listen(server);

  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/auto-director/channel-callbacks/dingtalk`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-auto-director-dingtalk-token": "user-a-token",
      },
      body: JSON.stringify({
        userId: "ding_user_a",
        callbackId: "cb_1",
        eventId: "evt_1",
        taskId: "task_1",
        actionCode: "continue_auto_execution",
      }),
    });

    assert.equal(response.status, 200);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].operatorId, "user_a");
  } finally {
    AutoDirectorFollowUpActionExecutor.prototype.execute = originals.execute;
    prisma.novelWorkflowTask.findUnique = originals.taskFindUnique;
    prisma.appSetting.findMany = originals.appSettingFindMany;
    userSetting.findMany = originals.userSettingFindMany;
    await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
});

