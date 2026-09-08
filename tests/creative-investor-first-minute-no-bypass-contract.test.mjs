import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const route = fs.readFileSync("app/api/creative/investor-first-minute-run/route.js", "utf8");
const certification = fs.readFileSync("lib/creative/certification/runtime/CreativePreProductionIntelligenceCertificationRuntime.js", "utf8");

test("legacy first-minute route cannot bypass canonical Studio intelligence", () => {
  assert.match(route, /CreativePreProductionIntelligenceCertificationRuntime\.inspect/);
  assert.match(route, /legacy_hardcoded_master_retired: true/);
  assert.match(route, /production_started: false/);
  assert.match(route, /generation_spawned: false/);
  assert.doesNotMatch(route, /ProductionRuntime\.runProduction/);
  assert.doesNotMatch(route, /prepareInvestorFirstMinuteProduction/);
  assert.doesNotMatch(route, /const master\s*=/);
  assert.match(certification, /PREPRODUCTION_CANONICAL_BRIEF_REQUIRED/);
  assert.match(certification, /PREPRODUCTION_VALIDATED_RESEARCH_REQUIRED/);
});

console.log("AVANTIQO_INVESTOR_FIRST_MINUTE_NO_BYPASS=PASS");
