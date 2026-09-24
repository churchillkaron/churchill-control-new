import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import test from "node:test";

const source = fs.readFileSync(new URL("../lib/creative/director/runtime/CreativeConceptCouncilRuntime.js", import.meta.url), "utf8");
const selectionSource = source.slice(source.indexOf("async function selectConcept("), source.indexOf("function activePlanForCouncilReasoning("));

function harness({ score = 95, settled = false } = {}) {
  let calls = 0;
  const result = { output: { selected_concept_id: "a", confidence: 95 }, result: {} };
  const select = vm.runInNewContext(`(${selectionSource})`, {
    WORLD_CLASS_CONCEPT_POLICY: { minimum_weighted_score: 92 },
    recoverSettledCouncilOperation: async () => settled ? result : null,
    reason: async () => { calls += 1; return result; },
    selectorPrompt: () => "test", text: value => String(value ?? "").trim(),
    list: value => Array.isArray(value) ? value : [],
    finite: Number, clamp: value => value,
    compactCouncilEvidence: value => value,
    conceptCriticSnapshot: value => value,
    hash: () => "selection-hash",
    rejectedLineageCollision: () => null, premiumFlagshipStoryCollision: () => null,
  });
  return { run: () => select({}, {}, [{ id: "a" }], [], [{ concept_id: "a", all_critics_passed: true, weighted_score: score }]), calls: () => calls };
}

test("fresh qualified selection uses the default policy without a ReferenceError", async () => {
  const h = harness();
  const result = await h.run();
  assert.equal(result.selection.selected_concept_id, "a");
  assert.equal(h.calls(), 1);
});

test("fresh below-policy selection fails closed before inference", async () => {
  const h = harness({ score: 91 });
  await assert.rejects(h.run(), /CREATIVE_CONCEPT_COUNCIL_NO_QUALIFYING_CONCEPT/);
  assert.equal(h.calls(), 0);
});

test("settled selection does not repeat inference", async () => {
  const h = harness({ settled: true });
  await h.run();
  assert.equal(h.calls(), 0);
});
