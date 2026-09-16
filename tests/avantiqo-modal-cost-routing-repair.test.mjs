import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const modal = fs.readFileSync("services/avantiqo-intelligence-modal/modal_app.py", "utf8");
const provider = fs.readFileSync("lib/platform/service-runtime/providers/avantiqo-intelligence/AvantiqoIntelligenceProvider.js", "utf8");
const registration = fs.readFileSync("lib/platform/service-runtime/providers/avantiqo-intelligence/AvantiqoIntelligenceProviderRegistration.js", "utf8");
const masterPlan = fs.readFileSync("lib/creative/director/runtime/CreativeMasterPlanRuntime.js", "utf8");

test("Deep H100 keeps a bounded warm window while retaining scale-to-zero", () => {
  assert.match(modal, /AVANTIQO_INTELLIGENCE_DEEP_SCALEDOWN_SECONDS[\s\S]*?\"60\"/);
  assert.match(modal, /def deep[\s\S]*?DEEP_SCALEDOWN_WINDOW_SECONDS|DEEP_SCALEDOWN_WINDOW_SECONDS[\s\S]*?def deep/);
  assert.match(modal, /min_containers=0/);
  assert.match(modal, /max_containers=1/);
  assert.match(provider, /deep_bounded_warm_idle_seconds: 60/);
  assert.match(registration, /deep_bounded_warm_idle_seconds: 60/);
});

test("bounded master-plan contract repair no longer defaults to Deep H100", () => {
  const start = masterPlan.indexOf("async function repairInvalidPlan");
  const end = masterPlan.indexOf("export const CreativeMasterPlanRuntime", start);
  const repair = masterPlan.slice(start, end);
  assert.match(repair, /operation: "MASTER_PLAN_CONTRACT_REPAIR_V1"/);
  assert.match(repair, /execution_lane: "fast"/);
});
