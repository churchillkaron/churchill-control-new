import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const runtime = fs.readFileSync(
  new URL("../lib/intelligence/runtime/AvantiqoContinuousLearningRuntime.js", import.meta.url),
  "utf8",
);
const launcher = fs.readFileSync(
  new URL("../scripts/run-avantiqo-continuous-learning-local.sh", import.meta.url),
  "utf8",
);
const runner = fs.readFileSync(
  new URL("../scripts/run-avantiqo-continuous-learning-local.mjs", import.meta.url),
  "utf8",
);

test("hourly continuous learning stages evidence instead of reusable knowledge", () => {
  assert.match(runtime, /AVANTIQO_CONTINUOUS_LEARNING_EVIDENCE_CANDIDATE_V1/);
  assert.match(runtime, /platform_learning_evidence_candidates/);
  assert.match(runtime, /stageTopicKnowledgeEvidenceCandidates/);
  assert.doesNotMatch(runtime, /replaceTopicKnowledge/);
  assert.match(runtime, /epistemic_state:\s*"EVIDENCE_CANDIDATE_NOT_RELEASED"/);
  assert.match(runtime, /reusable_platform_knowledge:\s*false/);
  assert.match(runtime, /knowledge_router_reuse_allowed:\s*false/);
  assert.match(runtime, /automatic_knowledge_promotion:\s*false/);
  assert.match(runtime, /explicit_final_promotion_required:\s*true/);
});

test("research reconciliation never retires previously released knowledge", () => {
  assert.match(runtime, /non_destructive_reconciliation:\s*true/);
  assert.match(runtime, /prior_released_knowledge_retired:\s*false/);
  assert.match(runtime, /reusable_platform_knowledge_written:\s*false/);
  assert.doesNotMatch(
    runtime,
    /\.update\(\{\s*active:\s*false,[\s\S]{0,300}?\.eq\("memory_scope",\s*KNOWLEDGE_SCOPE\)/,
  );
});

test("provider-free continuous learning launcher cannot use retired GPU slot controls", () => {
  assert.match(launcher, /AVANTIQO_CONTINUOUS_LEARNING_RUNPOD_USED=NO/);
  assert.doesNotMatch(launcher, /manage-avantiqo-intelligence-lane-slot-local\.mjs/);
  assert.doesNotMatch(launcher, /--activate-fast/);
  assert.doesNotMatch(launcher, /--restore-deep/);
  assert.doesNotMatch(launcher, /--provision/);
});

test("local learning certification fails closed on direct platform knowledge mutation", () => {
  assert.match(runner, /AVANTIQO_CONTINUOUS_LEARNING_LOCAL_RUN_V2/);
  assert.match(runner, /platform_learning_evidence_candidates/);
  assert.match(runner, /runpod_used:\s*false/);
  assert.match(runner, /platform_knowledge_count_unchanged/);
  assert.match(runner, /evidence_candidate_count_increased/);
  assert.match(
    runner,
    /AVANTIQO_CONTINUOUS_LEARNING_LOCAL_UNEXPECTED_PLATFORM_KNOWLEDGE_MUTATION/,
  );
  assert.match(runner, /reusable_platform_knowledge_written:\s*false/);
  assert.match(runner, /prior_released_knowledge_retired:\s*false/);
});
