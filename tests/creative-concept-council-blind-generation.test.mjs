import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const source = fs.readFileSync("lib/creative/director/runtime/CreativeConceptCouncilRuntime.js", "utf8");

test("blind concept generation excludes incumbent master-plan creative decisions", () => {
  const start = source.indexOf("function blindConceptEvidencePacket");
  const end = source.indexOf("function directorPrompt", start);
  const block = source.slice(start, end);
  assert.ok(start >= 0 && end > start);
  assert.doesNotMatch(block, /deliverables: plan\.deliverables/);
  assert.doesNotMatch(block, /production_constraints: plan\.production/);
  assert.match(block, /mission_contract: positiveMissionContract\(input\)/);
});

test("blind concept generation receives positive mission contract instead of rejected lineage", () => {
  const start = source.indexOf("function positiveMissionContract");
  const end = source.indexOf("function blindConceptEvidencePacket", start);
  const block = source.slice(start, end);
  assert.doesNotMatch(block, /rejected_prior_lineage/);
  assert.doesNotMatch(block, /original_intent/);
  assert.match(block, /communication_goal/);
  assert.match(block, /desired_outcome/);
});

test("critics still receive full evidence after blind generation", () => {
  assert.match(source, /const evidence = fullEvidencePacket\(input, directed\)/);
  assert.match(source, /generateIndependentConcepts\(context, blindEvidence\)/);
  assert.match(source, /runIndependentCritics\(\s*context,\s*evidence,/);
});


test("positive mission text preserves requirements while stripping rejected lineage instructions", () => {
  assert.match(source, /positiveGenerativeInstruction/);
  assert.match(source, /objective: positiveGenerativeInstruction/);
  assert.match(source, /Every explicit requirement for scale, industry diversity, geographic truth/);
  const start = source.indexOf("function positiveGenerativeInstruction");
  const end = source.indexOf("function positiveMissionContract", start);
  const block = source.slice(start, end);
  assert.match(block, /rejected \(\?:creative \)\?lineage/);
  assert.match(block, /\^\(\?:do not\|don't\|never\|avoid\)/);
});


test("concept distinctness rejects shared governing-device phrases before critics", () => {
  assert.match(source, /sharedGoverningDevicePhrases/);
  assert.match(source, /INDEPENDENT_CONCEPTS_GOVERNING_DEVICE_COLLISION/);
  assert.match(source, /shared_governing_device_phrases/);
});
