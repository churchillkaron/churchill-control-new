import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const migration = fs.readFileSync(
  new URL("../supabase/migrations/20260918135000_avantiqo_markets_decision_invalidation_v1.sql", import.meta.url),
  "utf8",
);
const route = fs.readFileSync(
  new URL("../app/api/markets/command-center/route.js", import.meta.url),
  "utf8",
);
const worker = fs.readFileSync(
  new URL("../lib/markets/runtime/MarketPaperExecutionRuntime.js", import.meta.url),
  "utf8",
);

test("decision lifecycle has explicit cancelled and superseded terminal states", () => {
  assert.match(migration, /'CANCELLED','SUPERSEDED'/);
  assert.match(migration, /invalidated_at timestamptz/);
  assert.match(migration, /invalidation_reason text/);
  assert.match(migration, /superseded_by_decision_id uuid references public\.market_decisions/);
});

test("exact decision invalidation atomically cancels only its active order remainder", () => {
  assert.match(migration, /create or replace function public\.market_invalidate_paper_decision/);
  assert.match(migration, /and decision_id = v_decision\.id/);
  assert.match(migration, /and status in \('QUEUED','PARTIALLY_FILLED'\)/);
  assert.match(migration, /GOVERNED_DECISION_SUPERSEDED/);
  assert.match(migration, /GOVERNED_DECISION_CANCELLED/);
});
test("supersession requires one exact approved replacement for the same symbol", () => {
  assert.match(migration, /PAPER_REPLACEMENT_DECISION_NOT_FOUND/);
  assert.match(migration, /PAPER_DECISION_SUPERSESSION_SYMBOL_MISMATCH/);
  assert.match(migration, /PAPER_REPLACEMENT_DECISION_NOT_APPROVED/);
});

test("manual cancellation and supersession remain owner-authorized PAPER mutations", () => {
  assert.match(route, /CANCEL_PAPER_DECISION/);
  assert.match(route, /SUPERSEDE_PAPER_DECISION/);
  assert.match(
    route,
    /CANCEL_PAPER_DECISION"[\s\S]*?SUPERSEDE_PAPER_DECISION"[\s\S]*?requireMarketsAutomationAuthority\(scope\)/,
  );
  assert.match(route, /market_invalidate_paper_decision/);
});

test("execution worker terminally reconciles an invalidated queued order", () => {
  assert.match(worker, /terminalDecisionStatus === "SUPERSEDED"/);
  assert.match(worker, /terminalDecisionStatus === "CANCELLED"/);
  assert.match(worker, /status: "CANCELLED"/);
  assert.match(worker, /cancelled_at: cancelledAt/);
  assert.match(worker, /superseded_by_decision_id/);
});

test("decision invalidation RPC remains service-role only", () => {
  assert.match(
    migration,
    /revoke all on function public\.market_invalidate_paper_decision[\s\S]*?from public, anon, authenticated/,
  );
  assert.match(
    migration,
    /grant execute on function public\.market_invalidate_paper_decision[\s\S]*?to service_role/,
  );
});
