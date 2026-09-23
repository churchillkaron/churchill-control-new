import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
const modal = fs.readFileSync("lib/platform/service-runtime/providers/avantiqo-intelligence/AvantiqoIntelligenceModalDirectRuntime.js", "utf8");
const worker = fs.readFileSync("services/avantiqo-intelligence-modal/modal_app.py", "utf8");

test("governed Modal overflow is scale-to-zero and never Front cognition", () => {
  assert.match(modal, /claimIntelligenceModalOverflowExecution/);
  assert.match(modal, /automatic_fallback_allowed: false/);
  assert.match(modal, /const LANES = new Set\(\["fast", "deep"\]\)/);
  assert.match(modal, /AVANTIQO_INTELLIGENCE_MODAL_FRONT_FORBIDDEN_LOCAL_ONLY/);
  assert.equal((worker.match(/min_containers=0/g) || []).length >= 2, true);
  assert.equal((worker.match(/max_containers=1/g) || []).length >= 2, true);
  assert.doesNotMatch(modal, /RunPod|runpod/);
});
