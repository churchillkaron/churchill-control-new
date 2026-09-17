import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const runtime = fs.readFileSync("lib/intelligence/runtime/AvantiqoGeneralIntelligenceTransferPracticeRuntime.js", "utf8");
const route = fs.readFileSync("app/api/internal/intelligence/continuous-learning/process/route.js", "utf8");

test("transfer practice requires a retained mastery candidate", () => {
  assert.match(runtime, /RETENTION_SCOPE/);
  assert.match(runtime, /metadata->>mastery_candidate","true"/);
  assert.match(runtime, /NO_MASTERY_CANDIDATE_SOURCE/);
});

test("transfer practice is cross-domain and evidence bounded", () => {
  assert.match(runtime, /domainOf\(r\)!==sourceDomain/);
  assert.match(runtime, /sourceEvidence\.length<2\|\|targetEvidence\.length<2/);
  assert.match(runtime, /Use both SOURCE and TARGET evidence/);
  assert.match(runtime, /source_evidence_used:sourceUsed/);
  assert.match(runtime, /target_evidence_used:targetUsed/);
});

test("transfer practice treats analogy as hypothesis not truth", () => {
  assert.match(runtime, /Treat analogy as a hypothesis only/);
  assert.match(runtime, /TRANSFER_HYPOTHESIS/);
  assert.match(runtime, /UNSUPPORTED_TRANSFER/);
  assert.match(runtime, /analogy_is_hypothesis_not_evidence:true/);
  assert.match(runtime, /automatic_transfer_inference:false/);
});

test("transfer practice is local 4B and cannot promote or train", () => {
  assert.match(runtime, /MODEL = "qwen3:4b-instruct"/);
  assert.match(runtime, /external_fallback_allowed:false/);
  assert.match(runtime, /LOCAL_4B_REQUIRED/);
  assert.match(runtime, /automatic_mastery_promotion:false/);
  assert.match(runtime, /automatic_knowledge_promotion:false/);
  assert.match(runtime, /automatic_model_training:false/);
  assert.match(runtime, /automatic_model_promotion:false/);
});

test("nightly route runs transfer practice after retention", () => {
  const retention = route.indexOf("runAvantiqoGeneralIntelligenceRetention()");
  const transfer = route.indexOf("runAvantiqoGeneralIntelligenceTransferPractice()");
  assert.ok(retention >= 0 && transfer > retention);
});
