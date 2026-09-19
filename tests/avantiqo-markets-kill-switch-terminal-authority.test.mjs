import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const route = fs.readFileSync(
  new URL("../app/api/markets/command-center/route.js", import.meta.url),
  "utf8",
);
const runtime = fs.readFileSync(
  new URL("../lib/markets/runtime/MarketPaperExecutionRuntime.js", import.meta.url),
  "utf8",
);
const migration = fs.readFileSync(
  new URL("../supabase/migrations/20260919031217_markets_kill_switch_terminal_authority.sql", import.meta.url),
  "utf8",
);

test("kill-switch RPC locks automation policy and verifies switch remains active", () => {
  assert.match(
    migration,
    /from public\.market_automation_policies[\s\S]*?for update/,
  );
  assert.match(migration, /v_policy\.kill_switch is not true/);
});

test("kill-switch RPC atomically cancels queued and partial orders", () => {
  assert.match(migration, /status in \('QUEUED', 'PARTIALLY_FILLED'\)/);
  assert.match(migration, /PAPER_AUTOMATION_KILL_SWITCH_ACTIVATED/);
  assert.match(migration, /update public\.market_paper_orders/);
});

test("kill-switch RPC cancels approved decisions behind open orders", () => {
  assert.match(migration, /update public\.market_decisions/);
  assert.match(migration, /decision\.risk_status = 'APPROVED_PAPER'/);
  assert.match(migration, /select decision_id[\s\S]*?from open_orders/);
});

test("kill-switch RPC is service-role only", () => {
  assert.match(
    migration,
    /revoke all on function public\.market_cancel_open_paper_authority_on_kill_switch[\s\S]*?from public, anon, authenticated/,
  );
  assert.match(
    migration,
    /grant execute on function public\.market_cancel_open_paper_authority_on_kill_switch[\s\S]*?to service_role/,
  );
});

test("owner automation update invokes terminal cancellation while switch is active", () => {
  assert.match(route, /automationPolicy\.kill_switch === true/);
  assert.match(route, /market_cancel_open_paper_authority_on_kill_switch/);
  assert.match(route, /kill_switch_cancellation: killSwitchCancellation/);
});

test("fill worker also cancels stale authority when kill switch is active", () => {
  assert.match(runtime, /PAPER_AUTOMATION_KILL_SWITCH_ACTIVE/);
  assert.match(runtime, /status: "CANCELLED"/);
  assert.match(runtime, /risk_status: "CANCELLED"/);
});
