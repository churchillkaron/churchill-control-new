import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const exam = fs.readFileSync("lib/intelligence/runtime/AvantiqoCapabilityCompetenceExamRuntime.js", "utf8");
const coverage = fs.readFileSync("lib/intelligence/runtime/AvantiqoCapabilityIntelligenceCurriculumRuntime.js", "utf8");
const route = fs.readFileSync("app/api/internal/intelligence/continuous-learning/process/route.js", "utf8");

test("capability competence exam tests selection governance missing input verification and authority", () => {
  for (const kind of ["SELECT_CAPABILITY","GOVERNANCE","MISSING_INPUT","VERIFICATION","AUTHORITY"]) assert.match(exam, new RegExp(`"${kind}"`));
  assert.match(exam, /ASK_OR_READ_REQUIRED_INPUT/);
  assert.match(exam, /Memory and prior success never grant authorization/);
});

test("capability competence exam is local 4B only and executes no tools", () => {
  assert.match(exam, /const MODEL = "qwen3:4b-instruct"/);
  assert.match(exam, /const LOCAL_INFRA = "AVANTIQO_LOCAL_NODE_V1"/);
  assert.match(exam, /external_fallback_allowed:false/);
  assert.match(exam, /tool_execution_used:false/);
  assert.match(exam, /automatic_execution_authorized:false/);
  assert.match(exam, /learningEvidenceFingerprint/);
  assert.match(exam, /learning_evidence_fingerprint:learningEvidenceFingerprint/);
});

test("competence is part of capability intelligence coverage", () => {
  assert.match(coverage, /const COMPETENCE_SCOPE = "platform_capability_competence_exams"/);
  assert.match(coverage, /competenceScore \* 0\.2/);
  assert.match(coverage, /CAPABILITY_COMPETENCE_UNPROVEN/);
  assert.match(coverage, /competence_score:coverage\.competence_score/);
});

test("nightly route runs competence exam after capability coverage exists", () => {
  const curriculumIndex = route.indexOf("reconcileAvantiqoCapabilityIntelligenceCurriculum()");
  const examIndex = route.indexOf("runAvantiqoCapabilityCompetenceExam()");
  assert.ok(curriculumIndex >= 0 && examIndex > curriculumIndex);
  assert.match(route, /capability_competence_exam: capabilityCompetenceExam/);
});
