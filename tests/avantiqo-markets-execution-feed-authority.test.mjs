import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const runtime = fs.readFileSync(
  new URL("../lib/markets/runtime/MarketPaperExecutionRuntime.js", import.meta.url),
  "utf8",
);
const worker = fs.readFileSync(
  new URL("../services/avantiqo-markets-feed-worker/worker.mjs", import.meta.url),
  "utf8",
);
const migration = fs.readFileSync(
  new URL("../supabase/migrations/20260918152002_markets_execution_feed_authority.sql", import.meta.url),
  "utf8",
);

test("execution selects only live quote-bearing snapshots", () => {
  assert.match(runtime, /from\("market_live_snapshots"\)/);
  assert.match(runtime, /not\("latest_quote_fingerprint", "is", null\)/);
  assert.doesNotMatch(runtime, /from\("market_snapshots"\)[\s\S]{0,500}latestSnapshot/);
});

test("stock and news feed heartbeats are tracked separately", () => {
  assert.match(worker, /lastStockMessageAt/);
  assert.match(worker, /lastNewsMessageAt/);
  assert.match(worker, /lastStockFlushAt/);
  assert.match(worker, /last_stock_message_at: this\.lastStockMessageAt/);
  assert.match(worker, /last_news_message_at: this\.lastNewsMessageAt/);
  assert.match(worker, /last_stock_flush_at: this\.lastStockFlushAt/);
});

test("runtime requires exact websocket stock-feed authority before price execution", () => {
  assert.match(runtime, /EXECUTION_WEBSOCKET_TRANSPORT_REQUIRED/);
  assert.match(runtime, /EXECUTION_STOCK_STREAM_NOT_READY/);
  assert.match(runtime, /EXECUTION_SYMBOL_NOT_SUBSCRIBED/);
  assert.match(runtime, /EXECUTION_STOCK_HEARTBEAT_STALE/);
  assert.match(runtime, /EXECUTION_STOCK_FLUSH_STALE/);
  assert.match(runtime, /EXECUTION_FEED_STATUS_STALE/);
  assert.match(runtime, /EXECUTION_QUOTE_NOT_FLUSH_CONFIRMED/);
  assert.match(runtime, /EXECUTION_FEED_AUTHORITY_FAILED/);
});
test("news degradation is not used as stock execution authority", () => {
  assert.match(runtime, /stock_stream_ready: status\?\.metadata\?\.stock_stream_ready === true/);
  assert.match(runtime, /news_stream_ready: status\?\.metadata\?\.news_stream_ready === true/);
  assert.doesNotMatch(runtime, /connection_state !== "CONNECTED"/);
});

test("database independently locks and verifies live snapshot and feed status", () => {
  assert.match(migration, /from public\.market_live_snapshots[\s\S]*?for share/);
  assert.match(migration, /PAPER_EXECUTION_LIVE_SNAPSHOT_REQUIRED/);
  assert.match(migration, /PAPER_EXECUTION_FEED_IDENTITY_MISMATCH/);
  assert.match(migration, /from public\.market_feed_status[\s\S]*?for share/);
  assert.match(migration, /PAPER_EXECUTION_STOCK_STREAM_NOT_READY/);
  assert.match(migration, /PAPER_EXECUTION_SYMBOL_NOT_SUBSCRIBED/);
  assert.match(migration, /PAPER_EXECUTION_STOCK_HEARTBEAT_STALE/);
  assert.match(migration, /PAPER_EXECUTION_STOCK_FLUSH_STALE/);
  assert.match(migration, /PAPER_EXECUTION_FEED_STATUS_STALE/);
  assert.match(migration, /PAPER_EXECUTION_QUOTE_NOT_FLUSH_CONFIRMED/);
});

test("feed authority columns and RPC remain hardened", () => {
  assert.match(migration, /last_stock_message_at timestamptz/);
  assert.match(migration, /last_news_message_at timestamptz/);
  assert.match(migration, /last_stock_flush_at timestamptz/);
  assert.match(migration, /security invoker/);
  assert.match(
    migration,
    /revoke all on function public\.market_apply_paper_fill_with_quality[\s\S]*?from public, anon, authenticated/,
  );
  assert.match(
    migration,
    /grant execute on function public\.market_apply_paper_fill_with_quality[\s\S]*?to service_role/,
  );
});
