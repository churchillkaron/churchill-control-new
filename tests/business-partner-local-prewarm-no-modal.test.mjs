import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const route = fs.readFileSync("app/api/operator/intelligence/prewarm/route.js", "utf8");

test("Business Partner page-load readiness is owned-local only and cannot wake paid fallback", () => {
  assert.match(route, /AVANTIQO_INTELLIGENCE_OPERATOR_PREWARM_V3/);
  assert.match(route, /AVANTIQO_INTELLIGENCE_LOCAL_READINESS_V1/);
  assert.match(route, /getIntelligenceLocalQueueHealth/);
  assert.match(route, /local_compute_required: true/);
  assert.match(route, /infrastructure_policy: "local_only"/);
  assert.match(route, /external_compute_available: false/);
  assert.match(route, /external_compute_started: false/);
  assert.match(route, /inference_requests_performed: 0/);
  assert.doesNotMatch(route, /ModalDirectRuntime/);
  assert.doesNotMatch(route, /prewarmIntelligenceModalFront/);
});
