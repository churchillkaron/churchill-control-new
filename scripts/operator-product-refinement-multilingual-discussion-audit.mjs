import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const path = "lib/operator/runtime/SyntheticIntelligenceTurnRuntime.js";
const source = await readFile(path, "utf8");

function requireFragment(fragment) {
  assert.ok(source.includes(fragment), `${path} missing ${fragment}`);
}

for (const fragment of [
  "REFINEMENT_STATUS_PHRASES",
  "REFINEMENT_DISCUSSION_PHRASES",
  "normalizedRefinementPhrase",
  "recommendationRefinementConversationClass",
  'if (conversationClass === "status")',
  'if (conversationClass === "discussion")',
  'status: "DISCUSSION"',
  "refinement_discussion_only: status === \"DISCUSSION\"",
  "execution_authorized: false",
  "automatic_execution_started: false",
  "current main before any engineering cycle",
  "recommendationRefinementConversationClass(options.message)",
]) {
  requireFragment(fragment);
}

const languages = {
  SV: ["vad rekommenderade du", "varfor", "kan du forklara det"],
  DE: ["was hast du empfohlen", "warum", "kannst du das erklaren"],
  FR: ["quelle etait ta recommandation", "pourquoi", "peux tu expliquer"],
  ES: ["cual fue tu recomendacion", "por que", "puedes explicar eso"],
  TH: ["คุณแนะนำอะไร", "ทำไม", "อธิบายหน่อย"],
};

for (const [language, phrases] of Object.entries(languages)) {
  for (const phrase of phrases) {
    assert.ok(
      source.includes(`\"${phrase}\"`),
      `${language} refinement phrase missing: ${phrase}`,
    );
  }
}

const preflightStart = source.indexOf(
  "function preflightRecommendationRefinement",
);
const postprocessStart = source.indexOf(
  "function applyRecommendationRefinementAfterTurn",
  preflightStart,
);
assert.ok(preflightStart >= 0 && postprocessStart > preflightStart);
const preflight = source.slice(preflightStart, postprocessStart);

for (const forbidden of [
  "runOperatorTurn(",
  "executeUbteCapability",
  "platform.code_ai_autonomous.execute",
  "platform.code_ai_commit.execute",
]) {
  assert.ok(
    !preflight.includes(forbidden),
    `multilingual refinement preflight must not execute through ${forbidden}`,
  );
}

assert.ok(
  preflight.includes("agreementState: object(options.agreementState)"),
  "discussion/status must preserve the exact stored agreement state",
);
assert.ok(
  preflight.includes("projectState: object(options.projectState)"),
  "discussion/status must preserve the current project state",
);
assert.ok(
  preflight.includes("this proposal has no execution authority"),
  "status response must state no execution authority",
);
assert.ok(
  preflight.includes("thinking-only refinement"),
  "discussion response must remain thinking-only",
);
assert.ok(
  preflight.includes("discussion wording itself cannot become execution authority"),
  "discussion text must never become action authority",
);

const decisionClassStart = source.indexOf(
  "function recommendationRefinementDecisionClass",
);
assert.ok(decisionClassStart >= 0);
assert.ok(
  source.indexOf("recommendationRefinementConversationClass", 0) < preflightStart,
  "localized refinement classifier must be defined before preflight",
);

for (const executionPhrase of [
  "gor det",
  "mach es",
  "fais le",
  "hazlo",
  "ทำเลย",
]) {
  assert.ok(
    !source.slice(
      source.indexOf("const REFINEMENT_DISCUSSION_PHRASES"),
      source.indexOf("function text(value"),
    ).includes(`\"${executionPhrase}\"`),
    `execution phrase must not be neutral refinement discussion: ${executionPhrase}`,
  );
}

const runStart = source.indexOf(
  "export async function runSyntheticIntelligenceTurn",
);
const preflightCall = source.indexOf(
  "preflightRecommendationRefinement(",
  runStart,
);
const operatorCall = source.indexOf(
  "const operatorResult = await runOperatorTurn",
  runStart,
);
assert.ok(
  preflightCall > runStart && preflightCall < operatorCall,
  "localized refinement preflight must resolve before Operator execution",
);

console.log("OPERATOR_PRODUCT_REFINEMENT_MULTILINGUAL_DISCUSSION_AUDIT=PASS");
console.log("OPERATOR_PRODUCT_REFINEMENT_MULTILINGUAL_LANGUAGES=SV_DE_FR_ES_TH");
console.log("OPERATOR_PRODUCT_REFINEMENT_MULTILINGUAL_STATUS=REFINEMENT_PRESERVED_READ_ONLY");
console.log("OPERATOR_PRODUCT_REFINEMENT_MULTILINGUAL_DISCUSSION=THINKING_ONLY_PRESERVED");
console.log("OPERATOR_PRODUCT_REFINEMENT_MULTILINGUAL_CONTROL=EXECUTION_PHRASES_EXCLUDED");
console.log("OPERATOR_PRODUCT_REFINEMENT_MULTILINGUAL_CURRENT_MAIN=REASSESSMENT_STILL_REQUIRED");
console.log("OPERATOR_PRODUCT_REFINEMENT_MULTILINGUAL_EXECUTION=DISABLED");
