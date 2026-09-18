import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const migration = fs.readFileSync(
  new URL("../supabase/migrations/20260918165546_markets_policy_revision_touch_trigger.sql", import.meta.url),
  "utf8",
);

test("risk policy updates always advance database-managed revision", () => {
  assert.match(migration, /create trigger market_risk_policy_revision_touch/);
  assert.match(migration, /before update on public\.market_risk_policies/);
});

test("automation policy updates always advance database-managed revision", () => {
  assert.match(migration, /create trigger market_automation_policy_revision_touch/);
  assert.match(migration, /before update on public\.market_automation_policies/);
});

test("revision touch is strictly monotonic even for same-instant updates", () => {
  assert.match(
    migration,
    /greatest\([\s\S]*?clock_timestamp\(\)[\s\S]*?old\.updated_at \+ interval '1 microsecond'/,
  );
});

test("revision trigger is security invoker and not publicly executable", () => {
  assert.match(migration, /security invoker/);
  assert.match(
    migration,
    /revoke all on function public\.market_touch_policy_revision\(\)[\s\S]*?from public, anon, authenticated/,
  );
});
