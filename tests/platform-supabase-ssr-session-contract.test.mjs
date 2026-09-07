import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const read = (path) => fs.readFileSync(path, "utf8");
const middleware = read("middleware.js");
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

test("middleware refreshes Supabase cookies without changing custom-host routing", () => {
  assert.match(middleware, /createServerClient/);
  assert.match(middleware, /supabase\.auth\.getClaims\(\)/);
  assert.match(middleware, /request\.cookies\.set/);
  assert.match(middleware, /response\.cookies\.set/);
  assert.match(middleware, /isWorkforcePath\(request\.nextUrl\.pathname\)/);
  assert.match(middleware, /process\.env\.NODE_ENV === "development"/);
  assert.match(middleware, /request\.nextUrl\.hostname === "127\.0\.0\.1"/);
  assert.match(middleware, /localUrl\.hostname = "localhost"/);
  assert.match(middleware, /_next\/static/);
});
