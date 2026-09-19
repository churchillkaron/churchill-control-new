import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const route = fs.readFileSync(
  new URL("../app/api/markets/command-center/route.js", import.meta.url),
  "utf8",
);
const migration = fs.readFileSync(
  new URL("../supabase/migrations/20260918130841_avantiqo_markets_decision_order_idempotency_v1.sql", import.meta.url),
  "utf8",
);

test("paper order submission rejects any second order for the same governed decision", () => {
  assert.match(
    route,
    /from\("market_paper_orders"\)[\s\S]*?eq\("decision_id", decision\.id\)[\s\S]*?This governed decision has already created a paper order/,
  );
});

test("active same-symbol same-side collision protection remains in place", () => {
  assert.match(
    route,
    /eq\("symbol", clean\(decision\.symbol\)\.toUpperCase\(\)\)[\s\S]*?eq\("side", side\)[\s\S]*?in\("status", \["QUEUED", "PARTIALLY_FILLED"\]\)/,
  );
});

test("database enforces one paper order per governed decision under concurrency", () => {
  assert.match(
    migration,
    /create unique index if not exists market_paper_orders_decision_unique[\s\S]*?on public\.market_paper_orders \(decision_id\)[\s\S]*?where decision_id is not null/,
  );
});
