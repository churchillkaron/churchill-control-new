import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const source = fs.readFileSync("lib/operator/runtime/SyntheticIntelligenceTurnRuntime.js", "utf8");

test("automatic Business Partner self-healing rechecks exact live ownership before execution", () => {
  const functionStart = source.indexOf("async function escalateBusinessPartnerProductDefect");
  const gate = source.indexOf("await assertAvantiqoLiveExecutionCurrent({", functionStart);
  const execute = source.indexOf("return await executeUbteCapability({", functionStart);
  assert.ok(functionStart >= 0);
  assert.ok(gate > functionStart);
  assert.ok(execute > gate);
  assert.match(source.slice(functionStart, execute), /x-avantiqo-live-execution-id/);
  assert.match(source.slice(functionStart, execute), /BUSINESS_PARTNER_SELF_HEALING_SUPERSEDED_EXECUTION/);
});

test("ambiguous write reinspection remains a registered read-only verifier", () => {
  assert.match(source, /const verifier = catalog\.find\(\(item\) => item\.key === capabilityKey && item\.mode === "read"\)/);
});
