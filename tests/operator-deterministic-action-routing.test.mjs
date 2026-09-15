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

test("synthetic routing binds one unambiguous governed action before enrichment and semantic Intelligence", () => {
  const source = fs.readFileSync(new URL("../lib/operator/runtime/SyntheticIntelligenceTurnRuntime.js", import.meta.url), "utf8");
  const preflight = source.indexOf("preflightDeterministicAction = resolveDeterministicGovernedAction");
  const organizationLoad = source.indexOf("await organizationProjectState(options)");
  const semantic = source.indexOf("understandHumanBusinessPartnerTurn", preflight);
  assert.ok(preflight >= 0 && organizationLoad > preflight && semantic > organizationLoad);
  assert.match(source, /fallback_only: true/);
  assert.match(source, /preflightPendingControlDecision \|\| preflightFastUnderstanding \|\| preflightDeterministicAction/);
  assert.match(source, /route: "governed"/);
  assert.match(source, /requires_mutation: true/);
  assert.match(source, /authorization_effect: "NONE"/);
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
