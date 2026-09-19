import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const runtime = fs.readFileSync(
  new URL("../lib/markets/runtime/MarketPaperExecutionRuntime.js", import.meta.url),
  "utf8",
);
const migration = fs.readFileSync(
  new URL("../supabase/migrations/20260918143418_markets_execution_market_data_identity.sql", import.meta.url),
  "utf8",
);
const worker = fs.readFileSync(
  new URL("../services/avantiqo-markets-feed-worker/worker.mjs", import.meta.url),
  "utf8",
);
const ingestion = fs.readFileSync(
  new URL("../lib/markets/runtime/MarketIntelligenceIngestionRuntime.js", import.meta.url),
  "utf8",
);

test("snapshot schemas persist exact quote and trade identity", () => {
  assert.match(migration, /latest_trade_at timestamptz/);
  assert.match(migration, /latest_trade_id text/);
  assert.match(migration, /latest_quote_at timestamptz/);
  assert.match(migration, /latest_quote_fingerprint text/);
  assert.match(worker, /latest_quote_fingerprint: snapshot\.latest_quote_fingerprint/);
  assert.match(ingestion, /latest_quote_fingerprint: snapshot\.latest_quote_fingerprint/);
});

test("execution rejects missing stale replayed future or non-monotonic quote identities", () => {
  assert.match(runtime, /EXECUTION_QUOTE_FINGERPRINT_REQUIRED/);
  assert.match(runtime, /EXECUTION_QUOTE_TIMESTAMP_REQUIRED/);
  assert.match(runtime, /EXECUTION_QUOTE_FROM_FUTURE/);
  assert.match(runtime, /EXECUTION_QUOTE_STALE/);
  assert.match(runtime, /EXECUTION_QUOTE_ALREADY_CONSUMED/);
  assert.match(runtime, /EXECUTION_QUOTE_NOT_MONOTONIC/);
  assert.match(runtime, /EXECUTION_MARKET_DATA_IDENTITY_FAILED/);
});
test("database independently verifies exact persisted snapshot quote identity", () => {
  assert.match(migration, /PAPER_EXECUTION_QUOTE_IDENTITY_REQUIRED/);
  assert.match(migration, /PAPER_EXECUTION_QUOTE_ALREADY_CONSUMED/);
  assert.match(migration, /PAPER_EXECUTION_QUOTE_NOT_MONOTONIC/);
  assert.match(migration, /PAPER_EXECUTION_SNAPSHOT_IDENTITY_MISSING/);
  assert.match(migration, /PAPER_EXECUTION_SNAPSHOT_IDENTITY_MISMATCH/);
});

test("live snapshot row id is no longer the replay key", () => {
  assert.doesNotMatch(runtime, /last_execution_snapshot_id === snapshot\.id/);
  assert.match(migration, /last_execution_quote_fingerprint = v_quote_fingerprint/);
  assert.match(migration, /last_execution_quote_at = v_quote_at/);
});

test("fill evidence seals quote fingerprint timestamp and snapshot id", () => {
  assert.match(migration, /'snapshot_id', p_snapshot_id/);
  assert.match(migration, /'quote_fingerprint', v_quote_fingerprint/);
  assert.match(migration, /'quote_at', v_quote_at/);
  assert.match(migration, /grant execute on function public\.market_apply_paper_fill_with_quality[\s\S]*?to service_role/);
});
