import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const migration = fs.readFileSync(
  new URL("../supabase/migrations/20260918140500_avantiqo_markets_order_submission_lock_v1.sql", import.meta.url),
  "utf8",
);
const route = fs.readFileSync(
  new URL("../app/api/markets/command-center/route.js", import.meta.url),
  "utf8",
);

test("governed order creation locks the exact decision before insert", () => {
  assert.match(migration, /create or replace function public\.market_create_governed_paper_order/);
  assert.match(
    migration,
    /from public\.market_decisions[\s\S]*?where id = p_decision_id[\s\S]*?for update/,
  );
});

test("order creation refuses invalidated expired or non-approved decisions", () => {
  assert.match(migration, /PAPER_DECISION_NOT_APPROVED/);
  assert.match(migration, /PAPER_DECISION_INVALIDATED/);
  assert.match(migration, /PAPER_DECISION_EXPIRED/);
});
test("database rechecks exact symbol and side mutation binding at order creation", () => {
  assert.match(migration, /PAPER_ORDER_SYMBOL_MISMATCH/);
  assert.match(migration, /PAPER_ORDER_SIDE_MISMATCH/);
  assert.match(migration, /PAPER_DECISION_ORDER_ALREADY_EXISTS/);
});

test("command center creates paper orders only through locked governed RPC", () => {
  assert.match(route, /rpc\(\s*"market_create_governed_paper_order"/);
  assert.doesNotMatch(
    route,
    /from\("market_paper_orders"\)\.insert\(\{[\s\S]{0,900}status: "QUEUED"/,
  );
});

test("risk approval cannot revive cancelled or superseded decisions", () => {
  assert.match(
    route,
    /\.in\("risk_status", \["PENDING", "APPROVED_PAPER"\]\)[\s\S]*?\.single\(\)/,
  );
});

test("governed order creation RPC remains service-role only", () => {
  assert.match(
    migration,
    /revoke all on function public\.market_create_governed_paper_order[\s\S]*?from public, anon, authenticated/,
  );
  assert.match(
    migration,
    /grant execute on function public\.market_create_governed_paper_order[\s\S]*?to service_role/,
  );
});
