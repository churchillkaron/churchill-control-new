import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const front = fs.readFileSync("services/avantiqo-intelligence-modal/modal_front_app.py", "utf8");
const understanding = fs.readFileSync("lib/operator/runtime/OperatorHumanBusinessPartnerUnderstandingRuntime.js", "utf8");
const direct = fs.readFileSync("lib/platform/service-runtime/providers/avantiqo-intelligence/AvantiqoIntelligenceModalDirectRuntime.js", "utf8");

test("front intelligence uses the stronger owned 4B CPU model", () => {
  assert.match(front, /Qwen\/Qwen3-4B-GGUF:Q4_K_M/);
  assert.match(front, /bc640142c66e1fdd12af0bd68f40445458f3869b/);
  assert.match(direct, /Qwen\/Qwen3-4B-GGUF:Q4_K_M/);
});

test("front semantic classifier separates current message from reference context", () => {
  assert.match(front, /CURRENT MESSAGE TO CLASSIFY \(authoritative\):/);
  assert.match(front, /RECENT CONVERSATION \(reference only\):/);
  assert.match(front, /WORKING CONTEXT \(reference only\):/);
  assert.match(front, /Never inherit a previous customer\/project\/domain into a standalone current message/);
});

test("front semantic classifier emits a compact grammar-constrained meaning contract", () => {
  assert.match(front, /i=<chat\|inspect\|operate\|followup\|revise\|artifact\|unclear>/);
  assert.match(front, /request_body\["grammar"\]/);
  assert.match(front, /intent ::= "chat" \| "inspect" \| "operate"/);
});

test("runtime derives governed behavior from compact semantic meaning", () => {
  assert.match(understanding, /compactIntent === "inspect"/);
  assert.match(understanding, /compactIntent === "operate"/);
  assert.match(understanding, /artifact_intent: artifact \? "reuse_existing" : "none"/);
  assert.match(understanding, /requires_mutation: operation/);
  assert.match(understanding, /needs_current_evidence: inspection/);
});


test("front semantic classifier accepts immediate context from preflight without changing authority", () => {
  assert.match(front, /parsed_input\.get\("immediate"\)/);
  assert.match(understanding, /immediate_context_sufficient/);
  assert.match(understanding, /structural_context_reference/);
});

test("explicit Avantiqo product surfaces cannot be downgraded when compact mode is absent", () => {
  assert.match(understanding, /const compactMode = text\(source\.m/);
  assert.match(understanding, /\["light", "strategic", "creative", "analytical"\]\.includes\(compactMode\)/);
  assert.match(understanding, /domain === "product_engineering" && !inspection && !operation \? "strategic" : "light"/);
  assert.match(understanding, /execution_domain: domain/);
});

