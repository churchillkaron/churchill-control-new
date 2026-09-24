import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import { resolveDeterministicGovernedAction } from "../lib/operator/runtime/OperatorDeterministicActionRoutingRuntime.mjs";
import { findOperatorFastAction } from "../lib/operator/runtime/OperatorFastActionIndex.js";

const invoice = {
  key: "finance.accounts_receivable.CreateCustomerInvoice",
  mode: "write",
  operator_aliases: ["create invoice", "create an invoice", "make an invoice", "issue invoice"],
};

test("deterministic invoice routing is fallback-only", () => {
  const primary = resolveDeterministicGovernedAction({
    message: "Create an invoice for Moonshine for 15,000 THB",
    capabilities: [invoice],
  });
  assert.equal(primary, null);

  const fallback = resolveDeterministicGovernedAction({
    message: "Create an invoice for Moonshine for 15,000 THB",
    capabilities: [invoice],
    fallback_only: true,
  });
  assert.equal(fallback?.route, "governed");
  assert.equal(fallback?.requires_mutation, true);
  assert.equal(fallback?.capability_key, invoice.key);
  assert.equal(fallback?.authorization_effect, "NONE");
});

test("polite invoice command prefixes still route directly", () => {
  for (const message of [
    "Can you make an invoice for Moonshine?",
    "Could you create an invoice for Moonshine?",
    "Please make an invoice for Moonshine",
    "Can you make new invoice for Moonshine, same as last weeks but with new dates for Thursday and Sunday",
  ]) {
    const result = resolveDeterministicGovernedAction({ message, capabilities: [invoice], fallback_only: true });
    assert.equal(result?.capability_key, invoice.key);
  }
});

test("deterministic action routing excludes read and navigation capabilities", () => {
  const result = resolveDeterministicGovernedAction({
    message: "show invoices",
    capabilities: [{ key: "finance.customer_invoices.read", mode: "read", operator_aliases: ["show invoices"] }],
  });
  assert.equal(result, null);
});

test("ambiguous equal-strength write aliases fail closed", () => {
  const result = resolveDeterministicGovernedAction({
    message: "create invoice for Moonshine",
    capabilities: [invoice, { key: "other.invoice.create", mode: "write", operator_aliases: ["create invoice"] }],
  });
  assert.equal(result, null);
});

test("synthetic routing understands human meaning before capability routing", () => {
  const source = fs.readFileSync(new URL("../lib/operator/runtime/SyntheticIntelligenceTurnRuntime.js", import.meta.url), "utf8");
  const organizationLoad = source.indexOf("await organizationProjectState(options)");
  const semantic = source.indexOf("semanticUnderstanding = await understandHumanBusinessPartnerTurn(effectiveOptions)");
  const operatorTurn = source.indexOf("const operatorResult = await runOperatorTurn");
  assert.ok(organizationLoad >= 0 && semantic > organizationLoad && operatorTurn > semantic);
  assert.doesNotMatch(source, /preflightDeterministicAction = resolveDeterministicGovernedAction/);
  assert.doesNotMatch(source, /mutationIntentHint/);
  assert.match(source, /clarification_required: true/);
  assert.match(source, /semantic_understanding_unavailable: true/);
  assert.match(source, /understandHumanBusinessPartnerTurn\(effectiveOptions\)/);
});


test("operator execution context never overwrites a business subject party id", () => {
  const source = fs.readFileSync(new URL("../lib/operator/runtime/OperatorTurnRuntimeCore.js", import.meta.url), "utf8");
  assert.match(source, /businessPartyId = text\(businessPayload\.party_id \|\| businessPayload\.partyId\)/);
  assert.match(source, /party_id: businessPartyId \|\| partyId/);
  assert.match(source, /operator_party_id: partyId \|\| null/);
});

test("fast invoice action index preserves the exact governance contract", () => {
  const fast = findOperatorFastAction(invoice.key);
  assert.ok(fast);
  assert.equal(fast.mode, "write");
  assert.equal(fast.risk, "high");
  assert.equal(fast.context_scope, "entity");
  assert.equal(fast.auto_execute, false);
  assert.equal(fast.requires_confirmation, true);
  assert.equal(fast.transactional, true);
  assert.deepEqual(fast.permissions, ["finance.receivables.manage"]);
  assert.equal(fast.operator_verification?.capability_key, "finance.customer_invoices.read");
});

test("invoice deterministic routing does not weaken invoice governance", () => {
  const source = fs.readFileSync(new URL("../lib/finance/accounts-receivable/CreateCustomerInvoice/execute.js", import.meta.url), "utf8");
  assert.match(source, /operatorAliases:\s*\[/);
  assert.match(source, /"create an invoice"/);
  assert.match(source, /operatorAutoExecute:\s*false/);
  assert.match(source, /operatorRequiresConfirmation:\s*true/);
  assert.match(source, /contextScope:\s*"entity"/);
  assert.match(source, /risk:\s*"high"/);
  assert.match(source, /capability_key:\s*"finance\.customer_invoices\.read"/);
});
