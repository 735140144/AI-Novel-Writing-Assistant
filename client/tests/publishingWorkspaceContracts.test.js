import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

const novelApi = readFileSync("client/src/api/novel/publishing.ts", "utf8");
const queryKeys = readFileSync("client/src/api/queryKeys.ts", "utf8");
const navigation = readFileSync("client/src/pages/novels/novelWorkspaceNavigation.ts", "utf8");
const novelList = readFileSync("client/src/pages/novels/NovelList.tsx", "utf8");
const desktopView = readFileSync("client/src/pages/novels/components/NovelEditView.tsx", "utf8");
const mobileView = readFileSync("client/src/pages/novels/mobile/MobileNovelEditView.tsx", "utf8");
const publishingTab = readFileSync("client/src/pages/novels/components/PublishingWorkspaceTab.tsx", "utf8");
const sidebar = readFileSync("client/src/components/layout/Sidebar.tsx", "utf8");
const mobileNavigation = readFileSync("client/src/components/layout/mobile/mobileSiteNavigation.ts", "utf8");
const router = readFileSync("client/src/router/index.tsx", "utf8");
const publishingPagePath = "client/src/pages/publishing/PublishingPlatformPage.tsx";
const publishingPage = existsSync(publishingPagePath) ? readFileSync(publishingPagePath, "utf8") : "";

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

test("publishing platform is not embedded in novel cards or edit header", () => {
  assert.doesNotMatch(novelList, /edit\?stage=publishing/);
  assert.doesNotMatch(novelList, /import \{[^}]*Send[^}]*\} from "lucide-react"/);
  assert.doesNotMatch(
    novelList,
    /<Link[\s\S]*?to=\{`\/novels\/\$\{novel\.id\}\/edit\?stage=publishing`\}[\s\S]*?发布平台[\s\S]*?<\/Link>/,
  );
  assert.doesNotMatch(desktopView, /import \{[^}]*Send[^}]*\} from "lucide-react"/);
  assert.doesNotMatch(desktopView, /onClick=\{\(\) => props\.onActiveTabChange\("publishing"\)\}[\s\S]{0,240}发布平台/);
});

test("publishing platform has a menu-level route on desktop and mobile", () => {
  assert.match(router, /const PublishingPlatformPage = lazy\(\(\) => import\("@\/pages\/publishing\/PublishingPlatformPage"\)\)/);
  assert.match(router, /\{ path: "publishing", element: <PublishingPlatformPage \/> \}/);
  assert.match(sidebar, /\{ to: "\/publishing", label: "发布平台", icon: [A-Za-z0-9_]+ \}/);
  assert.match(mobileNavigation, /key: "publishing"[\s\S]{0,120}title: "发布平台"[\s\S]{0,80}group: "creation"/);
  assert.match(mobileNavigation, /\{ key: "publishing", label: "发布平台", to: "\/publishing", group: "creation" \}/);
});

test("standalone publishing page selects a novel and reuses publishing workspace tab", () => {
  assert.ok(existsSync(publishingPagePath));
  assert.match(publishingPage, /getNovelList/);
  assert.match(publishingPage, /queryKeys\.novels\.list\(1, 100\)/);
  assert.match(publishingPage, /useNovelPublishingWorkspace\(\{/);
  assert.match(publishingPage, /<PublishingWorkspaceTab \{\.\.\.publishingTab\} \/>/);
  assert.match(publishingPage, /<Link to="\/novels\/create\?mode=director">AI 自动导演开书<\/Link>/);
});
