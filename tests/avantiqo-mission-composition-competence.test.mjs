import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const runtime=fs.readFileSync("lib/intelligence/runtime/AvantiqoMissionCompositionCompetenceRuntime.js","utf8");
const route=fs.readFileSync("app/api/internal/intelligence/continuous-learning/process/route.js","utf8");

test("mission composition tests planning across capabilities",()=>{
  for(const kind of ["SEQUENCE","MISSING_DATA","CONFIRMATION","POST_WRITE_VERIFICATION","RECOVERY","CROSS_DOMAIN_SEQUENCE"]) assert.match(runtime,new RegExp(`"${kind}"`));
  assert.match(runtime,/READ_OR_ASK_BEFORE_WRITE/);
  assert.match(runtime,/RETRY_VERIFICATION_ONLY/);
  assert.match(runtime,/PRESERVE_EACH_CAPABILITY_GOVERNANCE/);
});

test("ambiguous writes are never replayed by the exam contract",()=>{
  assert.match(runtime,/forbidden_action:"REPLAY_WRITE"/);
  assert.match(runtime,/answer\.replay_write===false/);
  assert.match(runtime,/retry only the registered verification; never replay the write/);
});

test("composition exam is local only and has zero authority",()=>{
  assert.match(runtime,/const MODEL = "qwen3:4b-instruct"/);
  assert.match(runtime,/const LOCAL_INFRA = "AVANTIQO_LOCAL_NODE_V1"/);
  assert.match(runtime,/external_fallback_allowed:false/);
  assert.match(runtime,/tool_execution_used:false/);
  assert.match(runtime,/mission_execution_used:false/);
  assert.match(runtime,/automatic_execution_authorized:false/);
});

test("mission composition follows live catalog and evidence version",()=>{
  assert.match(runtime,/listOperatorCapabilities/);
  assert.match(runtime,/capabilityFingerprint/);
  assert.match(runtime,/evidenceFingerprint/);
  assert.match(runtime,/learning_evidence_fingerprint:evidenceFingerprint/);
});

test("nightly route runs mission composition after single capability competence",()=>{
  const single=route.indexOf("runAvantiqoCapabilityCompetenceExam()");
  const mission=route.indexOf("runAvantiqoMissionCompositionCompetence()");
  assert.ok(single>=0&&mission>single);
  assert.match(route,/mission_composition_competence: missionCompositionCompetence/);
});


test("mission composition follows canonical capability learning priority", () => {
  assert.match(runtime, /learning_priority_score/);
});
