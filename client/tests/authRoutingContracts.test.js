import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const routerSource = readFileSync("client/src/router/index.tsx", "utf8");
const requireAuthSource = readFileSync("client/src/router/RequireAuth.tsx", "utf8");
const sidebarSource = readFileSync("client/src/components/layout/Sidebar.tsx", "utf8");
const mobileNavigationSource = readFileSync("client/src/components/layout/mobile/mobileSiteNavigation.ts", "utf8");

test("router exposes public auth pages and wraps business routes with RequireAuth", () => {
  assert.match(routerSource, /const LoginPage = lazy\(\(\) => import\("@\/pages\/auth\/LoginPage"\)\);/);
  assert.match(routerSource, /path: "\/login"/);
  assert.match(routerSource, /path: "\/register"/);
  assert.match(routerSource, /element: <RequireAuth \/>/);
  assert.match(routerSource, /element: <AppLayout \/>/);
});

test("sidebar keeps model routes visible but hides system settings for non-admin users", () => {
  assert.match(sidebarSource, /useAuthStore/);
  assert.match(sidebarSource, /label: "模型路由"/);
  assert.match(sidebarSource, /label: "系统设置"/);
  assert.match(sidebarSource, /item\.adminOnly && !isAdmin/);
});

test("mobile more menu keeps model routes while marking system settings as admin-only", () => {
  assert.match(mobileNavigationSource, /key: "model-routes", label: "模型路由"/);
  assert.match(mobileNavigationSource, /key: "settings", label: "系统设置"/);
  assert.match(mobileNavigationSource, /adminOnly: true/);
});

test("RequireAuth updates auth state through stable selectors instead of a whole-store dependency", () => {
  assert.match(requireAuthSource, /const setUser = useAuthStore\(\(state\) => state\.setUser\);/);
  assert.match(requireAuthSource, /const clearUser = useAuthStore\(\(state\) => state\.clearUser\);/);
  assert.doesNotMatch(requireAuthSource, /const authStore = useAuthStore\(\);/);
  assert.doesNotMatch(requireAuthSource, /\[authStore,\s*meQuery\.data\?\.data\]/);
});
