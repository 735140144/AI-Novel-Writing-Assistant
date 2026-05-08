const test = require("node:test");
const assert = require("node:assert/strict");

const { prisma } = require("../dist/db/prisma.js");
const { runWithRequestContext } = require("../dist/runtime/requestContext.js");
const { AgentTraceStore } = require("../dist/agents/traceStore.js");
const { CreativeHubService } = require("../dist/creativeHub/CreativeHubService.js");
const { NovelWorkflowService } = require("../dist/services/novel/workflow/NovelWorkflowService.js");
const { NovelCorePipelineService } = require("../dist/services/novel/novelCorePipelineService.js");
const novelCoreSupport = require("../dist/services/novel/novelCoreSupport.js");

function buildAgentRunRow(overrides = {}) {
  const now = new Date("2026-05-03T00:00:00.000Z");
  return {
    id: "run-1",
    userId: "user-test-1",
    novelId: null,
    chapterId: null,
    sessionId: "session-1",
    goal: "测试运行",
    entryAgent: "Planner",
    status: "queued",
    currentStep: null,
    currentAgent: null,
    error: null,
    startedAt: null,
    finishedAt: null,
    metadataJson: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function buildCreativeHubThreadRow(overrides = {}) {
  const now = new Date("2026-05-03T00:00:00.000Z");
  return {
    id: "thread-1",
    userId: "user-test-1",
    title: "测试线程",
    archived: false,
    status: "idle",
    latestRunId: null,
    latestError: null,
    resourceBindingsJson: "{}",
    metadataJson: "{}",
    createdAt: now,
    updatedAt: now,
    checkpoints: [],
    ...overrides,
  };
}

function buildWorkflowRow(overrides = {}) {
  const now = new Date("2026-05-03T00:00:00.000Z");
  return {
    id: "workflow-1",
    userId: "user-test-1",
    novelId: null,
    lane: "auto_director",
    title: "测试工作流",
    status: "queued",
    progress: 0,
    currentStage: "AI 自动导演",
    currentItemKey: "auto_director",
    currentItemLabel: "等待生成候选方向",
    checkpointType: null,
    checkpointSummary: null,
    resumeTargetJson: "{}",
    seedPayloadJson: null,
    milestonesJson: null,
    pendingManualRecovery: false,
    heartbeatAt: null,
    startedAt: null,
    finishedAt: null,
    cancelRequestedAt: null,
    attemptCount: 0,
    maxAttempts: 3,
    lastError: null,
    promptTokens: 0,
    completionTokens: 0,
    totalTokens: 0,
    llmCallCount: 0,
    lastTokenRecordedAt: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

test("agent trace store writes and scopes agent runs by current session user", async () => {
  const originals = {
    create: prisma.agentRun.create,
    findMany: prisma.agentRun.findMany,
    findFirst: prisma.agentRun.findFirst,
  };
  const captured = {
    createData: null,
    listWhere: null,
    detailWhere: null,
  };

  prisma.agentRun.create = async ({ data }) => {
    captured.createData = data;
    return buildAgentRunRow({
      userId: data.userId ?? null,
      sessionId: data.sessionId,
      goal: data.goal,
      entryAgent: data.entryAgent,
      metadataJson: data.metadataJson ?? null,
      novelId: data.novelId ?? null,
      chapterId: data.chapterId ?? null,
    });
  };
  prisma.agentRun.findMany = async ({ where }) => {
    captured.listWhere = where;
    return [];
  };
  prisma.agentRun.findFirst = async ({ where }) => {
    captured.detailWhere = where;
    return null;
  };

  try {
    const store = new AgentTraceStore();

    await runWithRequestContext({ userId: "user-test-1", authMode: "session" }, async () => {
      await store.createRun({
        sessionId: "session-1",
        goal: "测试运行",
        entryAgent: "Planner",
      });
      await store.listRuns({ limit: 5 });
      await store.getRunDetail("run-1");
    });

    assert.equal(captured.createData?.userId, "user-test-1");
    assert.equal(captured.listWhere?.userId, "user-test-1");
    assert.equal(captured.detailWhere?.id, "run-1");
    assert.equal(captured.detailWhere?.userId, "user-test-1");
  } finally {
    prisma.agentRun.create = originals.create;
    prisma.agentRun.findMany = originals.findMany;
    prisma.agentRun.findFirst = originals.findFirst;
  }
});

test("creative hub service writes and scopes threads by current session user", async () => {
  const originals = {
    create: prisma.creativeHubThread.create,
    findMany: prisma.creativeHubThread.findMany,
    findFirst: prisma.creativeHubThread.findFirst,
    findUnique: prisma.creativeHubThread.findUnique,
  };
  const captured = {
    createData: null,
    listWhere: null,
    stateWhere: null,
  };

  prisma.creativeHubThread.create = async ({ data }) => {
    captured.createData = data;
    return buildCreativeHubThreadRow({
      userId: data.userId ?? null,
      title: data.title,
      resourceBindingsJson: data.resourceBindingsJson ?? "{}",
    });
  };
  prisma.creativeHubThread.findMany = async ({ where }) => {
    captured.listWhere = where;
    return [];
  };
  prisma.creativeHubThread.findFirst = async ({ where }) => {
    captured.stateWhere = where;
    return buildCreativeHubThreadRow();
  };
  prisma.creativeHubThread.findUnique = async () => buildCreativeHubThreadRow();

  try {
    const service = new CreativeHubService();

    await runWithRequestContext({ userId: "user-test-1", authMode: "session" }, async () => {
      await service.createThread({ title: "测试线程" });
      await service.listThreads();
      await service.getThreadState("thread-1");
    });

    assert.equal(captured.createData?.userId, "user-test-1");
    assert.deepEqual(captured.listWhere, { archived: false, userId: "user-test-1" });
    assert.equal(captured.stateWhere?.id, "thread-1");
    assert.equal(captured.stateWhere?.userId, "user-test-1");
  } finally {
    prisma.creativeHubThread.create = originals.create;
    prisma.creativeHubThread.findMany = originals.findMany;
    prisma.creativeHubThread.findFirst = originals.findFirst;
    prisma.creativeHubThread.findUnique = originals.findUnique;
  }
});

test("workflow bootstrap writes and scopes pre-novel tasks by current session user", async () => {
  const originals = {
    create: prisma.novelWorkflowTask.create,
    update: prisma.novelWorkflowTask.update,
    findFirst: prisma.novelWorkflowTask.findFirst,
    findUnique: prisma.novelWorkflowTask.findUnique,
  };
  const captured = {
    createData: null,
    getTaskWhere: null,
  };

  prisma.novelWorkflowTask.create = async ({ data }) => {
    captured.createData = data;
    return buildWorkflowRow({
      userId: data.userId ?? null,
      title: data.title,
      resumeTargetJson: data.resumeTargetJson ?? "{}",
      seedPayloadJson: data.seedPayloadJson ?? null,
    });
  };
  prisma.novelWorkflowTask.update = async ({ where, data }) => buildWorkflowRow({
    id: where.id,
    userId: captured.createData?.userId ?? "user-test-1",
    title: captured.createData?.title ?? "测试工作流",
    resumeTargetJson: data.resumeTargetJson ?? "{}",
  });
  prisma.novelWorkflowTask.findFirst = async ({ where }) => {
    captured.getTaskWhere = where;
    return null;
  };
  prisma.novelWorkflowTask.findUnique = async () => null;

  try {
    const service = new NovelWorkflowService();

    await runWithRequestContext({ userId: "user-test-1", authMode: "session" }, async () => {
      await service.bootstrapTask({
        lane: "auto_director",
        title: "测试工作流",
      });
      await service.getTaskById("workflow-1");
    });

    assert.equal(captured.createData?.userId, "user-test-1");
    assert.equal(captured.getTaskWhere?.id, "workflow-1");
    assert.equal(captured.getTaskWhere?.userId, "user-test-1");
  } finally {
    prisma.novelWorkflowTask.create = originals.create;
    prisma.novelWorkflowTask.update = originals.update;
    prisma.novelWorkflowTask.findFirst = originals.findFirst;
    prisma.novelWorkflowTask.findUnique = originals.findUnique;
  }
});

test("pipeline job creation writes current session user id", async () => {
  const originals = {
    ensureNovelCharacters: novelCoreSupport.ensureNovelCharacters,
    chapterAggregate: prisma.chapter.aggregate,
    chapterFindMany: prisma.chapter.findMany,
    generationJobCreate: prisma.generationJob.create,
  };
  const captured = {
    createData: null,
  };

  novelCoreSupport.ensureNovelCharacters = async () => undefined;
  prisma.chapter.aggregate = async () => ({
    _min: { order: 1 },
    _max: { order: 1 },
    _count: { order: 1 },
  });
  prisma.chapter.findMany = async () => [{ id: "chapter-1" }];
  prisma.generationJob.create = async ({ data }) => {
    captured.createData = data;
    return {
      id: "job-1",
      userId: data.userId ?? null,
      novelId: data.novelId,
      startOrder: data.startOrder,
      endOrder: data.endOrder,
      runMode: data.runMode ?? "fast",
      autoReview: data.autoReview ?? true,
      autoRepair: data.autoRepair ?? true,
      skipCompleted: data.skipCompleted ?? true,
      qualityThreshold: data.qualityThreshold ?? null,
      repairMode: data.repairMode ?? "light_repair",
      status: data.status ?? "queued",
      progress: 0,
      completedCount: 0,
      totalCount: data.totalCount ?? 1,
      retryCount: 0,
      maxRetries: data.maxRetries ?? 1,
      pendingManualRecovery: data.pendingManualRecovery ?? false,
      heartbeatAt: null,
      currentStage: data.currentStage ?? "queued",
      currentItemKey: null,
      currentItemLabel: null,
      cancelRequestedAt: null,
      error: null,
      lastErrorType: null,
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
      llmCallCount: 0,
      lastTokenRecordedAt: null,
      payload: data.payload ?? null,
      startedAt: null,
      finishedAt: null,
      createdAt: new Date("2026-05-03T00:00:00.000Z"),
      updatedAt: new Date("2026-05-03T00:00:00.000Z"),
    };
  };

  try {
    const service = new NovelCorePipelineService();
    service.reconcileActivePipelineJobsForRange = async () => null;
    service.schedulePipelineExecution = () => undefined;

    await runWithRequestContext({ userId: "user-test-1", authMode: "session" }, async () => {
      await service.startPipelineJob("novel-1", {
        startOrder: 1,
        endOrder: 1,
      });
    });

    assert.equal(captured.createData?.userId, "user-test-1");
  } finally {
    novelCoreSupport.ensureNovelCharacters = originals.ensureNovelCharacters;
    prisma.chapter.aggregate = originals.chapterAggregate;
    prisma.chapter.findMany = originals.chapterFindMany;
    prisma.generationJob.create = originals.generationJobCreate;
  }
});
