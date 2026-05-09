import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

const novelApi = readFileSync("client/src/api/novel/publishing.ts", "utf8");
const queryKeys = readFileSync("client/src/api/queryKeys.ts", "utf8");
const navigation = readFileSync("client/src/pages/novels/novelWorkspaceNavigation.ts", "utf8");
const novelList = readFileSync("client/src/pages/novels/NovelList.tsx", "utf8");
const desktopView = readFileSync("client/src/pages/novels/components/NovelEditView.tsx", "utf8");
const mobileView = readFileSync("client/src/pages/novels/mobile/MobileNovelEditView.tsx", "utf8");
const sidebar = readFileSync("client/src/components/layout/Sidebar.tsx", "utf8");
const mobileNavigation = readFileSync("client/src/components/layout/mobile/mobileSiteNavigation.ts", "utf8");
const router = readFileSync("client/src/router/index.tsx", "utf8");
const toastUi = readFileSync("client/src/components/ui/toast.tsx", "utf8");
const publishingIndexPagePath = "client/src/pages/publishing/PublishingPlatformPage.tsx";
const publishingAccountsPagePath = "client/src/pages/publishing/PublishingAccountsPage.tsx";
const publishingWorksPagePath = "client/src/pages/publishing/PublishingWorksPage.tsx";
const publishingDetailPagePath = "client/src/pages/publishing/PublishingWorkDetailPage.tsx";
const publishingIndexPage = existsSync(publishingIndexPagePath) ? readFileSync(publishingIndexPagePath, "utf8") : "";
const publishingAccountsPage = existsSync(publishingAccountsPagePath) ? readFileSync(publishingAccountsPagePath, "utf8") : "";
const publishingWorksPage = existsSync(publishingWorksPagePath) ? readFileSync(publishingWorksPagePath, "utf8") : "";
const publishingDetailPage = existsSync(publishingDetailPagePath) ? readFileSync(publishingDetailPagePath, "utf8") : "";

test("publishing API stays server-mediated and exposes split module endpoints", () => {
  assert.doesNotMatch(novelApi, /dispatch\.lucky37\.cn/);
  assert.match(novelApi, /\/novels\/publishing\/credentials/);
  assert.match(novelApi, /\/novels\/publishing\/works/);
  assert.match(novelApi, /\/novels\/publishing\/works\/\$\{bindingId\}/);
  assert.match(novelApi, /\/novels\/publishing\/works\/\$\{bindingId\}\/progress\/sync/);
  assert.match(novelApi, /\/novels\/publishing\/works\/\$\{bindingId\}\/plans/);
  assert.match(novelApi, /\/novels\/publishing\/works\/\$\{bindingId\}\/plans\/\$\{planId\}\/submit/);
  assert.match(novelApi, /\/novels\/publishing\/works\/\$\{bindingId\}\/plans\/\$\{planId\}/);
});

test("publishing remains a novel workspace flow step but primary entry is menu-level", () => {
  assert.match(navigation, /\{ key: "pipeline", label: "质量修复" \},\n\s*\{ key: "publishing", label: "发布" \}/);
  assert.match(navigation, /if \(tab === "publishing"\) return null/);
  assert.doesNotMatch(novelList, /edit\?stage=publishing/);
  assert.doesNotMatch(desktopView, /onClick=\{\(\) => props\.onActiveTabChange\("publishing"\)\}[\s\S]{0,240}发布平台/);
  assert.doesNotMatch(mobileView, /onClick=\{\(\) => props\.onActiveTabChange\("publishing"\)\}[\s\S]{0,240}发布平台/);
});

test("publishing module is split into accounts, works, and work detail routes", () => {
  assert.match(router, /const PublishingPlatformPage = lazy\(\(\) => import\("@\/pages\/publishing\/PublishingPlatformPage"\)\)/);
  assert.match(router, /const PublishingAccountsPage = lazy\(\(\) => import\("@\/pages\/publishing\/PublishingAccountsPage"\)\)/);
  assert.match(router, /const PublishingWorksPage = lazy\(\(\) => import\("@\/pages\/publishing\/PublishingWorksPage"\)\)/);
  assert.match(router, /const PublishingWorkDetailPage = lazy\(\(\) => import\("@\/pages\/publishing\/PublishingWorkDetailPage"\)\)/);
  assert.match(router, /\{ path: "publishing", element: <PublishingPlatformPage \/> \}/);
  assert.match(router, /\{ path: "publishing\/accounts", element: <PublishingAccountsPage \/> \}/);
  assert.match(router, /\{ path: "publishing\/works", element: <PublishingWorksPage \/> \}/);
  assert.match(router, /\{ path: "publishing\/works\/:bindingId", element: <PublishingWorkDetailPage \/> \}/);
});

test("publishing navigation is menu-level on desktop and mobile", () => {
  assert.match(sidebar, /title: "发布",\n\s*items: \[/);
  assert.match(sidebar, /\{ to: "\/publishing\/accounts", label: "账号管理", icon: [A-Za-z0-9_]+ \}/);
  assert.match(sidebar, /\{ to: "\/publishing\/works", label: "作品列表", icon: [A-Za-z0-9_]+ \}/);
  assert.doesNotMatch(sidebar, /\{ to: "\/publishing", label: "发布", icon: [A-Za-z0-9_]+ \}/);
  assert.match(mobileNavigation, /key: "publishing"[\s\S]{0,120}title: "发布"[\s\S]{0,120}group: "more"/);
  assert.match(mobileNavigation, /title: "发布",\n\s*items: \[\n\s*\{ key: "publishing-accounts", label: "账号管理", to: "\/publishing\/accounts", group: "more" \},\n\s*\{ key: "publishing-works", label: "作品列表", to: "\/publishing\/works", group: "more" \},/);
});

test("publishing landing page redirects users into the split module", () => {
  assert.ok(existsSync(publishingIndexPagePath));
  assert.match(publishingIndexPage, /Navigate/);
  assert.match(publishingIndexPage, /to="\/publishing\/works"/);
});

test("publishing accounts page owns credential management and QR login UX", () => {
  assert.ok(existsSync(publishingAccountsPagePath));
  assert.match(publishingAccountsPage, /getPublishingAccounts/);
  assert.match(publishingAccountsPage, /validatePublishingCredential/);
  assert.match(publishingAccountsPage, /绑定番茄账号/);
  assert.match(publishingAccountsPage, /创建扫码账号/);
  assert.match(publishingAccountsPage, /刷新/);
  assert.match(publishingAccountsPage, /扫码登录/);
  assert.doesNotMatch(publishingAccountsPage, /发布计划/);
});

test("publishing works page uses table/list layout with binding-row granularity", () => {
  assert.ok(existsSync(publishingWorksPagePath));
  assert.match(publishingWorksPage, /getPublishingWorks/);
  assert.match(publishingWorksPage, /getPublishingAccounts/);
  assert.match(publishingWorksPage, /getNovelList/);
  assert.match(publishingWorksPage, /createNovelPlatformBinding/);
  assert.match(publishingWorksPage, /添加作品/);
  assert.match(publishingWorksPage, /绑定作品/);
  assert.match(publishingWorksPage, /选择本地已维护书籍/);
  assert.match(publishingWorksPage, /作品列表/);
  assert.match(publishingWorksPage, /书名/);
  assert.match(publishingWorksPage, /进度/);
  assert.match(publishingWorksPage, /发布平台/);
  assert.match(publishingWorksPage, /发布平台笔名/);
  assert.match(publishingWorksPage, /发布书名/);
  assert.match(publishingWorksPage, /账号状态/);
  assert.match(publishingWorksPage, /最近同步时间/);
  assert.match(publishingWorksPage, /发布详情/);
  assert.doesNotMatch(publishingWorksPage, /rounded-xl border border-border\/70 bg-background p-4/);
});

test("publishing work detail page requires remote sync before first plan generation", () => {
  assert.ok(existsSync(publishingDetailPagePath));
  assert.match(publishingDetailPage, /getPublishingWorkDetail/);
  assert.match(publishingDetailPage, /syncPublishingBindingProgress/);
  assert.match(publishingDetailPage, /generatePublishingPlan/);
  assert.match(publishingDetailPage, /submitPublishingPlan/);
  assert.match(publishingDetailPage, /refreshPublishingJob/);
  assert.match(publishingDetailPage, /同步远端进度/);
  assert.match(publishingDetailPage, /首次生成发布时间表前/);
  assert.match(publishingDetailPage, /立即发布/);
  assert.match(publishingDetailPage, /定时发布/);
  assert.match(publishingDetailPage, /起始日期/);
  assert.match(publishingDetailPage, /每日发布章节数/);
  assert.match(publishingDetailPage, /发布时间/);
  assert.match(publishingDetailPage, /生成发布时间表/);
  assert.match(publishingDetailPage, /参与发布章节数量/);
  assert.match(publishingDetailPage, /开始发布/);
  assert.match(publishingDetailPage, /清除当前计划/);
  assert.match(publishingDetailPage, /发布详情/);
  assert.match(publishingDetailPage, /待提交章节/);
  assert.match(publishingDetailPage, /已在平台存在的章节/);
  assert.match(publishingDetailPage, /不会再次参与本次提交/);
  assert.match(publishingDetailPage, /latestScheduledPublishTime/);
  assert.match(publishingDetailPage, /远端已排期至/);
  assert.match(publishingDetailPage, /queryClient\.setQueryData[\s\S]{0,160}queryKeys\.publishingWorkDetail\(bindingId\)/);
  assert.match(publishingDetailPage, /setStartDate\(plusOneDate\(resolveDefaultStartAnchorDate/);
  assert.match(publishingDetailPage, /return Math\.max\(remoteProgress\.publishedChapters\.length, maxOrder\)/);
  assert.match(publishingDetailPage, /return hasRemoteProgress \? remotePublishedCount : localPublished/);
});

test("publishing query keys follow split accounts-works-detail structure", () => {
  assert.match(queryKeys, /publishingCredentials: \["publishing", "credentials"\] as const/);
  assert.match(queryKeys, /publishingWorks: \["publishing", "works"\] as const/);
  assert.match(queryKeys, /publishingWorkDetail: \(bindingId: string\) => \["publishing", "works", bindingId\] as const/);
});

test("publishing error toasts auto-close instead of staying pinned", () => {
  assert.match(toastUi, /duration:\s*3000/);
  assert.doesNotMatch(toastUi, /duration:\s*Number\.POSITIVE_INFINITY/);
});
