import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import { resolveDeterministicGovernedAction } from "../lib/operator/runtime/OperatorDeterministicActionRoutingRuntime.mjs";

const invoice = {
  key: "finance.accounts_receivable.CreateCustomerInvoice",
  mode: "write",
  operator_aliases: ["create invoice", "create an invoice", "make an invoice", "issue invoice"],
};

test("explicit invoice creation routes directly to governed capability intent", () => {
  const result = resolveDeterministicGovernedAction({
    message: "Create an invoice for Moonshine for 15,000 THB",
    capabilities: [invoice],
  });
  assert.equal(result?.route, "governed");
  assert.equal(result?.requires_mutation, true);
  assert.equal(result?.capability_key, invoice.key);
  assert.equal(result?.matched_alias, "create an invoice");
  assert.equal(result?.authorization_effect, "NONE");
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

test("synthetic routing checks deterministic action before semantic Intelligence", () => {
  const source = fs.readFileSync(new URL("../lib/operator/runtime/SyntheticIntelligenceTurnRuntime.js", import.meta.url), "utf8");
  const blockStart = source.indexOf("let semanticUnderstanding = null;");
  const block = source.slice(blockStart, blockStart + 2600);
  const deterministic = block.indexOf("resolveDeterministicGovernedAction");
  const semantic = block.indexOf("understandHumanBusinessPartnerTurn");
  assert.ok(deterministic >= 0 && semantic > deterministic);
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
