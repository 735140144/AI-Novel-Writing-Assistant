const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buildChapterPublishSchedule,
  buildChapterPublishScheduleFromOffset,
  continueScheduleAfterTime,
  formatPlannedPublishTime,
  formatImmediatePublishTime,
  groupPublishPlanItemsByPlannedTime,
  isImmediatePublishTime,
  normalizeStructuredSchedule,
  resolveContinuationStartIndexOffset,
} = require("../dist/services/publishing/publishingSchedule.js");
const {
  mapDispatchJobStatusToItemStatus,
  resolveDispatchErrorHttpStatus,
  resolveDispatchErrorItemStatus,
} = require("../dist/services/publishing/publishingStatus.js");
const {
  mapPublishingCredential,
  mapPublishingKnownBookOption,
} = require("../dist/services/publishing/publishingMappers.js");
const { countPublishingReadyChapters } = require("../dist/services/publishing/publishingChapterContent.js");
const {
  getEffectiveRemoteProgressRows,
  getLatestRemoteScheduledPublishTime,
  mergeRemoteContinuationState,
} = require("../dist/services/publishing/publishingRemoteProgress.js");
const {
  hasPlanSubmissionEvidence,
  hasBlockingPlanSubmissionEvidence,
} = require("../dist/services/publishing/publishingPlanDeletion.js");
const { shouldSubmitPlanItem } = require("../dist/services/publishing/publishingPlanSubmission.js");
const { buildPublishOptions } = require("../dist/services/publishing/publishingDispatchPayloads.js");
const { getRegisteredPromptAsset } = require("../dist/prompting/registry.js");

test("publishing schedule assigns two chapters to each daily planned time", () => {
  const schedule = normalizeStructuredSchedule({
    structured: {
      startDate: "2026-05-09",
      publishTime: "08:00",
      chaptersPerDay: 2,
      startChapterOrder: 1,
      endChapterOrder: 5,
      timezone: "Asia/Shanghai",
      assumptions: ["从下一天开始。"],
    },
    defaultStartDate: "2026-05-09",
    minChapterOrder: 1,
    maxChapterOrder: 5,
    timezone: "Asia/Shanghai",
  });

  const items = buildChapterPublishSchedule({
    chapters: [
      { id: "c1", order: 1, title: "第一章" },
      { id: "c2", order: 2, title: "第二章" },
      { id: "c3", order: 3, title: "第三章" },
      { id: "c4", order: 4, title: "第四章" },
      { id: "c5", order: 5, title: "第五章" },
    ],
    schedule,
  });

  assert.deepEqual(
    items.map((item) => [item.chapterOrder, item.plannedPublishTime]),
    [
      [1, "2026-05-09 08:00"],
      [2, "2026-05-09 08:00"],
      [3, "2026-05-10 08:00"],
      [4, "2026-05-10 08:00"],
      [5, "2026-05-11 08:00"],
    ],
  );
});

test("publishing groups dispatch items by identical YYYY-MM-DD HH:mm planned time", () => {
  const groups = groupPublishPlanItemsByPlannedTime([
    { id: "a", plannedPublishTime: "2026-05-09 08:00" },
    { id: "b", plannedPublishTime: "2026-05-10 08:00" },
    { id: "c", plannedPublishTime: "2026-05-09 08:00" },
  ]);

  assert.deepEqual(
    groups.map((group) => ({
      plannedPublishTime: group.plannedPublishTime,
      itemIds: group.items.map((item) => item.id),
    })),
    [
      { plannedPublishTime: "2026-05-09 08:00", itemIds: ["a", "c"] },
      { plannedPublishTime: "2026-05-10 08:00", itemIds: ["b"] },
    ],
  );
});

test("publishing timer format is normalized and rejects compact dates", () => {
  assert.equal(formatPlannedPublishTime("2026-05-09", "8:00"), "2026-05-09 08:00");
  assert.throws(
    () => groupPublishPlanItemsByPlannedTime([
      { id: "a", plannedPublishTime: "20260509 08:00" },
    ]),
    /YYYY-MM-DD HH:mm/,
  );
});

test("publishing immediate mode uses a stable immediate marker", () => {
  const immediateTime = formatImmediatePublishTime();
  assert.equal(immediateTime, "immediate");
  assert.equal(isImmediatePublishTime(immediateTime), true);
  assert.equal(isImmediatePublishTime("2026-05-09 08:00"), false);
});

test("publishing continuation skips existing chapters and continues from occupied schedule slots", () => {
  const base = normalizeStructuredSchedule({
    structured: {
      startDate: "2026-05-09",
      publishTime: "08:00",
      chaptersPerDay: 2,
      startChapterOrder: 1,
      endChapterOrder: 6,
      timezone: "Asia/Shanghai",
    },
    defaultStartDate: "2026-05-09",
    minChapterOrder: 1,
    maxChapterOrder: 6,
    timezone: "Asia/Shanghai",
  });
  const continued = continueScheduleAfterTime({
    baseSchedule: base,
    occupiedPlannedTime: "2026-05-10 08:00",
    occupiedItemCount: 4,
  });
  const items = buildChapterPublishScheduleFromOffset({
    chapters: [
      { id: "c1", order: 1, title: "第一章" },
      { id: "c2", order: 2, title: "第二章" },
      { id: "c3", order: 3, title: "第三章" },
      { id: "c4", order: 4, title: "第四章" },
      { id: "c5", order: 5, title: "第五章" },
      { id: "c6", order: 6, title: "第六章" },
    ],
    schedule: continued,
    skipChapterIds: new Set(["c1", "c2", "c3", "c4"]),
    startIndexOffset: resolveContinuationStartIndexOffset({
      schedule: continued,
      occupiedPlannedTime: "2026-05-10 08:00",
    }),
  });
  assert.deepEqual(
    items.map((item) => [item.chapterOrder, item.plannedPublishTime]),
    [
      [5, "2026-05-11 08:00"],
      [6, "2026-05-11 08:00"],
    ],
  );
});

test("publishing continuation always advances beyond the last occupied publish time", () => {
  const base = normalizeStructuredSchedule({
    structured: {
      startDate: "2026-05-09",
      publishTime: "08:00",
      chaptersPerDay: 2,
      startChapterOrder: 1,
      endChapterOrder: 4,
      timezone: "Asia/Shanghai",
    },
    defaultStartDate: "2026-05-09",
    minChapterOrder: 1,
    maxChapterOrder: 4,
    timezone: "Asia/Shanghai",
  });
  const continued = continueScheduleAfterTime({
    baseSchedule: base,
    occupiedPlannedTime: "2026-05-09 08:00",
    occupiedItemCount: 1,
  });
  const items = buildChapterPublishScheduleFromOffset({
    chapters: [
      { id: "c1", order: 1, title: "第一章" },
      { id: "c2", order: 2, title: "第二章" },
      { id: "c3", order: 3, title: "第三章" },
      { id: "c4", order: 4, title: "第四章" },
    ],
    schedule: continued,
    skipChapterIds: new Set(["c1"]),
    startIndexOffset: resolveContinuationStartIndexOffset({
      schedule: continued,
      occupiedPlannedTime: "2026-05-09 08:00",
    }),
  });
  assert.deepEqual(
    items.map((item) => [item.chapterOrder, item.plannedPublishTime]),
    [
      [2, "2026-05-10 08:00"],
      [3, "2026-05-10 08:00"],
      [4, "2026-05-11 08:00"],
    ],
  );
});

test("publishing remote progress derives the latest scheduled publish time from draft rows", () => {
  const latestScheduledPublishTime = getLatestRemoteScheduledPublishTime({
    bookId: "book-1",
    bookTitle: "Novel A",
    publishedChapters: [],
    draftChapters: [
      { source: "draft", order: 181, title: "第181章", chapterName: "第181章", timerTime: "2026-05-12 08:00" },
      { source: "draft", order: 182, title: "第182章", chapterName: "第182章", timer_time: "20260513 09:30" },
    ],
    effectiveDraftChapters: [],
    syncedAt: "2026-05-09T05:33:21.063Z",
  });

  assert.equal(latestScheduledPublishTime, "2026-05-13 09:30");
});

test("publishing remote continuation uses remote scheduled time when local occupied plan is missing", () => {
  const continuation = mergeRemoteContinuationState({
    localOccupiedPlannedTime: null,
    localOccupiedCount: 0,
    remoteProgress: {
      bookId: "book-1",
      bookTitle: "Novel A",
      publishedChapters: [],
      draftChapters: [
        { source: "draft", order: 181, title: "第181章", chapterName: "第181章", timerTime: "2026-05-12 08:00" },
      ],
      effectiveDraftChapters: [],
      syncedAt: "2026-05-09T05:33:21.063Z",
    },
  });

  assert.deepEqual(continuation, {
    occupiedPlannedTime: "2026-05-12 08:00",
    occupiedCount: 1,
  });
});

test("dispatch status mapping keeps draft and publish completion separate", () => {
  assert.equal(mapDispatchJobStatusToItemStatus({ mode: "draft", dispatchStatus: "completed" }), "draft_box");
  assert.equal(mapDispatchJobStatusToItemStatus({ mode: "publish", dispatchStatus: "completed" }), "published");
  assert.equal(mapDispatchJobStatusToItemStatus({ mode: "draft", dispatchStatus: "running" }), "submitting");
  assert.equal(mapDispatchJobStatusToItemStatus({ mode: "publish", dispatchStatus: "failed" }), "failed");
  assert.equal(
    mapDispatchJobStatusToItemStatus({
      mode: "publish",
      dispatchStatus: "failed",
      error: {
        error: { code: "CREDENTIAL_RELOGIN_REQUIRED" },
        relogin: { action: "bootstrap_login", credentialUuid: "credential-1" },
      },
    }),
    "relogin_required",
  );
});

test("dispatch relogin errors map to relogin_required item state", () => {
  assert.equal(
    resolveDispatchErrorItemStatus({
      error: {
        code: "CREDENTIAL_RELOGIN_REQUIRED",
        message: "Credential is not ready for publishing",
      },
      relogin: {
        action: "bootstrap_login",
        credentialUuid: "credential-1",
      },
    }),
    "relogin_required",
  );
  assert.equal(resolveDispatchErrorItemStatus({ error: { code: "VALIDATION_ERROR" } }), "failed");
});

test("dispatch relogin errors surface as conflict instead of generic 500", () => {
  assert.equal(
    resolveDispatchErrorHttpStatus({
      upstreamStatus: 500,
      value: {
        error: {
          code: "CREDENTIAL_RELOGIN_REQUIRED",
          message: "Credential is not ready for publishing",
        },
        relogin: {
          action: "bootstrap_login",
          credentialUuid: "credential-1",
        },
      },
    }),
    409,
  );
  assert.equal(
    resolveDispatchErrorHttpStatus({
      upstreamStatus: 400,
      value: { error: { code: "VALIDATION_ERROR" } },
    }),
    400,
  );
});

test("publishing credential ready state clears QR challenge and syncs account label", () => {
  const readyCredential = mapPublishingCredential({
    id: "credential-1",
    platform: "fanqie",
    label: "番茄笔名A",
    credentialUuid: "dispatch-credential",
    status: "ready",
    accountId: "account-1",
    accountDisplayName: "番茄笔名A",
    lastValidatedAt: new Date("2026-05-08T10:00:00.000Z"),
    lastLoginChallengeId: null,
    lastLoginChallengeStatus: null,
    lastLoginChallengeJson: null,
    createdAt: new Date("2026-05-08T09:00:00.000Z"),
    updatedAt: new Date("2026-05-08T10:00:00.000Z"),
  });
  assert.equal(readyCredential.label, "番茄笔名A");
  assert.equal(readyCredential.accountDisplayName, "番茄笔名A");
  assert.equal(readyCredential.lastLoginChallengeJson, null);

  const pendingCredential = mapPublishingCredential({
    id: "credential-2",
    platform: "fanqie",
    label: "番茄作者号",
    credentialUuid: "dispatch-credential-2",
    status: "login_pending",
    accountId: null,
    accountDisplayName: null,
    lastValidatedAt: null,
    lastLoginChallengeId: "challenge-1",
    lastLoginChallengeStatus: "pending",
    lastLoginChallengeJson: JSON.stringify({
      id: "challenge-1",
      qrCodeBase64Png: "base64",
    }),
    createdAt: new Date("2026-05-08T09:00:00.000Z"),
    updatedAt: new Date("2026-05-08T10:00:00.000Z"),
  });
  assert.deepEqual(pendingCredential.lastLoginChallengeJson, {
    id: "challenge-1",
    qrCodeBase64Png: "base64",
  });
});

test("publishing synced published items without local submission evidence can be cleared", () => {
  assert.equal(
    hasPlanSubmissionEvidence({
      status: "published",
      dispatchJobId: null,
      externalJobId: null,
      submittedAt: null,
      dispatchStatus: null,
    }),
    false,
  );
  assert.equal(
    hasPlanSubmissionEvidence({
      status: "draft_box",
      dispatchJobId: null,
      externalJobId: null,
      submittedAt: null,
      dispatchStatus: null,
    }),
    false,
  );
  assert.equal(
    hasBlockingPlanSubmissionEvidence({
      items: [
        {
          status: "published",
          dispatchJobId: null,
          externalJobId: null,
          submittedAt: null,
          dispatchStatus: null,
        },
      ],
      jobs: [],
    }),
    false,
  );
});

test("publishing keeps clear blocked when local submission evidence exists", () => {
  assert.equal(
    hasPlanSubmissionEvidence({
      status: "published",
      dispatchJobId: "job-1",
      externalJobId: null,
      submittedAt: null,
      dispatchStatus: null,
    }),
    true,
  );
  assert.equal(
    hasPlanSubmissionEvidence({
      status: "draft_box",
      dispatchJobId: null,
      externalJobId: "external-1",
      submittedAt: null,
      dispatchStatus: null,
    }),
    true,
  );
  assert.equal(
    hasPlanSubmissionEvidence({
      status: "submitting",
      dispatchJobId: null,
      externalJobId: null,
      submittedAt: "2026-05-09T08:00:00.000Z",
      dispatchStatus: "queued",
    }),
    true,
  );
  assert.equal(
    hasBlockingPlanSubmissionEvidence({
      items: [
        {
          status: "published",
          dispatchJobId: "job-1",
          externalJobId: null,
          submittedAt: null,
          dispatchStatus: null,
        },
      ],
      jobs: [],
    }),
    true,
  );
  assert.equal(
    hasBlockingPlanSubmissionEvidence({
      items: [],
      jobs: [
        {
          status: "completed",
          externalJobId: null,
          submittedAt: null,
        },
      ],
    }),
    true,
  );
});

test("publishing only submits plan items that still need local processing", () => {
  assert.equal(shouldSubmitPlanItem({ status: "unpublished" }), true);
  assert.equal(shouldSubmitPlanItem({ status: "failed" }), true);
  assert.equal(shouldSubmitPlanItem({ status: "relogin_required" }), true);
  assert.equal(shouldSubmitPlanItem({ status: "submitting" }), false);
  assert.equal(shouldSubmitPlanItem({ status: "draft_box" }), false);
  assert.equal(shouldSubmitPlanItem({ status: "published" }), false);
});

test("publishing dispatch payload omits timerTime for immediate publish items", () => {
  assert.deepEqual(
    buildPublishOptions({
      plannedPublishTime: "immediate",
      useAi: true,
      dailyWordLimit: 20000,
    }),
    {
      useAi: true,
      dailyWordLimit: 20000,
    },
  );
  assert.deepEqual(
    buildPublishOptions({
      plannedPublishTime: "2026-05-09 08:00",
      useAi: true,
      dailyWordLimit: 20000,
    }),
    {
      useAi: true,
      timerTime: "2026-05-09 08:00",
      dailyWordLimit: 20000,
    },
  );
});

test("publishing known-book option key is stable for dropdown selection and dedupe", () => {
  const option = mapPublishingKnownBookOption({
    credentialId: "credential-1",
    credentialLabel: "番茄账号A",
    bookId: "book-2",
    bookTitle: "当前绑定书",
    sourceNovelId: "novel-1",
    sourceNovelTitle: "测试小说",
    lastUsedAt: new Date("2026-05-08T10:00:00.000Z"),
  });

  assert.deepEqual(option, {
    key: "credential-1:book-2",
    credentialId: "credential-1",
    credentialLabel: "番茄账号A",
    bookId: "book-2",
    bookTitle: "当前绑定书",
    sourceNovelId: "novel-1",
    sourceNovelTitle: "测试小说",
    lastUsedAt: "2026-05-08T10:00:00.000Z",
  });
});

test("publishing remote progress ignores placeholder drafts and keeps published rows", () => {
  const progress = getEffectiveRemoteProgressRows({
    publishedChapters: [
      {
        source: "chapter",
        order: 1,
        title: "Arrival",
        chapterName: "Arrival",
        itemId: "published-1",
      },
    ],
    draftChapters: [
      {
        source: "draft",
        order: 2,
        title: "Departure",
        chapterName: "Departure",
        itemId: "draft-2",
      },
      {
        source: "draft",
        order: 3,
        title: "",
        chapterName: "",
        itemId: "draft-3",
      },
    ],
    effectiveDraftChapters: [
      {
        source: "draft",
        order: 2,
        title: "Departure",
        chapterName: "Departure",
        itemId: "draft-2",
      },
    ],
  });

  assert.deepEqual(
    progress.publishedOrders,
    new Set([1]),
  );
  assert.deepEqual(
    progress.effectiveDraftOrders,
    new Set([2]),
  );
  assert.equal(progress.publishedCount, 1);
  assert.equal(progress.effectiveDraftCount, 1);
});

test("publishing remote progress treats max published order as the published count floor", () => {
  const progress = getEffectiveRemoteProgressRows({
    publishedChapters: [
      {
        source: "chapter",
        order: 180,
        title: "第180章",
        chapterName: "第180章",
        itemId: "published-180",
      },
      {
        source: "chapter",
        order: 179,
        title: "第179章",
        chapterName: "第179章",
        itemId: "published-179",
      },
      {
        source: "chapter",
        order: 160,
        title: "第160章",
        chapterName: "第160章",
        itemId: "published-160",
      },
    ],
    draftChapters: [],
    effectiveDraftChapters: [],
  });

  assert.equal(progress.publishedCount, 180);
  assert.ok(progress.publishedOrders.has(1));
  assert.ok(progress.publishedOrders.has(160));
  assert.ok(progress.publishedOrders.has(180));
});

test("publishing ready chapter count follows actual content instead of workflow status", () => {
  assert.equal(
    countPublishingReadyChapters([
      { content: "第一章正文", generationState: "repaired", chapterStatus: "needs_repair" },
      { content: "  第二章正文  ", generationState: "reviewed", chapterStatus: "generating" },
      { content: "   ", generationState: "approved", chapterStatus: "completed" },
      { content: null, generationState: "approved", chapterStatus: "completed" },
    ]),
    2,
  );
});

test("publishing schedule parsing prompt is registered and structured", () => {
  const asset = getRegisteredPromptAsset("publishing.schedule.parse", "v1");
  assert.ok(asset);
  assert.equal(asset.id, "publishing.schedule.parse");
  assert.equal(asset.version, "v1");
  assert.equal(asset.mode, "structured");
  assert.ok(asset.outputSchema);
});
