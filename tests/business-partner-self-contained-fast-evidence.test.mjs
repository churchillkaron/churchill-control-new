import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("context-free semantic preflight is current-message only and non-authoritative", async () => {
  const source = await readFile("lib/operator/runtime/OperatorHumanBusinessPartnerUnderstandingRuntime.js", "utf8");
  assert.match(source, /export async function preflightHumanBusinessPartnerTurn/);
  assert.match(source, /Classify only the CURRENT user message before any prior conversation is loaded/);
  assert.match(source, /messages: \[\{ role: "user", content: message \}\]/);
  assert.match(source, /allow_fast_escalation: false/);
  assert.match(source, /authorization_effect: "NONE"/);
});

test("self-contained preflight skips historical recovery and is reused downstream", async () => {
  const route = await readFile("app/api/operator/turn/route.js", "utf8");
  const synthetic = await readFile("lib/operator/runtime/SyntheticIntelligenceTurnRuntime.js", "utf8");
  assert.match(route, /const skipHistoricalContext = Boolean\(preflightSemanticUnderstanding\)/);
  assert.match(route, /reason: "SELF_CONTAINED_PREFLIGHT"/);
  assert.match(route, /const conversation = skipHistoricalContext\s*\? \[\]/);
  assert.match(route, /semanticUnderstanding: preflightSemanticUnderstanding/);
  assert.match(synthetic, /Object\.keys\(object\(effectiveOptions\.semanticUnderstanding\)\)\.length/);
  assert.match(synthetic, /&& !semanticUnderstanding\) \{/);
});

test("simple external facts use one governed research read before evidence-agent reasoning", async () => {
  const source = await readFile("lib/operator/runtime/OperatorFastConversationRuntime.js", "utf8");
  const fastIndex = source.indexOf("const simpleExternalFact = Boolean(");
  const researchIndex = source.indexOf('capability_key: "platform.research.search"', fastIndex);
  const reasoningIndex = source.indexOf("const runEvidenceTurn = () =>", fastIndex);
  assert.ok(fastIndex >= 0);
  assert.ok(researchIndex > fastIndex);
  assert.ok(reasoningIndex > researchIndex);
  assert.match(source, /deterministic_single_external_read: true/);
  assert.match(source, /minimum_sources: 1/);
  assert.match(source, /max_sources: 3/);
});

test("quick external facts remain state-neutral while normal new goals may still create project state", async () => {
  const route = await readFile("app/api/operator/turn/route.js", "utf8");
  const synthetic = await readFile("lib/operator/runtime/SyntheticIntelligenceTurnRuntime.js", "utf8");
  assert.match(route, /state_neutral_turn: externalFact/);
  assert.match(synthetic, /semanticUnderstanding\?\.state_neutral_turn !== true/);
});
