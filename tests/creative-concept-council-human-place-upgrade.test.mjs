import test from "node:test";
import assert from "node:assert/strict";
import nextEnv from "@next/env";

const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd());
const { CreativeConceptCouncilRuntime } = await import("../lib/creative/director/runtime/CreativeConceptCouncilRuntime.js");

const concepts = ["concept-a", "concept-b", "concept-c"].map((id) => ({ id, title: id }));
const weightedCritics = [
  ["originality", 0.20, 90],
  ["music_energy", 0.25, 92],
  ["brand_commercial", 0.20, 88],
  ["production", 0.15, 86],
  ["mission_fidelity", 0.20, 94],
].map(([critic_id, weight, score]) => ({
  critic_id,
  weight,
  evaluations: concepts.map((concept) => ({ concept_id: concept.id, score, passed: true, mandatory_repairs: [], failures: [] })),
}));
function council() {
  return {
    contract: "INDEPENDENT_CREATIVE_CONCEPT_COUNCIL_V1",
    concepts,
    distinctness: { passed: true },
    critic_reports: structuredClone(weightedCritics),
    selection: { selected_concept_id: "concept-b", selected_concept: concepts[1] },
  };
}
function humanReport(passed = true) {
  return {
    critic_id: "human_place_patience",
    evaluations: concepts.map((concept) => ({
      concept_id: concept.id,
      score: passed || concept.id !== "concept-b" ? 92 : 70,
      passed: passed || concept.id !== "concept-b",
      mandatory_repairs: [],
      failures: passed || concept.id !== "concept-b" ? [] : ["patient consequence beat missing"],
      rejection_reason: null,
    })),
    ranking: ["concept-b", "concept-a", "concept-c"],
    critic_summary: "Independent human, place and patience review.",
  };
}

test("human/place/patience critic preserves weighted score while adding veto coverage", () => {
  const baseline = CreativeConceptCouncilRuntime.applyIndependentCriticReport({ council: council(), concepts, report: humanReport(true) });
  assert.equal(baseline.added_critic_id, "human_place_patience");
  assert.equal(baseline.council.critic_reports.length, 6);
  assert.equal(baseline.selected_scorecard.weighted_score, 90.3);
  assert.equal(baseline.selected_concept_passed, true);
  assert.equal(baseline.selected_scorecard.critic_scores.human_place_patience, 92);
});

test("zero-weight human/place/patience critic still vetoes selected concept", () => {
  const result = CreativeConceptCouncilRuntime.applyIndependentCriticReport({ council: council(), concepts, report: humanReport(false) });
  assert.equal(result.selected_scorecard.weighted_score, 90.3);
  assert.equal(result.selected_concept_passed, false);
  assert.equal(result.selected_scorecard.all_critics_passed, false);
});
