import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const exam = await readFile("lib/intelligence/runtime/AvantiqoGeneralIntelligenceExamRuntime.js", "utf8");
const curriculum = await readFile("lib/intelligence/runtime/AvantiqoGeneralIntelligenceCurriculumRuntime.js", "utf8");
const route = await readFile("app/api/internal/intelligence/continuous-learning/process/route.js", "utf8");

test("general intelligence exam is local 4B only", () => {
  assert.match(exam, /qwen3:4b-instruct/);
  assert.match(exam, /AVANTIQO_LOCAL_NODE_V1/);
  assert.match(exam, /external_fallback_allowed:false/);
  assert.match(exam, /resolveNightlyLearningLocalIdleState/);
});

test("exam uses deterministic evidence labels and scoring", () => {
  assert.match(exam, /SUPPORTED/);
  assert.match(exam, /CONTRADICTED/);
  assert.match(exam, /INSUFFICIENT/);
  assert.match(exam, /function grade\(/);
  assert.match(exam, /score:Number\(score\.toFixed\(4\)\)/);
  assert.match(exam, /passed:score>=0\.8/);
});

test("weak exam scores adapt future curriculum priority", () => {
  assert.match(curriculum, /latest_exam_weakness_score/);
  assert.match(curriculum, /adaptive_practice_due/);
  assert.match(curriculum, /!examPassed && weaknessScore >= 0\.2/);
  assert.match(curriculum, /latest_exam_passed: examPassed/);
  assert.match(curriculum, /adaptiveImportance/);
});

test("exam cannot train promote or release knowledge", () => {
  assert.match(exam, /automatic_model_training:false/);
  assert.match(exam, /automatic_model_promotion:false/);
  assert.match(exam, /automatic_knowledge_promotion:false/);
  assert.match(exam, /customer_private_content_included:false/);
  assert.match(exam, /raw_reasoning_persisted:false/);
});

test("nightly learning runs exam after local synthesis", () => {
  const synthesisIndex = route.indexOf("runAvantiqoNightlyLearningSynthesis");
  const examIndex = route.lastIndexOf("runAvantiqoGeneralIntelligenceExam");
  assert.ok(synthesisIndex >= 0);
  assert.ok(examIndex > synthesisIndex);
  assert.match(route, /general_intelligence_exam: generalIntelligenceExam/);
});
