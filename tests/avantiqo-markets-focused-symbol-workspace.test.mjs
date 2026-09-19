import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const source = fs.readFileSync(
  new URL("../components/workspace/solutions/markets/MarketsCommandCenter.jsx", import.meta.url),
  "utf8",
);

test("Markets workspace keeps one selected symbol operator context", () => {
  assert.match(source, /const \[selectedSymbol, setSelectedSymbol\] = useState\(""/);
  assert.match(source, /const focusedSymbol = \(/);
  assert.match(source, /setSelectedSymbol\(item\.symbol\)/);
});

test("focused symbol can refresh intelligence through the shared helper", () => {
  assert.match(source, /async function refreshSymbolIntelligence\(item\)/);
  assert.match(source, /action: "REFRESH_INTELLIGENCE"/);
  assert.match(source, /onClick=\{\(\) => refreshSymbolIntelligence\(focusedWatchItem\)\}/);
});

test("focused symbol exposes walk-forward validation", () => {
  assert.match(source, /symbol: focusedSymbol/);
  assert.match(source, /"RUN_WALK_FORWARD"/);
  assert.match(source, /Run walk-forward/);
});

test("focused governed decision can queue or process PAPER execution", () => {
  assert.match(source, /queuePaperDecision\(focusedDecision\)/);
  assert.match(source, /"PROCESS_PAPER_ORDERS"/);
  assert.match(source, /Process active order/);
});

test("owner can cancel focused governed decision and linked order authority", () => {
  assert.match(source, /"CANCEL_PAPER_DECISION"/);
  assert.match(source, /Cancelled by owner from Markets workspace/);
  assert.match(source, /Cancel decision & order/);
});

test("focused symbol exposes the research trail behind the decision", () => {
  assert.match(source, /const focusedEvidence = focusedSymbol/);
  assert.match(source, /const focusedTheses = focusedSymbol/);
  assert.match(source, /const focusedFilings = focusedSymbol/);
  assert.match(source, /Research behind this decision/);
  assert.match(source, /Specialist theses/);
  assert.match(source, /Open source/);
  assert.match(source, /Open filing/);
});

test("focused symbol shows news monitoring freshness", () => {
  assert.match(source, /const focusedNewsRefreshedAt = focusedWatchItem\?\.metadata\?\.news_refreshed_at/);
  assert.match(source, /const focusedNewsMonitorFresh = Number\.isFinite\(focusedNewsAgeMinutes\)/);
  assert.match(source, /News monitor/);
  assert.match(source, /Last checked/);
  assert.match(source, /Refresh due/);
});
