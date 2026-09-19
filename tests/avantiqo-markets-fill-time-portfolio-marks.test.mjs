import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const runtime = fs.readFileSync(
  new URL("../lib/markets/runtime/MarketPaperExecutionRuntime.js", import.meta.url),
  "utf8",
);

test("BUY portfolio risk requires fresh marks for every open long", () => {
  assert.match(
    runtime,
    /if \(side === "BUY"\) \{[\s\S]*?for \(const position of executionState\.positions\)/,
  );
  assert.match(runtime, /number\(position\.quantity, 0\) > 0/);
  assert.match(runtime, /PORTFOLIO_MARK_SNAPSHOT_REQUIRED/);
});

test("non-target holdings use the same live snapshot and feed authority chain", () => {
  assert.match(runtime, /await latestSnapshot\(\{[\s\S]*?symbol: ticker/);
  assert.match(runtime, /await executionFeedAuthority\(\{[\s\S]*?symbol: ticker/);
  assert.match(runtime, /PORTFOLIO_MARK_AUTHORITY_FAILED/);
});

test("portfolio marks require fresh fingerprinted top of book", () => {
  assert.match(runtime, /PORTFOLIO_MARK_QUOTE_FINGERPRINT_REQUIRED/);
  assert.match(runtime, /PORTFOLIO_MARK_QUOTE_TIMESTAMP_REQUIRED/);
  assert.match(runtime, /PORTFOLIO_MARK_QUOTE_STALE/);
  assert.match(runtime, /PORTFOLIO_MARK_TOP_OF_BOOK_INVALID/);
});

test("BUY marks long positions at top-of-book midpoint", () => {
  assert.match(runtime, /mark_price: bid > 0 && ask > 0 && ask >= bid \? \(bid \+ ask\) \/ 2 : null/);
  assert.match(runtime, /portfolioMarkBySymbol\.set\(ticker, markIdentity\.mark_price\)/);
  assert.match(runtime, /side === "BUY" && portfolioMarkBySymbol\.has\(ticker\)/);
});

test("portfolio mark evidence is persisted with risk revalidation", () => {
  assert.match(runtime, /portfolio_marks:/);
  assert.match(runtime, /method: side === "BUY" \? "TOP_OF_BOOK_MIDPOINT"/);
  assert.match(runtime, /mark_count: portfolioMarkEvidence\.length/);
  assert.match(runtime, /marks: portfolioMarkEvidence/);
  assert.match(runtime, /quote_fingerprint: fingerprint/);
  assert.match(runtime, /snapshot_id: snapshot\?\.id/);
});

test("SELL remains available without requiring full-portfolio live marks", () => {
  assert.match(runtime, /if \(side === "BUY"\) \{[\s\S]*?portfolioMarkBySymbol/);
  assert.match(runtime, /DE_RISKING_STORED_MARKS_ALLOWED/);
});
