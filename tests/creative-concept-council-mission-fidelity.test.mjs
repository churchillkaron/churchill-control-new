import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const source = fs.readFileSync(
  new URL("../lib/creative/director/runtime/CreativeConceptCouncilRuntime.js", import.meta.url),
  "utf8",
);

test("Concept Council gives mission fidelity veto authority", () => {
  assert.match(source, /id: "mission_fidelity"/);
  assert.match(source, /MISSION_FIDELITY_AND_NARRATIVE_CONTRACT_CRITIC/);
  assert.match(source, /minimum: 90/);
  assert.match(source, /Mission fidelity is veto authority/);
  assert.match(source, /replaces explicit mission content with a decorative signature device/);
});

test("Concept Council critic weights remain normalized", () => {
  const start = source.indexOf("const CRITIC_MANDATES = Object.freeze([");
  const end = source.indexOf("\n]);", start);
  const block = start >= 0 && end > start ? source.slice(start, end) : "";
  const weights = [...block.matchAll(/weight: ([0-9.]+)/g)].map((match) => Number(match[1]));
  assert.equal(weights.length, 5);
  assert.ok(Math.abs(weights.reduce((sum, value) => sum + value, 0) - 1) < 1e-9);
});
