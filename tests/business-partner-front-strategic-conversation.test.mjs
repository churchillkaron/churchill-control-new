import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const front = fs.readFileSync("lib/platform/service-runtime/providers/avantiqo-intelligence/AvantiqoIntelligenceLocalRuntime.js", "utf8");
const localPolicy = fs.readFileSync("lib/platform/service-runtime/providers/avantiqo-intelligence/AvantiqoIntelligenceLocalPolicy.js", "utf8");
const understanding = fs.readFileSync("lib/operator/runtime/OperatorHumanBusinessPartnerUnderstandingRuntime.js", "utf8");

test("front intelligence uses the stronger owned 4B CPU model", () => {
  assert.match(front, /Qwen\/Qwen3-4B-GGUF:Q4_K_M/);
  assert.match(localPolicy, /Qwen\/Qwen3-4B-GGUF:Q4_K_M/);
  assert.match(front, /DEFAULT_RUNTIME_MODEL = "qwen3:4b-instruct"/);
});

test("front semantic classifier is executed on the owned local runtime", () => {
  assert.match(front, /INFRASTRUCTURE_PROVIDER = "AVANTIQO_LOCAL_NODE_V1"/);
  assert.match(front, /FRONT_RUNTIME_CONTRACT = "AVANTIQO_INTELLIGENCE_FRONT_CPU_WARM_V2"/);
  assert.match(front, /Do not reveal chain-of-thought/);
});

test("front semantic understanding remains compact and authority-neutral", () => {
  assert.match(understanding, /compactIntent/);
  assert.match(understanding, /\["chat", "inspect", "operate", "followup", "revise", "artifact", "unclear"\]/);
  assert.match(understanding, /requires_mutation: operation/);
});

test("runtime derives governed behavior from compact semantic meaning", () => {
  assert.match(understanding, /compactIntent === "inspect"/);
  assert.match(understanding, /compactIntent === "operate"/);
  assert.match(understanding, /artifact_intent: artifact \? "reuse_existing" : "none"/);
  assert.match(understanding, /requires_mutation: operation/);
  assert.match(understanding, /needs_current_evidence: inspection/);
});


test("front semantic classifier accepts immediate context from preflight without changing authority", () => {
  assert.match(understanding, /immediate_context_sufficient/);
  assert.match(understanding, /structural_context_reference/);
  assert.match(understanding, /allow_fast_escalation: false/);
});

test("explicit Avantiqo product surfaces cannot be downgraded when compact mode is absent", () => {
  assert.match(understanding, /const compactMode = text\(source\.m/);
  assert.match(understanding, /\["light", "strategic", "creative", "analytical"\]\.includes\(compactMode\)/);
  assert.match(understanding, /domain === "product_engineering" && !inspection && !operation \? "strategic" : "light"/);
  assert.match(understanding, /execution_domain: domain/);
});

