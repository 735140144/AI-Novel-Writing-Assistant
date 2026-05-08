const test = require("node:test");
const assert = require("node:assert/strict");
const { runWithRequestContext } = require("../dist/runtime/requestContext.js");

const { prisma } = require("../dist/db/prisma.js");
const { taskCenterService } = require("../dist/services/task/TaskCenterService.js");

test("task center overview ignores workflow-linked pipeline jobs in sidebar counts", async () => {
  const originals = {
    taskCenterArchiveFindMany: prisma.taskCenterArchive.findMany,
    bookAnalysisGroupBy: prisma.bookAnalysis.groupBy,
    generationJobGroupBy: prisma.generationJob.groupBy,
    ragIndexJobGroupBy: prisma.ragIndexJob.groupBy,
    imageGenerationTaskGroupBy: prisma.imageGenerationTask.groupBy,
    agentRunGroupBy: prisma.agentRun.groupBy,
    novelWorkflowTaskGroupBy: prisma.novelWorkflowTask.groupBy,
    styleExtractionTaskGroupBy: prisma.styleExtractionTask.groupBy,
    bookAnalysisCount: prisma.bookAnalysis.count,
    generationJobCount: prisma.generationJob.count,
    imageGenerationTaskCount: prisma.imageGenerationTask.count,
    novelWorkflowTaskCount: prisma.novelWorkflowTask.count,
    styleExtractionTaskCount: prisma.styleExtractionTask.count,
    workflowAdapterList: taskCenterService.workflowAdapter.list,
  };

  prisma.taskCenterArchive.findMany = async () => [];
  prisma.bookAnalysis.groupBy = async () => [];
  prisma.generationJob.groupBy = async ({ where }) => {
    const excludedIds = where?.id?.notIn ?? [];
    return excludedIds.includes("generation-job-1")
      ? []
      : [{ status: "running", _count: { _all: 1 } }];
  };
  prisma.ragIndexJob.groupBy = async () => [];
  prisma.imageGenerationTask.groupBy = async () => [];
  prisma.agentRun.groupBy = async () => [];
  prisma.novelWorkflowTask.groupBy = async () => [{ status: "running", _count: { _all: 1 } }];
  prisma.styleExtractionTask.groupBy = async () => [];
  prisma.bookAnalysis.count = async () => 0;
  prisma.generationJob.count = async ({ where }) => {
    const excludedIds = where?.id?.notIn ?? [];
    return excludedIds.includes("generation-job-1") ? 0 : 1;
  };
  prisma.imageGenerationTask.count = async () => 0;
  prisma.novelWorkflowTask.count = async () => 0;
  prisma.styleExtractionTask.count = async () => 0;
  taskCenterService.workflowAdapter.list = async () => ([
    {
      id: "workflow-1",
      kind: "novel_workflow",
      status: "running",
      title: "《示例小说》自动导演",
      targetResources: [
        { type: "generation_job", id: "generation-job-1" },
      ],
    },
  ]);

  try {
    const overview = await taskCenterService.getOverview();

    assert.equal(overview.queuedCount, 0);
    assert.equal(overview.runningCount, 1);
    assert.equal(overview.failedCount, 0);
    assert.equal(overview.cancelledCount, 0);
    assert.equal(overview.waitingApprovalCount, 0);
    assert.equal(overview.recoveryCandidateCount, 0);
  } finally {
    prisma.taskCenterArchive.findMany = originals.taskCenterArchiveFindMany;
    prisma.bookAnalysis.groupBy = originals.bookAnalysisGroupBy;
    prisma.generationJob.groupBy = originals.generationJobGroupBy;
    prisma.ragIndexJob.groupBy = originals.ragIndexJobGroupBy;
    prisma.imageGenerationTask.groupBy = originals.imageGenerationTaskGroupBy;
    prisma.agentRun.groupBy = originals.agentRunGroupBy;
    prisma.novelWorkflowTask.groupBy = originals.novelWorkflowTaskGroupBy;
    prisma.styleExtractionTask.groupBy = originals.styleExtractionTaskGroupBy;
    prisma.bookAnalysis.count = originals.bookAnalysisCount;
    prisma.generationJob.count = originals.generationJobCount;
    prisma.imageGenerationTask.count = originals.imageGenerationTaskCount;
    prisma.novelWorkflowTask.count = originals.novelWorkflowTaskCount;
    prisma.styleExtractionTask.count = originals.styleExtractionTaskCount;
    taskCenterService.workflowAdapter.list = originals.workflowAdapterList;
  }
});

test("task center overview applies current user scope to non-book task aggregates", async () => {
  const originals = {
    taskCenterArchiveFindMany: prisma.taskCenterArchive.findMany,
    bookAnalysisGroupBy: prisma.bookAnalysis.groupBy,
    generationJobGroupBy: prisma.generationJob.groupBy,
    ragIndexJobGroupBy: prisma.ragIndexJob.groupBy,
    imageGenerationTaskGroupBy: prisma.imageGenerationTask.groupBy,
    agentRunGroupBy: prisma.agentRun.groupBy,
    novelWorkflowTaskGroupBy: prisma.novelWorkflowTask.groupBy,
    styleExtractionTaskGroupBy: prisma.styleExtractionTask.groupBy,
    bookAnalysisCount: prisma.bookAnalysis.count,
    generationJobCount: prisma.generationJob.count,
    imageGenerationTaskCount: prisma.imageGenerationTask.count,
    novelWorkflowTaskCount: prisma.novelWorkflowTask.count,
    styleExtractionTaskCount: prisma.styleExtractionTask.count,
    workflowAdapterList: taskCenterService.workflowAdapter.list,
  };

  const captured = {
    generationJobWhere: null,
    imageGenerationTaskWhere: null,
    agentRunWhere: null,
    novelWorkflowTaskWhere: null,
    styleExtractionTaskWhere: null,
    generationJobRecoveryWhere: null,
    imageGenerationTaskRecoveryWhere: null,
    novelWorkflowTaskRecoveryWhere: null,
    styleExtractionTaskRecoveryWhere: null,
  };

  prisma.taskCenterArchive.findMany = async () => [];
  prisma.bookAnalysis.groupBy = async () => [];
  prisma.generationJob.groupBy = async ({ where }) => {
    captured.generationJobWhere = where;
    return [];
  };
  prisma.ragIndexJob.groupBy = async () => [];
  prisma.imageGenerationTask.groupBy = async ({ where }) => {
    captured.imageGenerationTaskWhere = where;
    return [];
  };
  prisma.agentRun.groupBy = async ({ where }) => {
    captured.agentRunWhere = where;
    return [];
  };
  prisma.novelWorkflowTask.groupBy = async ({ where }) => {
    captured.novelWorkflowTaskWhere = where;
    return [];
  };
  prisma.styleExtractionTask.groupBy = async ({ where }) => {
    captured.styleExtractionTaskWhere = where;
    return [];
  };
  prisma.bookAnalysis.count = async () => 0;
  prisma.generationJob.count = async ({ where }) => {
    captured.generationJobRecoveryWhere = where;
    return 0;
  };
  prisma.imageGenerationTask.count = async ({ where }) => {
    captured.imageGenerationTaskRecoveryWhere = where;
    return 0;
  };
  prisma.novelWorkflowTask.count = async ({ where }) => {
    captured.novelWorkflowTaskRecoveryWhere = where;
    return 0;
  };
  prisma.styleExtractionTask.count = async ({ where }) => {
    captured.styleExtractionTaskRecoveryWhere = where;
    return 0;
  };
  taskCenterService.workflowAdapter.list = async () => [];

  try {
    await runWithRequestContext({ userId: "user-test-1", authMode: "session" }, async () => {
      await taskCenterService.getOverview();
    });

    assert.equal(captured.generationJobWhere?.userId, "user-test-1");
    assert.deepEqual(captured.imageGenerationTaskWhere?.baseCharacter, { userId: "user-test-1" });
    assert.equal(captured.agentRunWhere?.userId, "user-test-1");
    assert.equal(captured.novelWorkflowTaskWhere?.lane, "auto_director");
    assert.equal(captured.novelWorkflowTaskWhere?.userId, "user-test-1");
    assert.deepEqual(captured.styleExtractionTaskWhere?.OR, [
      { createdStyleProfile: { userId: "user-test-1" } },
      { sourceDocument: { userId: "user-test-1" } },
      { metadataJson: { contains: "\"userId\":\"user-test-1\"" } },
    ]);
    assert.equal(captured.generationJobRecoveryWhere?.userId, "user-test-1");
    assert.deepEqual(captured.imageGenerationTaskRecoveryWhere?.baseCharacter, { userId: "user-test-1" });
    assert.equal(captured.novelWorkflowTaskRecoveryWhere?.userId, "user-test-1");
    assert.deepEqual(captured.styleExtractionTaskRecoveryWhere?.OR, [
      { createdStyleProfile: { userId: "user-test-1" } },
      { sourceDocument: { userId: "user-test-1" } },
      { metadataJson: { contains: "\"userId\":\"user-test-1\"" } },
    ]);
  } finally {
    prisma.taskCenterArchive.findMany = originals.taskCenterArchiveFindMany;
    prisma.bookAnalysis.groupBy = originals.bookAnalysisGroupBy;
    prisma.generationJob.groupBy = originals.generationJobGroupBy;
    prisma.ragIndexJob.groupBy = originals.ragIndexJobGroupBy;
    prisma.imageGenerationTask.groupBy = originals.imageGenerationTaskGroupBy;
    prisma.agentRun.groupBy = originals.agentRunGroupBy;
    prisma.novelWorkflowTask.groupBy = originals.novelWorkflowTaskGroupBy;
    prisma.styleExtractionTask.groupBy = originals.styleExtractionTaskGroupBy;
    prisma.bookAnalysis.count = originals.bookAnalysisCount;
    prisma.generationJob.count = originals.generationJobCount;
    prisma.imageGenerationTask.count = originals.imageGenerationTaskCount;
    prisma.novelWorkflowTask.count = originals.novelWorkflowTaskCount;
    prisma.styleExtractionTask.count = originals.styleExtractionTaskCount;
    taskCenterService.workflowAdapter.list = originals.workflowAdapterList;
  }
});
