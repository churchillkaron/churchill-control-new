#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const REPORT = process.env.FINANCE_CLOSEOUT_REPORT || "/tmp/AVANTIQO_FINANCE_CLOSEOUT_AUDIT.json";

const read = relative => fs.readFileSync(path.join(ROOT, relative), "utf8");
const exists = relative => fs.existsSync(path.join(ROOT, relative));

const baseRegistry = read("lib/platform/registry/erpRegistry.base.js");
const financeOverlay = read("lib/finance/registry/financeWorkspaceRegistry.js");
const registryOwner = read("lib/platform/registry/erpRegistry.js");
const manifest = JSON.parse(read("lib/finance/runtime/financeCapabilityRuntimeManifest.json"));
const policy = read("lib/finance/ui/FinancePrimaryActionPolicy.js");
const contracts = read("lib/finance/workspaces/FinanceWorkspaceContracts.js");
const serializer = read("lib/platform/registry/serializeCapability.js");
const rendererRegistry = read("lib/platform/erp-engine/renderers/RendererRegistry.js");
const actionContract = read("lib/platform/actions/ActionContract.js");
const formRegistry = read("lib/platform/forms/FormRegistry.js");
const financeFormContract = read("lib/platform/forms/FinanceFormContract.js");
const dynamicPage = read("app/(system)/workspace/[organizationId]/finance/[...financeRoute]/page.jsx");
const workspaceRoute = read("app/api/finance/workspaces/[capabilityId]/route.js");
const workCenter = read("components/workspace/master-data/MasterDataWorkCenter.jsx");
const runtimeWorkCenter = read("components/workspace/master-data/MasterDataRuntimeWorkCenter.jsx");

function financeSection(source) {
  const start = source.indexOf("finance: {");
  if (start < 0) return "";
  const markers = ["\n    people:", "\n    operations:", "\n    supply_chain:", "\n    commercial:"];
  const ends = markers.map(marker => source.indexOf(marker, start + 1)).filter(index => index > start);
  const end = ends.length ? Math.min(...ends) : source.length;
  return source.slice(start, end);
}

const financeRegistry = financeSection(baseRegistry);
const results = [];
const check = (name, passed, detail = {}) => {
  const row = { name, passed: Boolean(passed), ...detail };
  results.push(row);
  console.log(`${row.passed ? "PASS" : "FAIL"} ${name}${detail.message ? ` - ${detail.message}` : ""}`);
};

function capabilityBlock(id) {
  const marker = `id: "${id}"`;
  const start = financeRegistry.indexOf(marker);
  if (start < 0) return "";
  const next = financeRegistry.indexOf("{ id:", start + marker.length);
  return financeRegistry.slice(start, next > start ? next : start + 7000);
}

function policyBlock(id) {
  const pattern = new RegExp(`(?:^|\\n)\\s*${id}\\s*:\\s*\\{`);
  const match = pattern.exec(policy);
  if (!match) return "";
  const start = match.index;
  const next = policy.indexOf("\n  ", start + match[0].length);
  return policy.slice(start, next > start ? next : start + 2500);
}

function first(text, regex) {
  return text.match(regex)?.[1] || null;
}

function apiFile(api) {
  if (!api || !api.startsWith("/api/")) return null;
  if (api.startsWith("/api/finance/workspaces/")) return "app/api/finance/workspaces/[capabilityId]/route.js";
  const clean = api.split("?")[0];
  return `app${clean}/route.js`;
}

function formExists(id) {
  if (!id) return false;
  const quotedDouble = `"${id}"`;
  const quotedSingle = `'${id}'`;
  return formRegistry.includes(quotedDouble) || formRegistry.includes(quotedSingle) ||
    financeFormContract.includes(quotedDouble) || financeFormContract.includes(quotedSingle);
}

console.log("================ AVANTIQO FINANCE CLOSEOUT AUDIT ================");

check("Canonical registry owner imports base registry", registryOwner.includes("erpRegistry.base.js"));
check("Canonical registry owner applies Finance overlay", registryOwner.includes("applyFinanceWorkspaceRegistry"));
check("Finance registry exists in canonical base", Boolean(financeRegistry));
check("Finance manifest contains exactly 67 capabilities", Object.keys(manifest).length === 67, { actual: Object.keys(manifest).length });
check("Finance action policy exists", policy.includes("FINANCE_PRIMARY_ACTION_POLICY"));
check("Finance serializer consumes runtime manifest", serializer.includes("financeCapabilityRuntimeManifest.json"));
check("Finance serializer consumes workspace contracts", serializer.includes("getFinanceWorkspaceContract"));
check("Master-data Finance renderer registered", rendererRegistry.includes('registerRenderer("MasterDataRuntimeWorkCenter"'));
check("Finance report renderer registered", rendererRegistry.includes('registerRenderer("FinanceReportRuntimeWorkCenter"'));
check("Finance operational renderer registered", rendererRegistry.includes('registerRenderer("FinanceOperationalWorkCenter"'));
check("Action sanitizer rejects inert actions", actionContract.includes("isActionExecutable") && actionContract.includes("hasActionExecutionTarget"));
check("Dynamic Finance page resolves ERP registry route", dynamicPage.includes("getWorkspaceItemByRoute") && dynamicPage.includes("serializeCapability"));
check("Dynamic Finance page forwards organisation", dynamicPage.includes("organizationId={"));
check("Dynamic Finance page forwards entity", dynamicPage.includes("entityId={"));
check("Dynamic Finance page forwards period", dynamicPage.includes("periodId={"));
check("Workspace API authenticates organisation access", workspaceRoute.includes("requireOrganizationAccess"));
check("Workspace API supports GET", /export\s+async\s+function\s+GET\b/.test(workspaceRoute));
check("Workspace API supports POST", /export\s+async\s+function\s+POST\b/.test(workspaceRoute));
check("Workspace API supports PATCH", /export\s+async\s+function\s+PATCH\b/.test(workspaceRoute));
check("Workspace API supports DELETE", /export\s+async\s+function\s+DELETE\b/.test(workspaceRoute));
check("Finance UI has working row action dispatcher", workCenter.includes("handleMenuAction") && workCenter.includes("<MasterActionMenu"));
check("Finance UI resolves row menu from capability", runtimeWorkCenter.includes("resolveMenuActions"));
check("Finance UI resolves top menu from capability", runtimeWorkCenter.includes("resolveTopMenuActions"));
check("Finance UI validates required form fields", workCenter.includes("missingRequiredFields"));
check("Finance UI sends idempotency keys", workCenter.includes("idempotency_key"));
check("Finance registry contains no tenant boundary", !/tenant_id|tenantId/.test(financeRegistry));

const capabilityRows = [];
for (const [id, definition] of Object.entries(manifest)) {
  const block = capabilityBlock(id);
  const route = first(block, /route:\s*["']([^"']+)["']/);
  const explicitApi = definition.api || first(block, /(?:api|listApi):\s*["']([^"']+)["']/);
  const contract = new RegExp(`\\b${id}\\s*:`).test(contracts);
  const pBlock = policyBlock(id);
  const hasPolicy = Boolean(pBlock) || new RegExp(`\\b${id}\\s*:\\s*\\{`).test(policy);
  const policyMode = first(pBlock, /mode:\s*["']([^"']+)["']/) || first(policy.slice(Math.max(0, policy.indexOf(`${id}:`)), policy.indexOf(`${id}:`) + 1200), /mode:\s*["']([^"']+)["']/);
  const formIds = [...block.matchAll(/form:\s*["']([^"']+)["']/g), ...pBlock.matchAll(/form:\s*["']([^"']+)["']/g)].map(match => match[1]);
  const uniqueForms = [...new Set(formIds)];
  const reasons = [];

  if (!block) reasons.push("missing from canonical Finance registry");
  if (!route?.startsWith("/finance/")) reasons.push("missing canonical Finance route");
  if (!["records", "report", "process"].includes(definition.kind)) reasons.push("invalid runtime kind");
  if (!["organization", "entity"].includes(definition.scope)) reasons.push("invalid scope");
  if (!hasPolicy) reasons.push("missing primary action policy");
  if (!policyMode || !["create", "none", "action"].includes(policyMode)) reasons.push("invalid primary action mode");
  if (definition.kind === "process" && definition.renderer !== "FinanceOperationalWorkCenter") reasons.push("process renderer is not FinanceOperationalWorkCenter");
  if (definition.kind === "report" && definition.renderer && definition.renderer !== "FinanceReportRuntimeWorkCenter") reasons.push("unexpected report renderer");
  if (definition.kind === "records" && !explicitApi && !contract && !/create\s*:/.test(block) && !hasPolicy) reasons.push("no executable record evidence");

  if (explicitApi) {
    const file = apiFile(explicitApi);
    if (file && !exists(file)) reasons.push(`API route missing: ${file}`);
  }

  for (const formId of uniqueForms) {
    if (!formExists(formId)) reasons.push(`form not registered: ${formId}`);
  }

  const passed = reasons.length === 0;
  capabilityRows.push({ id, route, kind: definition.kind, scope: definition.scope, policyMode, api: explicitApi, contract, forms: uniqueForms, passed, reasons });
  check(`capability:${id}`, passed, { message: reasons.join("; ") || `${route} | ${definition.kind} | ${policyMode}` });
}

check("All 67 manifest capabilities are represented in UI registry", capabilityRows.filter(row => row.route?.startsWith("/finance/")).length === 67, {
  actual: capabilityRows.filter(row => row.route?.startsWith("/finance/")).length,
});
check("All 67 capabilities have primary action policy", capabilityRows.filter(row => row.policyMode).length === 67, {
  actual: capabilityRows.filter(row => row.policyMode).length,
});
check("All discovered explicit Finance forms are registered", capabilityRows.every(row => row.forms.every(formExists)));
check("Finance overlay only mutates canonical registry", financeOverlay.includes("getFinanceWorkspaceItem(registry") && financeOverlay.includes("return registry"));

const failed = results.filter(row => !row.passed);
const report = {
  suite: "Avantiqo Finance Closeout Audit",
  generatedAt: new Date().toISOString(),
  sourceOfTruth: {
    registry: "lib/platform/registry/erpRegistry.base.js",
    overlay: "lib/finance/registry/financeWorkspaceRegistry.js",
    owner: "lib/platform/registry/erpRegistry.js",
  },
  totals: { capabilities: capabilityRows.length, checks: results.length, passed: results.length - failed.length, failed: failed.length },
  failures: failed,
  capabilities: capabilityRows,
  results,
};

fs.writeFileSync(REPORT, `${JSON.stringify(report, null, 2)}\n`);
console.log("================ FINAL RESULT ================");
console.log(`CAPABILITIES=${capabilityRows.length}`);
console.log(`PASSED=${report.totals.passed}`);
console.log(`FAILED=${report.totals.failed}`);
console.log(`REPORT=${REPORT}`);
process.exitCode = failed.length === 0 ? 0 : 1;
