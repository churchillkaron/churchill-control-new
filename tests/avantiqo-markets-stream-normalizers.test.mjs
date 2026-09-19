import assert from "node:assert/strict";
import test from "node:test";

import {
  mergeSnapshotState,
  normalizeNewsStreamMessage,
  normalizeStockStreamMessage,
} from "../services/avantiqo-markets-feed-worker/normalizers.mjs";

test("normalizes Alpaca trade messages", () => {
  const result = normalizeStockStreamMessage({
    T: "t",
    S: "AAPL",
    p: 201.25,
    s: 5,
    t: "2026-09-18T12:00:00Z",
  });
  assert.equal(result.type, "TRADE");
  assert.equal(result.symbol, "AAPL");
  assert.equal(result.patch.latest_trade_price, 201.25);
  assert.equal(result.patch.latest_trade_size, 5);
});

test("normalizes Alpaca quote messages", () => {
  const result = normalizeStockStreamMessage({
    T: "q",
    S: "MSFT",
    bp: 500.1,
    bs: 2,
    ap: 500.2,
    as: 3,
    t: "2026-09-18T12:00:01Z",
  });
  assert.equal(result.type, "QUOTE");
  assert.equal(result.patch.bid_price, 500.1);
  assert.equal(result.patch.ask_price, 500.2);
  assert.equal(result.patch.latest_quote_at, "2026-09-18T12:00:01Z");
  assert.match(result.patch.latest_quote_fingerprint, /^[a-f0-9]{64}$/);
});

test("normalizes minute bars and produces historical bar payload", () => {
  const result = normalizeStockStreamMessage({
    T: "b",
    S: "NVDA",
    o: 170,
    h: 172,
    l: 169,
    c: 171,
    v: 1000,
    n: 50,
    vw: 170.8,
    t: "2026-09-18T12:00:00Z",
  });
  assert.equal(result.type, "BAR");
  assert.equal(result.patch.minute_close, 171);
  assert.equal(result.bar.timeframe, "1Min");
  assert.equal(result.bar.trade_count, 50);
});

test("merges streaming patches without dropping prior quote state", () => {
  const quote = normalizeStockStreamMessage({
    T: "q",
    S: "AAPL",
    bp: 200,
    bs: 2,
    ap: 201,
    as: 3,
    t: "2026-09-18T12:00:00Z",
  });
  const trade = normalizeStockStreamMessage({
    T: "t",
    S: "AAPL",
    p: 200.5,
    s: 1,
    t: "2026-09-18T12:00:01Z",
  });
  const first = mergeSnapshotState({}, quote);
  const second = mergeSnapshotState(first, trade);
  assert.equal(second.bid_price, 200);
  assert.equal(second.ask_price, 201);
  assert.equal(second.latest_trade_price, 200.5);
});

test("out-of-order quote cannot overwrite newer executable quote state", () => {
  const newer = normalizeStockStreamMessage({
    T: "q", S: "AAPL", bp: 201, bs: 4, ap: 202, as: 5,
    t: "2026-09-18T12:00:02Z",
  });
  const older = normalizeStockStreamMessage({
    T: "q", S: "AAPL", bp: 190, bs: 9, ap: 191, as: 9,
    t: "2026-09-18T12:00:01Z",
  });
  const first = mergeSnapshotState({}, newer);
  const second = mergeSnapshotState(first, older);
  assert.equal(second.bid_price, 201);
  assert.equal(second.ask_price, 202);
  assert.equal(second.latest_quote_at, "2026-09-18T12:00:02Z");
  assert.equal(second.latest_quote_fingerprint, first.latest_quote_fingerprint);
});

test("older trade cannot move captured state backward", () => {
  const quote = normalizeStockStreamMessage({
    T: "q", S: "AAPL", bp: 201, bs: 4, ap: 202, as: 5,
    t: "2026-09-18T12:00:02Z",
  });
  const olderTrade = normalizeStockStreamMessage({
    T: "t", S: "AAPL", p: 200, s: 1,
    t: "2026-09-18T12:00:01Z",
  });
  const first = mergeSnapshotState({}, quote);
  const second = mergeSnapshotState(first, olderTrade);
  assert.equal(second.captured_at, "2026-09-18T12:00:02Z");
  assert.equal(second.latest_trade_at, "2026-09-18T12:00:01Z");
});

test("normalizes relevant Alpaca news", () => {
  const result = normalizeNewsStreamMessage({
    T: "n",
    id: 123,
    headline: "Example",
    summary: "Summary",
    symbols: ["AAPL", "MSFT"],
    source: "benzinga",
    created_at: "2026-09-18T12:00:00Z",
  });
  assert.equal(result.id, "123");
  assert.deepEqual(result.symbols, ["AAPL", "MSFT"]);
  assert.equal(result.source, "benzinga");
});
