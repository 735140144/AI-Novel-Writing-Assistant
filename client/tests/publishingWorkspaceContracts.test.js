import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const novelApi = readFileSync("client/src/api/novel/publishing.ts", "utf8");
const queryKeys = readFileSync("client/src/api/queryKeys.ts", "utf8");
const navigation = readFileSync("client/src/pages/novels/novelWorkspaceNavigation.ts", "utf8");
const desktopView = readFileSync("client/src/pages/novels/components/NovelEditView.tsx", "utf8");
const mobileView = readFileSync("client/src/pages/novels/mobile/MobileNovelEditView.tsx", "utf8");
const publishingTab = readFileSync("client/src/pages/novels/components/PublishingWorkspaceTab.tsx", "utf8");

test("publishing workspace uses server API routes only", () => {
  assert.doesNotMatch(novelApi, /dispatch\.lucky37\.cn/);
  assert.doesNotMatch(publishingTab, /qrPageUrl|qrImageUrl/);
  assert.match(novelApi, /\/novels\/\$\{novelId\}\/publishing\/workspace/);
  assert.match(novelApi, /\/novels\/publishing\/credentials/);
  assert.match(novelApi, /\/novels\/\$\{novelId\}\/publishing\/plans\/\$\{planId\}\/submit/);
  assert.match(novelApi, /\/novels\/\$\{novelId\}\/publishing\/jobs\/\$\{jobId\}\/refresh/);
});

test("publishing is a novel workspace flow step outside director locks", () => {
  assert.match(navigation, /\{ key: "pipeline", label: "质量修复" \},\n\s*\{ key: "publishing", label: "发布" \}/);
  assert.match(navigation, /if \(tab === "publishing"\) return null/);
});

test("publishing workspace is reachable on desktop and mobile", () => {
  assert.match(queryKeys, /publishingWorkspace: \(id: string\) => \["novels", "publishing", "workspace", id\] as const/);
  assert.match(desktopView, /case "publishing":\n\s*return <PublishingWorkspaceTab \{\.\.\.publishingTab\} \/>/);
  assert.match(mobileView, /case "publishing":\n\s*return <PublishingWorkspaceTab \{\.\.\.publishingTab\} \/>/);
});
