import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

function source(path) {
  return fs.readFileSync(path, "utf8");
}

test("root business context defers the browser Supabase client", () => {
  const provider = source("app/providers/BusinessContextProvider.jsx");
  assert.doesNotMatch(provider, /^import\s+\{\s*supabase\s*\}\s+from\s+["']@\/lib\/shared\/supabase\/client["']/m);
  assert.match(provider, /import\(["']@\/lib\/shared\/supabase\/client["']\)/);
  assert.match(provider, /getBrowserSupabase/);
});

test("login defers Supabase until auth bootstrap or an auth action", () => {
  const login = source("app/login/page.js");
  assert.doesNotMatch(login, /^import\s+\{\s*supabase\s*\}\s+from\s+["']@\/lib\/shared\/supabase\/client["']/m);
  assert.match(login, /import\(["']@\/lib\/shared\/supabase\/client["']\)/);
  assert.match(login, /await getBrowserSupabase\(\)/);
});

test("platform shell keeps optional voice and meeting bridges out of the initial bundle", () => {
  const shell = source("components/platform/PlatformShell.jsx");
  assert.doesNotMatch(shell, /^import\s+LocalHeyAvantiqoWakeBridge\s+from/m);
  assert.doesNotMatch(shell, /^import\s+SecretaryMeetingPresenceBridge\s+from/m);
  assert.match(shell, /dynamic\(\s*\(\) => import\(["']@\/components\/operator\/LocalHeyAvantiqoWakeBridge["']\)/);
  assert.match(shell, /dynamic\(\s*\(\) => import\(["']@\/components\/operator\/SecretaryMeetingPresenceBridge["']\)/);
  assert.match(shell, /ssr:\s*false/);
});

test("development filesystem webpack cache remains explicit opt-in", () => {
  const config = source("next.config.js");
  assert.match(config, /AVANTIQO_DEV_DISK_CACHE === "1"/);
  assert.match(config, /type:\s*"filesystem"/);
  assert.match(config, /else if \(dev\)[\s\S]*type:\s*"memory"/);
});
