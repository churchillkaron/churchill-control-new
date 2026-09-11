import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
const source=fs.readFileSync("lib/creative/research/runtime/AutonomousResearchDirectorV4Runtime.js","utf8");
test("retry cost guard estimates the actual synthesis payload and retains aggregate cap",()=>{
  assert.match(source,/estimatedSynthesisInputTokens = Math\.max\(12000, Math\.ceil\(synthesisPrompt\.length \/ 3\)\)/);
  assert.match(source,/maximum_customer_price: budgetBeforeSynthesis\.remaining/);
  assert.match(source,/estimated_input_tokens: estimatedSynthesisInputTokens/);
  assert.doesNotMatch(source,/estimated_input_tokens: Number\(approval\.estimated_input_tokens \|\| 12000\)/);
});
