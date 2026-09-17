import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const exam = fs.readFileSync("lib/intelligence/runtime/AvantiqoCapabilityCompetenceExamRuntime.js", "utf8");
const curriculum = fs.readFileSync("lib/intelligence/runtime/AvantiqoCapabilityIntelligenceCurriculumRuntime.js", "utf8");
const route = fs.readFileSync("app/api/internal/intelligence/continuous-learning/process/route.js", "utf8");

test("capability exam versions evidence from exact knowledge and outcome rows", () => {
  assert.match(exam, /knowledge_evidence:knowledgeEvidence/);
  assert.match(exam, /outcome_evidence:outcomeEvidence/);
  assert.match(exam, /evidence_version_uses_exact_rows:true/);
  assert.match(exam, /failure_fingerprint/);
  assert.match(exam, /verification_mode/);
});

test("internal product knowledge is synchronized before capability coverage", () => {
  const sync = route.indexOf("syncAvantiqoInternalProductKnowledge()");
  const pre = route.indexOf("capabilityIntelligenceCurriculumPreExam = await reconcileAvantiqoCapabilityIntelligenceCurriculum()");
  assert.ok(sync >= 0 && pre > sync);
});

test("capability curriculum reconciles again immediately after competence exam", () => {
  const examRun = route.indexOf("capabilityCompetenceExam = await runAvantiqoCapabilityCompetenceExam()");
  const post = route.indexOf("capabilityIntelligenceCurriculum = await reconcileAvantiqoCapabilityIntelligenceCurriculum()", examRun);
  assert.ok(examRun >= 0 && post > examRun);
  assert.match(route, /capability_intelligence_curriculum_pre_exam: capabilityIntelligenceCurriculumPreExam/);
});

test("coverage and exam hashing use an explicit crypto import", () => {
  assert.match(exam, /import \{ createHash \} from "node:crypto"/);
  assert.match(curriculum, /import \{ createHash \} from "node:crypto"/);
});
