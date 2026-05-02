const test = require("node:test");
const assert = require("node:assert/strict");

const {
  resolveLegacyTaskStatusesForList,
  resolveTaskStatusesForList,
} = require("../dist/services/task/taskCenter.shared.js");

test("task center default list hides completed and cancelled tasks", () => {
  assert.deepEqual(resolveTaskStatusesForList(), [
    "queued",
    "running",
    "waiting_approval",
    "failed",
  ]);
  assert.deepEqual(resolveLegacyTaskStatusesForList(), [
    "queued",
    "running",
    "failed",
  ]);
});

test("task center keeps explicit finished filters available", () => {
  assert.deepEqual(resolveTaskStatusesForList("succeeded"), ["succeeded"]);
  assert.deepEqual(resolveTaskStatusesForList("cancelled"), ["cancelled"]);
  assert.deepEqual(resolveLegacyTaskStatusesForList("succeeded"), ["succeeded"]);
  assert.deepEqual(resolveLegacyTaskStatusesForList("cancelled"), ["cancelled"]);
});

test("task center can opt back into full history when includeFinished is enabled", () => {
  assert.equal(resolveTaskStatusesForList(undefined, true), undefined);
  assert.equal(resolveLegacyTaskStatusesForList(undefined, true), undefined);
});
