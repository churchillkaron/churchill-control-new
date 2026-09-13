import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const capabilityCatalog = await readFile(new URL("../lib/operator/runtime/OperatorCapabilityCatalog.js", import.meta.url), "utf8");
const navigationCatalog = await readFile(new URL("../lib/operator/runtime/OperatorNavigationCatalog.js", import.meta.url), "utf8");
const attachmentRouting = await readFile(new URL("../lib/platform/runtime/UniversalAttachmentRoutingRuntime.js", import.meta.url), "utf8");
const operatorTurn = await readFile(new URL("../app/api/operator/turn/route.js", import.meta.url), "utf8");
const createCoverage = await readFile(new URL("../lib/platform/registry/OperatorRegistryCreateCoverage.js", import.meta.url), "utf8");
const registryDomainRuntimes = await readFile(new URL("../lib/platform/registry/OperatorRegistryDomainRuntimes.js", import.meta.url), "utf8");
const domainRuntimeRegistry = await readFile(new URL("../lib/ubte/runtime/domains/DomainRuntimeRegistry.js", import.meta.url), "utf8");
const fastReads = await readFile(new URL("../lib/operator/runtime/OperatorFastReadIndex.js", import.meta.url), "utf8");

test("Business Partner execution comes from governed capabilities, not a separate Finance action list", () => {
  assert.match(capabilityCatalog, /listDomainRuntimeNames/);
  assert.match(capabilityCatalog, /getDomainRuntime/);
  assert.match(capabilityCatalog, /operator_enabled: operatorEnabled/);
  assert.match(capabilityCatalog, /input_schema:/);
  assert.match(capabilityCatalog, /permissions:/);
  assert.match(capabilityCatalog, /requires_confirmation:/);
});

test("Business Partner navigation stays in parity with active ERP registry surfaces", () => {
  assert.match(navigationCatalog, /ERP_REGISTRY/);
  assert.match(navigationCatalog, /for \(const \[workspaceId, workspace\]/);
  assert.match(navigationCatalog, /activeItem\(item\)/);
  assert.match(navigationCatalog, /capabilityId: item\.id/);
});

test("Finance uploads enter the authoritative operator turn and route to canonical Finance workspaces", () => {
  for (const symbol of ["conversationAttachmentSetIdFromRequest", "loadConversationAttachmentSet", "analyzeConversationAttachments", "routeAnalyzedAttachment", "prepareBankStatementAttachment", "preparePaidExpenseReceiptAttachment", "prepareVendorBillAttachment"]) {
    assert.match(operatorTurn, new RegExp(symbol));
  }
  assert.match(attachmentRouting, /itemId: "customer_invoices"/);
  assert.match(attachmentRouting, /itemId: "vendor_bills"/);
  assert.match(attachmentRouting, /itemId: "bank_reconciliation"/);
  assert.match(attachmentRouting, /itemId: "tax"/);
  assert.match(attachmentRouting, /itemId: "journals"/);
});

test("Finance registry creates are classified for Business Partner coverage instead of silently disappearing", () => {
  assert.match(createCoverage, /item\?\.create\?\.enabled !== true/);
  assert.match(createCoverage, /classification: "generated_endpoint"/);
  assert.match(createCoverage, /classification: "delegated_ubte_reference"/);
  assert.match(createCoverage, /classification: "unavailable"/);
  assert.match(createCoverage, /capability_key:/);
  assert.match(registryDomainRuntimes, /buildOperatorRegistryCreateCoverage/);
  assert.match(registryDomainRuntimes, /createCoverage: buildOperatorRegistryCreateCoverage/);
  assert.match(domainRuntimeRegistry, /Hand written capabilities win/);
  assert.match(domainRuntimeRegistry, /capabilities\[name\] = \{ \.\.\.\(capabilities\[name\] \|\| \{\}\), \.\.\.actions \}/);
});

test("Common Finance reads stay on the low-cost deterministic path", () => {
  for (const key of [
    "finance.customer_invoices.read",
    "finance.vendor_bills.read",
    "finance.bank_statements.read",
    "finance.journals.read",
    "finance.cash_management.read",
    "finance.trial_balance.read",
  ]) {
    assert.match(fastReads, new RegExp(key.replaceAll(".", "\\.")));
  }
  assert.match(fastReads, /ai_enabled: false/);
  assert.match(fastReads, /auto_execute: true/);
  assert.match(fastReads, /requires_confirmation: false/);
});
