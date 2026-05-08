const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");

const CHILD_FLAG = "AI_NOVEL_RUN_USER_SCOPED_CREATIVE_RESOURCES_CHILD";
const distRoot = path.join(__dirname, "../dist");

function clearDistModuleCache() {
  for (const cacheKey of Object.keys(require.cache)) {
    if (cacheKey.startsWith(distRoot)) {
      delete require.cache[cacheKey];
    }
  }
}

function createTempDatabaseFile() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "ai-novel-user-scoped-resources-"));
  const databasePath = path.join(tempDir, "user-scoped-resources.db");
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

function buildStoryModeProfile() {
  return {
    coreDrive: "围绕稳定目标推进故事。",
    readerReward: "每个阶段都给出明确兑现。",
    progressionUnits: ["阶段目标推进"],
    allowedConflictForms: ["成长型冲突"],
    forbiddenConflictForms: ["无关高烈度冲突"],
    conflictCeiling: "medium",
    resolutionStyle: "优先用已有目标线闭环。",
    chapterUnit: "每章推进一个核心单位。",
    volumeReward: "卷末完成阶段目标。",
    mandatorySignals: ["主驱动持续出现"],
    antiSignals: ["长期偏离主驱动"],
  };
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
    const emailA = `reader-a-${timestamp}@example.com`;
    const emailB = `reader-b-${timestamp}@example.com`;
    const password = "StrongPass123!";

    try {
      const cookieA = await registerAndLogin(port, emailA, password);
      const cookieB = await registerAndLogin(port, emailB, password);

      const initialGenresA = await fetch(`http://127.0.0.1:${port}/api/genres`, {
        headers: { Cookie: cookieA },
      });
      const initialGenresB = await fetch(`http://127.0.0.1:${port}/api/genres`, {
        headers: { Cookie: cookieB },
      });
      assert.equal(initialGenresA.status, 200);
      assert.equal(initialGenresB.status, 200);

      const genrePayloadA = await initialGenresA.json();
      const genrePayloadB = await initialGenresB.json();
      assert.ok(Array.isArray(genrePayloadA.data));
      assert.ok(Array.isArray(genrePayloadB.data));
      assert.ok(genrePayloadA.data.length > 0);
      assert.ok(genrePayloadB.data.length > 0);

      const initialStoryModesA = await fetch(`http://127.0.0.1:${port}/api/story-modes`, {
        headers: { Cookie: cookieA },
      });
      const initialStoryModesB = await fetch(`http://127.0.0.1:${port}/api/story-modes`, {
        headers: { Cookie: cookieB },
      });
      assert.equal(initialStoryModesA.status, 200);
      assert.equal(initialStoryModesB.status, 200);

      const storyModePayloadA = await initialStoryModesA.json();
      const storyModePayloadB = await initialStoryModesB.json();
      assert.ok(Array.isArray(storyModePayloadA.data));
      assert.ok(Array.isArray(storyModePayloadB.data));
      assert.ok(storyModePayloadA.data.length > 0);
      assert.ok(storyModePayloadB.data.length > 0);

      const genreName = `用户A专属题材-${timestamp}`;
      const storyModeName = `用户A专属模式-${timestamp}`;
      const titleName = `用户A专属标题-${timestamp}`;
      const baseCharacterName = `用户A专属角色-${timestamp}`;
      const styleProfileName = `用户A专属写法-${timestamp}`;

      const createGenreResponse = await fetch(`http://127.0.0.1:${port}/api/genres`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: cookieA,
        },
        body: JSON.stringify({
          name: genreName,
          description: "只有用户A能看到的题材。",
        }),
      });
      assert.equal(createGenreResponse.status, 201);
      const createGenrePayload = await createGenreResponse.json();
      const createdGenreId = createGenrePayload.data.id;
      assert.ok(createdGenreId);

      const createStoryModeResponse = await fetch(`http://127.0.0.1:${port}/api/story-modes`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: cookieA,
        },
        body: JSON.stringify({
          name: storyModeName,
          description: "只有用户A能看到的推进模式。",
          profile: buildStoryModeProfile(),
        }),
      });
      assert.equal(createStoryModeResponse.status, 201);
      const createStoryModePayload = await createStoryModeResponse.json();
      const createdStoryModeId = createStoryModePayload.data.id;
      assert.ok(createdStoryModeId);

      const createTitleResponse = await fetch(`http://127.0.0.1:${port}/api/title-library`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: cookieA,
        },
        body: JSON.stringify({
          title: titleName,
          description: "只有用户A能看到的标题。",
          genreId: createdGenreId,
        }),
      });
      assert.equal(createTitleResponse.status, 201);

      const createBaseCharacterResponse = await fetch(`http://127.0.0.1:${port}/api/base-characters`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: cookieA,
        },
        body: JSON.stringify({
          name: baseCharacterName,
          role: "主角",
          personality: "冷静克制",
          background: "只属于用户A的角色背景。",
          development: "完成一条个人成长弧线。",
          category: "主角",
          tags: "私有角色",
        }),
      });
      assert.equal(createBaseCharacterResponse.status, 201);
      const createBaseCharacterPayload = await createBaseCharacterResponse.json();
      const createdBaseCharacterId = createBaseCharacterPayload.data.id;
      assert.ok(createdBaseCharacterId);

      const createStyleProfileResponse = await fetch(`http://127.0.0.1:${port}/api/style-profiles`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: cookieA,
        },
        body: JSON.stringify({
          name: styleProfileName,
          description: "只属于用户A的写法资产。",
          category: "都市",
          tags: ["私有写法"],
          narrativeRules: {
            summary: "冲突优先，句式偏短。",
          },
          characterRules: {},
          languageRules: {},
          rhythmRules: {},
        }),
      });
      assert.equal(createStyleProfileResponse.status, 201);
      const createStyleProfilePayload = await createStyleProfileResponse.json();
      const createdStyleProfileId = createStyleProfilePayload.data.id;
      assert.ok(createdStyleProfileId);

      const createImageTaskResponse = await fetch(`http://127.0.0.1:${port}/api/images/generate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: cookieA,
        },
        body: JSON.stringify({
          sceneType: "character",
          sceneId: createdBaseCharacterId,
          prompt: "生成角色定妆图",
          count: 1,
        }),
      });
      assert.equal(createImageTaskResponse.status, 202);
      const createImageTaskPayload = await createImageTaskResponse.json();
      const createdImageTaskId = createImageTaskPayload.data.id;
      assert.ok(createdImageTaskId);

      const listGenresA = await fetch(`http://127.0.0.1:${port}/api/genres`, {
        headers: { Cookie: cookieA },
      });
      const listGenresB = await fetch(`http://127.0.0.1:${port}/api/genres`, {
        headers: { Cookie: cookieB },
      });
      const listGenresPayloadA = await listGenresA.json();
      const listGenresPayloadB = await listGenresB.json();
      const flattenGenreNames = (nodes) => nodes.flatMap((node) => [node.name, ...flattenGenreNames(node.children ?? [])]);
      assert.ok(flattenGenreNames(listGenresPayloadA.data).includes(genreName));
      assert.ok(!flattenGenreNames(listGenresPayloadB.data).includes(genreName));

      const listStoryModesA = await fetch(`http://127.0.0.1:${port}/api/story-modes`, {
        headers: { Cookie: cookieA },
      });
      const listStoryModesB = await fetch(`http://127.0.0.1:${port}/api/story-modes`, {
        headers: { Cookie: cookieB },
      });
      const listStoryModesPayloadA = await listStoryModesA.json();
      const listStoryModesPayloadB = await listStoryModesB.json();
      const flattenStoryModeNames = (nodes) => nodes.flatMap((node) => [node.name, ...flattenStoryModeNames(node.children ?? [])]);
      assert.ok(flattenStoryModeNames(listStoryModesPayloadA.data).includes(storyModeName));
      assert.ok(!flattenStoryModeNames(listStoryModesPayloadB.data).includes(storyModeName));

      const listTitlesA = await fetch(`http://127.0.0.1:${port}/api/title-library`, {
        headers: { Cookie: cookieA },
      });
      const listTitlesB = await fetch(`http://127.0.0.1:${port}/api/title-library`, {
        headers: { Cookie: cookieB },
      });
      const listTitlesPayloadA = await listTitlesA.json();
      const listTitlesPayloadB = await listTitlesB.json();
      assert.ok(listTitlesPayloadA.data.items.some((item) => item.title === titleName));
      assert.ok(!listTitlesPayloadB.data.items.some((item) => item.title === titleName));

      const listBaseCharactersA = await fetch(`http://127.0.0.1:${port}/api/base-characters`, {
        headers: { Cookie: cookieA },
      });
      const listBaseCharactersB = await fetch(`http://127.0.0.1:${port}/api/base-characters`, {
        headers: { Cookie: cookieB },
      });
      assert.equal(listBaseCharactersA.status, 200);
      assert.equal(listBaseCharactersB.status, 200);
      const listBaseCharactersPayloadA = await listBaseCharactersA.json();
      const listBaseCharactersPayloadB = await listBaseCharactersB.json();
      assert.ok(listBaseCharactersPayloadA.data.some((item) => item.id === createdBaseCharacterId));
      assert.ok(!listBaseCharactersPayloadB.data.some((item) => item.id === createdBaseCharacterId));

      const foreignBaseCharacterDetailResponse = await fetch(
        `http://127.0.0.1:${port}/api/base-characters/${createdBaseCharacterId}`,
        {
          headers: { Cookie: cookieB },
        },
      );
      assert.equal(foreignBaseCharacterDetailResponse.status, 404);

      const listStyleProfilesA = await fetch(`http://127.0.0.1:${port}/api/style-profiles`, {
        headers: { Cookie: cookieA },
      });
      const listStyleProfilesB = await fetch(`http://127.0.0.1:${port}/api/style-profiles`, {
        headers: { Cookie: cookieB },
      });
      assert.equal(listStyleProfilesA.status, 200);
      assert.equal(listStyleProfilesB.status, 200);
      const listStyleProfilesPayloadA = await listStyleProfilesA.json();
      const listStyleProfilesPayloadB = await listStyleProfilesB.json();
      assert.ok(listStyleProfilesPayloadA.data.some((item) => item.id === createdStyleProfileId));
      assert.ok(!listStyleProfilesPayloadB.data.some((item) => item.id === createdStyleProfileId));

      const foreignStyleProfileDetailResponse = await fetch(
        `http://127.0.0.1:${port}/api/style-profiles/${createdStyleProfileId}`,
        {
          headers: { Cookie: cookieB },
        },
      );
      assert.equal(foreignStyleProfileDetailResponse.status, 404);

      const foreignStyleBindingResponse = await fetch(`http://127.0.0.1:${port}/api/style-bindings`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: cookieB,
        },
        body: JSON.stringify({
          styleProfileId: createdStyleProfileId,
          targetType: "task",
          targetId: `foreign-task-${timestamp}`,
          priority: 1,
          weight: 1,
        }),
      });
      assert.equal(foreignStyleBindingResponse.status, 404);

      const ownImageTaskDetailResponse = await fetch(
        `http://127.0.0.1:${port}/api/images/tasks/${createdImageTaskId}`,
        {
          headers: { Cookie: cookieA },
        },
      );
      assert.equal(ownImageTaskDetailResponse.status, 200);

      const foreignImageTaskDetailResponse = await fetch(
        `http://127.0.0.1:${port}/api/images/tasks/${createdImageTaskId}`,
        {
          headers: { Cookie: cookieB },
        },
      );
      assert.equal(foreignImageTaskDetailResponse.status, 404);

      const listImageAssetsA = await fetch(
        `http://127.0.0.1:${port}/api/images/assets?sceneType=character&sceneId=${createdBaseCharacterId}`,
        {
          headers: { Cookie: cookieA },
        },
      );
      const listImageAssetsB = await fetch(
        `http://127.0.0.1:${port}/api/images/assets?sceneType=character&sceneId=${createdBaseCharacterId}`,
        {
          headers: { Cookie: cookieB },
        },
      );
      assert.equal(listImageAssetsA.status, 200);
      assert.equal(listImageAssetsB.status, 404);

      const invalidTitleReferenceResponse = await fetch(`http://127.0.0.1:${port}/api/title-library`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: cookieB,
        },
        body: JSON.stringify({
          title: `越权标题-${timestamp}`,
          genreId: createdGenreId,
        }),
      });
      assert.equal(invalidTitleReferenceResponse.status, 400);

      const invalidNovelReferenceResponse = await fetch(`http://127.0.0.1:${port}/api/novels`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: cookieB,
        },
        body: JSON.stringify({
          title: `越权小说-${timestamp}`,
          genreId: createdGenreId,
          primaryStoryModeId: createdStoryModeId,
        }),
      });
      assert.equal(invalidNovelReferenceResponse.status, 400);

      const invalidImageReferenceResponse = await fetch(`http://127.0.0.1:${port}/api/images/generate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: cookieB,
        },
        body: JSON.stringify({
          sceneType: "character",
          sceneId: createdBaseCharacterId,
          prompt: "越权生成图像",
          count: 1,
        }),
      });
      assert.equal(invalidImageReferenceResponse.status, 404);
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
  test("creative starter resources and custom library entries are isolated per authenticated user", async () => {
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
