import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const source = fs.readFileSync(
  new URL("../lib/creative/director/runtime/CreativeDynamicTribunalRuntime.js", import.meta.url),
  "utf8",
);

test("strong reviewer discipline signals precede generic continuity", () => {
  const narrative = source.indexOf('if (/narrative|causal|story|emotion|arc/.test(mandate)) return "NARRATIVE"');
  const brand = source.indexOf('if (/brand|identity|logo|wordmark|signage|brand[-_ ]truth/.test(mandate)) return "BRAND_TRUTH"');
  const asset = source.indexOf('if (/asset|source|manifest|continuity/.test(mandate)) return "ASSET_CONTINUITY"');
  assert.ok(narrative >= 0 && brand > narrative && asset > brand);
});

test("reviewer id participates in discipline classification", () => {
  assert.match(source, /text\(reviewer\.id\).*text\(reviewer\.role\).*text\(reviewer\.mandate\)/);
});

test("brand production evidence does not treat assignment metadata as signage", () => {
  assert.ok(source.includes('const signal = /\\b(?:brand|logo|wordmark|sign|signage|text|chalkboard|typography|identity)\\b/i;'));
  assert.doesNotMatch(source, /const signal = \/brand\|logo\|wordmark\|sign\|text/);
});
