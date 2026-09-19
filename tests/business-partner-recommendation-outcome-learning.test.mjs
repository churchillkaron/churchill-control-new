import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const recommendation = fs.readFileSync("lib/operator/contracts/OperatorRecommendationState.js", "utf8");
const governed = fs.readFileSync("lib/operator/runtime/OperatorTurnRuntimeGoverned.js", "utf8");
const runtime = fs.readFileSync("lib/operator/runtime/OperatorTurnRuntime.js", "utf8");
const learning = fs.readFileSync("lib/operator/runtime/OperatorRecommendationOutcomeLearningRuntime.js", "utf8");

test("selected recommendation carries server-built outcome learning with zero authority", () => {
  assert.match(recommendation, /outcome_learning/);
  assert.match(recommendation, /const pendingExecution = \{[\s\S]*outcome_learning/);
  assert.match(learning, /authorization_effect: "NONE"/);
  assert.match(learning, /execution_authority: false/);
  assert.match(learning, /automatic_knowledge_promotion: false/);
});

test("recommendation learning projection is resolved only from server capability declaration", () => {
  assert.match(learning, /resolveOperatorMissionOutcomeLearningProjection/);
  assert.match(governed, /resolveOperatorRecommendationOutcomeLearning\(recommendation\)/);
  assert.doesNotMatch(governed, /model.*outcome_learning/i);
});

test("learning settles only after deterministic verified business effect", () => {
  assert.match(runtime, /state\.business_effect_verified && deterministicProof\.passed/);
  assert.match(runtime, /settleOperatorRecommendationOutcomeLearning/);
  assert.match(learning, /outcome\.business_effect_verified !== true/);
  assert.match(runtime, /recommendation_outcome_learning_authority_effect: "NONE"/);
});
