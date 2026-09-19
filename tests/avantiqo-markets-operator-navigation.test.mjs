import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const source = fs.readFileSync(
  new URL("../components/workspace/solutions/markets/MarketsCommandCenter.jsx", import.meta.url),
  "utf8",
);

test("top market strip opens the selected symbol workspace", () => {
  assert.match(source, /href="#markets-research"/);
  assert.match(source, /onClick=\{\(\) => setSelectedSymbol\(item\.symbol\)\}/);
});

test("recent governed decisions open their symbol in Research", () => {
  assert.match(source, /onClick=\{\(\) => setSelectedSymbol\(decision\.symbol\)\}/);
});

test("market alerts navigate to the live Risk section", () => {
  assert.match(source, /href="#markets-risk"/);
  assert.match(source, /aria-label="Market alerts"/);
});

test("open risk events are prioritized for operator review", () => {
  assert.match(source, /const visibleRiskEvents = \[\.\.\.riskEvents\]/);
  assert.match(source, /return left\.status === "OPEN" \? -1 : 1/);
  assert.match(source, /Active risk events/);
  assert.match(source, /Review breaker controls/);
});
