import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const taskCenterPage = readFileSync("client/src/pages/tasks/TaskCenterPage.tsx", "utf8");
const sidebar = readFileSync("client/src/components/layout/Sidebar.tsx", "utf8");

test("task center keeps finished tasks out of the default list and exposes one-click archive", () => {
  assert.match(taskCenterPage, /includeFinished:\s*status\s*\?\s*undefined\s*:\s*false/);
  assert.match(taskCenterPage, /task\.status === "succeeded" \|\| task\.status === "cancelled"/);
  assert.match(taskCenterPage, /归档当前已完成\/已取消/);
});

test("director follow-up badge only counts pending and exception items", () => {
  assert.match(sidebar, /countersBySection/);
  assert.match(sidebar, /const pendingFollowUpCount = .*pending.*\?\? 0/);
  assert.match(sidebar, /const exceptionFollowUpCount = .*exception.*\?\? 0/);
  assert.match(sidebar, /const autoDirectorFollowUpCount = pendingFollowUpCount \+ exceptionFollowUpCount/);
});
