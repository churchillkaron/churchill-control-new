import test from "node:test";
import assert from "node:assert/strict";
import { CreativeFilmVisualJourneyRuntime } from "../lib/creative/video/runtime/CreativeFilmVisualJourneyRuntime.js";

const shots = [
  { id: "s1", energy_level: 20, tempo_role: "SILENCE", camera: { framing: "extreme close detail" }, lighting: { contrast: "low-key restrained", colour: "cool moonlight" } },
  { id: "s2", energy_level: 45, tempo_role: "BUILD", camera: { framing: "medium" }, lighting: { contrast: "controlled medium", colour: "neutral daylight" } },
  { id: "s3", energy_level: 82, tempo_role: "PEAK", purpose: "hero reveal payoff", camera: { framing: "wide establishing" }, lighting: { contrast: "high sculptural", colour: "warm controlled practicals" } },
];

test("film visual journey creates color, energy and scale progression", () => {
  const journey = CreativeFilmVisualJourneyRuntime.build({ shots, scenes: [{ id: "scene-1" }] });
  const gate = CreativeFilmVisualJourneyRuntime.evaluate(journey);
  assert.equal(gate.passed, true);
  assert.deepEqual(journey.shot_states.map((s) => s.scale_band), ["MICRO", "HUMAN", "WORLD"]);
  assert.equal(journey.shot_states[0].silence_state, true);
  assert.equal(journey.provider_may_flatten_visual_progression, false);
  assert.equal(journey.release_blocking, true);
});

test("film visual journey rejects flat repeated visual scale and payoff", () => {
  const flat = CreativeFilmVisualJourneyRuntime.build({
    shots: [1, 2, 3, 4].map((i) => ({ id: `f${i}`, energy_level: 50, tempo_role: "HOLD", camera: { framing: "medium" } })),
  });
  const gate = CreativeFilmVisualJourneyRuntime.evaluate(flat);
  assert.equal(gate.passed, false);
  assert.ok(gate.failures.includes("FILM_VISUAL_JOURNEY_SCALE_TOO_FLAT"));
  assert.ok(gate.failures.includes("FILM_VISUAL_JOURNEY_PAYOFF_NOT_DISTINCT"));
});
