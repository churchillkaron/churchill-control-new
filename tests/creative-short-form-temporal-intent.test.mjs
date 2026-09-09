import assert from "node:assert/strict";
import test from "node:test";
import { CreativeShortFormTemporalPlanningRuntime } from "../lib/creative/director/runtime/CreativeShortFormTemporalPlanningRuntime.js";

function governed(prompt, operation = "TEMPORAL_SCENE_ARCHITECTURE_V1") {
  return CreativeShortFormTemporalPlanningRuntime.governedInput({
    category: "CREATIVE_DIRECTION",
    service_id: "ai.reasoning.execute",
    metadata: { operation, creative_project_id: "project-1" },
    input: { prompt },
  });
}

test("explicit one-shot language becomes a one-scene continuous-shot contract", () => {
  const prompt = `MASTER DURATION: 5 seconds\nSCENE COUNT: minimum 3, preferred 3, maximum 3\nPROJECT\n{"objective":"Create one five-second world-class cinematic offshore hero shot"}`;
  const result = governed(prompt);
  assert.match(result.input.prompt, /SCENE COUNT: minimum 1, preferred 1, maximum 1/);
  assert.equal(result.metadata.short_form_temporal_scale.single_continuous_shot, true);
  assert.equal(result.metadata.short_form_temporal_scale.explicit_project_constraint, true);
});

test("single shot and one take variants resolve to the same structured intent", () => {
  for (const wording of ["single shot", "single continuous shot", "one take", "single take"]) {
    const result = governed(`MASTER DURATION: 5 seconds\nSCENE COUNT: minimum 3, preferred 3, maximum 3\n${wording}`);
    assert.equal(result.metadata.short_form_temporal_scale.scene_count.preferred, 1, wording);
  }
});

test("ordinary short-form wording does not force a one-shot contract", () => {
  const prompt = `MASTER DURATION: 5 seconds\nSCENE COUNT: minimum 3, preferred 3, maximum 3\nCreate a cinematic offshore film`;
  const result = governed(prompt);
  assert.equal(result.input.prompt, prompt);
  assert.equal(result.metadata?.short_form_temporal_scale, undefined);
});
