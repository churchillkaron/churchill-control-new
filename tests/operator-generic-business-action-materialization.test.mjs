import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const understanding = fs.readFileSync("lib/operator/runtime/OperatorHumanBusinessPartnerUnderstandingRuntime.js", "utf8");
const synthetic = fs.readFileSync("lib/operator/runtime/SyntheticIntelligenceTurnRuntime.js", "utf8");
const core = fs.readFileSync("lib/operator/runtime/OperatorTurnRuntimeCore.js", "utf8");
const semantic = fs.readFileSync("lib/operator/runtime/OperatorSemanticActionPreparationRuntime.js", "utf8");
const reads = fs.readFileSync("lib/operator/runtime/OperatorFastReadIndex.js", "utf8");

test("business mutations are understood semantically rather than invoice-hardcoded", () => {
  assert.doesNotMatch(understanding, /deterministicExplicitBusinessMutationUnderstanding/);
  assert.doesNotMatch(understanding, /deterministic-business-mutation-v1/);
  assert.doesNotMatch(understanding, /finance\.accounts_receivable\.CreateCustomerInvoice/);
});

test("synthetic runtime does not special-case deterministic invoice execution", () => {
  assert.doesNotMatch(synthetic, /deterministicInvoiceFastPath/);
  assert.doesNotMatch(synthetic, /deterministic_exact_action_fast_path/);
});

test("single governed mutations use generic semantic action preparation", () => {
  assert.doesNotMatch(core, /prepareDeterministicGovernedAction/);
  assert.match(core, /semanticPreparation = await prepareSemanticGovernedAction/);
  assert.match(core, /const reasoning = semanticPreparation \|\| semanticMutationFailClosed/);
});

test("generic semantic action preparation plans reads then materializes from evidence", () => {
  assert.match(semantic, /planAction\(options, actions, reads\)/);
  assert.match(semantic, /executePlannedReads\(options, plannedReads, reads\)/);
  assert.match(semantic, /materializeAction\(options, action, plan, evidence\)/);
  assert.match(semantic, /available_actions: actions\.map\(compactCapability\)/);
  assert.match(semantic, /available_reads: reads\.map\(compactRead\)/);
  assert.match(semantic, /This planner grants no execution authority/);
});

test("customer invoice live read exposes supported generic filters and line inclusion", () => {
  const line = reads.split("\n").find((value) => value.includes('key: "finance.customer_invoices.read"')) || "";
  assert.match(line, /queryFields:\["id","invoice_id","partyId","party_id","include_lines","limit"\]/);
  assert.doesNotMatch(line, /invoice moonshine/);
});
