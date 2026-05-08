const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buildChapterPublishSchedule,
  formatPlannedPublishTime,
  groupPublishPlanItemsByPlannedTime,
  normalizeStructuredSchedule,
} = require("../dist/services/publishing/publishingSchedule.js");
const {
  mapDispatchJobStatusToItemStatus,
  resolveDispatchErrorItemStatus,
} = require("../dist/services/publishing/publishingStatus.js");
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

test("publishing schedule parsing prompt is registered and structured", () => {
  const asset = getRegisteredPromptAsset("publishing.schedule.parse", "v1");
  assert.ok(asset);
  assert.equal(asset.id, "publishing.schedule.parse");
  assert.equal(asset.version, "v1");
  assert.equal(asset.mode, "structured");
  assert.ok(asset.outputSchema);
});
