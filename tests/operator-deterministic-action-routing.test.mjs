import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import { resolveDeterministicGovernedAction } from "../lib/operator/runtime/OperatorDeterministicActionRoutingRuntime.mjs";

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

test("synthetic routing binds one unambiguous governed action before semantic Intelligence", () => {
  const source = fs.readFileSync(new URL("../lib/operator/runtime/SyntheticIntelligenceTurnRuntime.js", import.meta.url), "utf8");
  const blockStart = source.indexOf("let semanticUnderstanding = null;");
  const block = source.slice(blockStart, blockStart + 2600);
  const deterministic = block.indexOf("resolveDeterministicGovernedAction");
  const semantic = block.indexOf("understandHumanBusinessPartnerTurn");
  assert.ok(deterministic >= 0 && semantic > deterministic);
  assert.match(block, /fallback_only: true/);
  assert.match(block, /route: "governed"/);
  assert.match(block, /requires_mutation: true/);
  assert.match(block, /authorization_effect: "NONE"/);
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
