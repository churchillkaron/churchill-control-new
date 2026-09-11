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


test("blind research keeps facts but strips advisory creative constraints", () => {
  assert.match(source, /function blindResearchEvidence/);
  assert.match(source, /company_truth: source\.company_truth/);
  assert.match(source, /claims: list\(source\.claims\)/);
  assert.match(source, /sources: list\(source\.sources\)/);
  assert.match(source, /strategic_synthesis: strategic/);
  for (const key of ["must_not_do", "misuse_risk", "creative_consequence", "continuity_constraints"]) {
    assert.match(source, new RegExp(`"${key}"`));
  }
  assert.match(source, /creative_interpretation: "ADVISORY_ONLY"/);
  assert.match(source, /mission_contract: "HIGHEST"/);
});

test("director prompt gives explicit mission authority over research interpretation", () => {
  assert.match(source, /mission_contract as the highest creative authority/);
  assert.match(source, /resolve any conflict in favor of EVIDENCE\.mission_contract/);
});
