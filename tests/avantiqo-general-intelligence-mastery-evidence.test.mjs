import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const runtime = fs.readFileSync("lib/intelligence/runtime/AvantiqoGeneralIntelligenceMasteryEvidenceRuntime.js", "utf8");
const transfer = fs.readFileSync("lib/intelligence/runtime/AvantiqoGeneralIntelligenceTransferPracticeRuntime.js", "utf8");
const route = fs.readFileSync("app/api/internal/intelligence/continuous-learning/process/route.js", "utf8");

test("mastery evidence requires repeated retention and transfer discipline", () => {
  assert.match(runtime, /strong\.length >= 3 && maxDay >= 7 && worstForgetting <= 0\.15/);
  assert.match(runtime, /metadata\.passed === true && Number\(metadata\.score \|\| 0\) >= 0\.8/);
  assert.match(runtime, /mastery_evidence_candidate: true/);
});

test("mastery evidence cannot grant stable mastery", () => {
  assert.match(runtime, /stable_mastery_granted: false/);
  assert.match(runtime, /existing_mastery_frontier_gate_still_required: true/);
  assert.match(runtime, /operational_validation_still_required: true/);
  assert.match(runtime, /reusable_released_knowledge_still_required: true/);
  assert.match(runtime, /automatic_mastery_promotion: false/);
});

test("unsupported transfer can expand the curriculum with bounded prerequisite research", () => {
  assert.match(transfer, /missing_prerequisites\[\]/);
  assert.match(runtime, /const MAX_PREREQUISITES = 3/);
  assert.match(runtime, /general_intelligence_prerequisite_agenda/);
  assert.match(runtime, /prerequisite_verified: false/);
  assert.match(runtime, /Treat the prerequisite as an unverified study proposal/);
});

test("self-expanding prerequisite learning remains evidence gated", () => {
  assert.match(runtime, /Prefer primary, authoritative, peer-reviewed, or standards-based evidence/);
  assert.match(runtime, /automatic_knowledge_promotion: false/);
  assert.match(runtime, /automatic_model_training: false/);
  assert.match(runtime, /customer_private_content_allowed: false/);
});

test("nightly route reconciles mastery evidence after transfer practice", () => {
  const transferIndex = route.indexOf("runAvantiqoGeneralIntelligenceTransferPractice()");
  const masteryIndex = route.indexOf("reconcileAvantiqoGeneralIntelligenceMasteryEvidence()");
  assert.ok(transferIndex >= 0 && masteryIndex > transferIndex);
  assert.match(route, /general_intelligence_mastery_evidence: generalIntelligenceMasteryEvidence/);
});
