import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const read = (path) => fs.readFileSync(path, "utf8");
const proxy = read("proxy.js");
const callback = read("app/login/callback/page.js");
const syncRoute = read("app/api/auth/session/sync/route.js");

test("browser login synchronizes a validated session before workspace bootstrap", () => {
  assert.match(callback, /supabase\.auth\.getSession\(\)/);
  assert.match(callback, /\/api\/auth\/session\/sync/);
  assert.ok(callback.indexOf("/api/auth/session/sync") < callback.indexOf("/api/session/bootstrap"));
  assert.match(syncRoute, /supabase\.auth\.setSession/);
  assert.match(syncRoute, /supabase\.auth\.getUser/);
  assert.match(syncRoute, /Cache-Control/);
});

test("proxy refreshes Supabase cookies without changing custom-host routing", () => {
  assert.match(proxy, /createServerClient/);
  assert.match(proxy, /supabase\.auth\.getClaims\(\)/);
  assert.match(proxy, /request\.cookies\.set/);
  assert.match(proxy, /response\.cookies\.set/);
  assert.match(proxy, /isWorkforcePath\(request\.nextUrl\.pathname\)/);
  assert.match(proxy, /process\.env\.NODE_ENV === "development"/);
  assert.match(proxy, /request\.nextUrl\.hostname === "127\.0\.0\.1"/);
  assert.match(proxy, /localUrl\.hostname = "localhost"/);
  assert.match(proxy, /_next\/static/);
  assert.match(proxy, /isProtectedWorkspacePath/);
  assert.match(proxy, /loginUrl\.searchParams\.set\("next"/);
});

test("login returns authenticated users to the requested workspace", () => {
  const login = read("app/login/page.js");
  assert.match(login, /function callbackPath/);
  assert.match(login, /next\.startsWith\("\/workspace"\)/);
  assert.match(callback, /function requestedWorkspaceDestination/);
  assert.match(callback, /requestedWorkspaceDestination\(organizationId\)/);
});
