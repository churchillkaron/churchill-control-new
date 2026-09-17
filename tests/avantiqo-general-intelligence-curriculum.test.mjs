import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const curriculum = fs.readFileSync("lib/intelligence/runtime/AvantiqoGeneralIntelligenceCurriculumRuntime.js", "utf8");
const route = fs.readFileSync("app/api/internal/intelligence/continuous-learning/process/route.js", "utf8");

test("general intelligence curriculum spans broad world domains", () => {
  for (const domain of ["economics", "accounting", "hospitality", "software-engineering", "statistics", "science", "law-regulation", "cybersecurity", "decision-science", "communication", "operations", "ai-ml"]) {
    assert.match(curriculum, new RegExp(`"${domain.replace(/[.*+?^${}()|[\\]\\]/g, "\\$&")}"`));
  }
  assert.match(curriculum, /education_scope: "WORLD_KNOWLEDGE"/);
  assert.match(curriculum, /trusted_source_policy: "PRIMARY_AUTHORITATIVE_OR_PEER_REVIEWED_PREFERRED"/);
});

test("world curriculum rotates one high-priority study topic per night", () => {
  assert.match(curriculum, /utcDayNumber\(nowMs\) % WORLD_CURRICULUM\.length/);
  assert.match(curriculum, /importance: isActive \? 0\.995 : adaptiveImportance/);
  assert.match(curriculum, /adaptive_practice_due: practiceDue/);
  assert.match(curriculum, /next_research_at: due/);
});

test("world knowledge remains evidence-gated and cannot self-train", () => {
  assert.match(curriculum, /automatic_knowledge_promotion: false/);
  assert.match(curriculum, /explicit_final_promotion_required: true/);
  assert.match(curriculum, /automatic_model_training: false/);
  assert.match(curriculum, /automatic_model_promotion: false/);
  assert.match(curriculum, /customer_private_content_allowed: false/);
});

test("nightly route can research and synthesize a fresh world topic in one cycle", () => {
  const research = route.indexOf("runAvantiqoContinuousLearningBatch({ limit })");
  const bridge = route.indexOf("postResearchEvidenceCandidateBridge");
  const mechanism = route.indexOf("postResearchMechanismFirstLearning");
  const synthesis = route.indexOf("runAvantiqoNightlyLearningSynthesis()");
  assert.ok(research >= 0 && bridge > research && mechanism > bridge && synthesis > mechanism);
});

test("model weakness never accelerates the paid research schedule", () => {
  assert.match(curriculum, /const due = new Date\(rotationDueMs\)\.toISOString\(\)/);
  assert.match(curriculum, /local_practice_only: practiceDue/);
  assert.match(curriculum, /research_due_to_model_failure: false/);
  assert.match(curriculum, /model_failure_can_trigger_research: false/);
  assert.match(curriculum, /research_trigger: isActive \? "ROTATION_FRESHNESS" : "SCHEDULED_ROTATION"/);
  assert.doesNotMatch(curriculum, /\(isActive \|\| practiceDue\) \? new Date\(nowMs\)/);
});
