#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const REPORT = process.env.FINANCE_AUDIT_REPORT || "/tmp/AVANTIQO_FINANCE_NORMAL_AUDIT.json";

function read(relative) {
  return fs.readFileSync(path.join(ROOT, relative), "utf8");
}

function exists(relative) {
  return fs.existsSync(path.join(ROOT, relative));
}

function financeSection(source) {
  const start = source.indexOf("finance: {");
  if (start < 0) return "";
  const end = source.indexOf("\n    people:", start);
  return end > start ? source.slice(start, end) : source.slice(start);
}

const manifestPath = "lib/finance/runtime/financeCapabilityRuntimeManifest.json";
const registryPath = "lib/platform/registry/erpRegistry.js";
const serializerPath = "lib/platform/registry/serializeCapability.js";
const contractsPath = "lib/finance/workspaces/FinanceWorkspaceContracts.js";
const policyPath = "lib/finance/ui/FinancePrimaryActionPolicy.js";
const formContractPath = "lib/platform/forms/FinanceFormContract.js";
const formRegistryPath = "lib/platform/forms/FormRegistry.js";
const rendererRegistryPath = "lib/platform/erp-engine/renderers/RendererRegistry.js";

const manifest = JSON.parse(read(manifestPath));
const registry = read(registryPath);
const financeRegistry = financeSection(registry);
const serializer = read(serializerPath);
const contracts = read(contractsPath);
const policy = read(policyPath);
const formContract = read(formContractPath);
const formRegistry = read(formRegistryPath);
const rendererRegistry = read(rendererRegistryPath);

const rows = [];

function capabilityBlock(id) {
  const marker = `id: "${id}"`;
  const start = financeRegistry.indexOf(marker);
  if (start < 0) return "";
  const next = financeRegistry.indexOf("{ id:", start + marker.length);
  return financeRegistry.slice(start, next > start ? next : start + 6000);
}

function firstMatch(text, pattern) {
  return text.match(pattern)?.[1] || null;
}

function apiFile(api) {
  if (!api?.startsWith("/api/")) return null;
  return `app${api}/route.js`;
}

function hasContract(id) {
  return new RegExp(`\\b${id}\\s*:`).test(contracts);
}

function hasPolicy(id) {
  return new RegExp(`\\b${id}\\s*:`).test(policy);
}

function formExists(formId) {
  if (!formId) return false;
  return formRegistry.includes(`"${formId}"`) ||
    formRegistry.includes(`'${formId}'`) ||
    formContract.includes(`"${formId}"`) ||
    formContract.includes(`'${formId}'`);
}

function addRow(row) {
  rows.push(row);
  const details = row.reasons.length ? ` - ${row.reasons.join("; ")}` : "";
  console.log(`${row.status.padEnd(7)} ${row.id.padEnd(28)} ${row.kind.padEnd(8)}${details}`);
}

console.log("============================================================");
console.log("AVANTIQO FINANCE NORMAL AUDIT");
console.log("============================================================");
console.log("No browser cookie. No access token. No running server required.");
console.log("");

const globalChecks = [
  ["Finance registry section exists", Boolean(financeRegistry)],
  ["Manifest contains 67 capabilities", Object.keys(manifest).length === 67],
  ["Serializer uses Finance manifest", serializer.includes("financeCapabilityRuntimeManifest.json")],
  ["Master data renderer registered", rendererRegistry.includes("MasterDataRuntimeWorkCenter")],
  ["Finance report renderer registered", rendererRegistry.includes("FinanceReportRuntimeWorkCenter")],
  ["Finance operational renderer registered", rendererRegistry.includes("FinanceOperationalWorkCenter")],
  ["No tenant boundary in Finance registry", !/tenant_id|tenantId/.test(financeRegistry)],
  ["No fixed currency or country defaults in Finance form contract", !/default(?:Value)?\s*:\s*["'](?:THB|USD|EUR|GBP|Thailand)["']/i.test(formContract)],
];

for (const [name, passed] of globalChecks) {
  console.log(`${passed ? "PASS" : "FAIL"}    ${name}`);
}

console.log("");
console.log("================ CAPABILITIES ================");

for (const [id, definition] of Object.entries(manifest)) {
  const block = capabilityBlock(id);
  const route = firstMatch(block, /route:\s*["']([^"']+)["']/);
  const registryApi = firstMatch(block, /api:\s*["']([^"']+)["']/);
  const listApi = firstMatch(block, /listApi:\s*["']([^"']+)["']/);
  const createApi = firstMatch(block, /createApi:\s*["']([^"']+)["']/);
  const formId = firstMatch(block, /form:\s*["']([^"']+)["']/);
  const explicitRenderer = firstMatch(block, /renderer:\s*["']([^"']+)["']/);
  const contract = hasContract(id);
  const actionPolicy = hasPolicy(id);
  const compiledWorkspaceApi = contract ? `/api/finance/workspaces/${id}` : null;
  const api = definition.api || registryApi || listApi || compiledWorkspaceApi;
  const apiPath = apiFile(api);
  const reasons = [];
  let score = 0;
  let maximum = 0;

  maximum += 1;
  if (block && route?.startsWith("/finance/")) score += 1;
  else reasons.push("missing Finance route");

  maximum += 1;
  if (["records", "report", "process"].includes(definition.kind)) score += 1;
  else reasons.push("invalid runtime class");

  maximum += 1;
  if (["organization", "entity"].includes(definition.scope)) score += 1;
  else reasons.push("invalid context scope");

  maximum += 1;
  const expectedRenderer = definition.renderer ||
    (definition.kind === "report" ? "FinanceReportRuntimeWorkCenter" :
      definition.kind === "process" ? "FinanceOperationalWorkCenter" :
      "MasterDataRuntimeWorkCenter");
  if (rendererRegistry.includes(expectedRenderer)) score += 1;
  else reasons.push(`renderer not registered: ${expectedRenderer}`);

  maximum += 1;
  const hasExecutableEvidence = Boolean(api || createApi || formId || contract || actionPolicy);
  if (hasExecutableEvidence) score += 1;
  else reasons.push("no API, form, workspace contract, or action policy");

  if (api) {
    maximum += 1;
    if (apiPath && exists(apiPath)) score += 1;
    else reasons.push(`API route file missing: ${apiPath || api}`);
  }

  if (formId) {
    maximum += 1;
    if (formExists(formId)) score += 1;
    else reasons.push(`form not registered: ${formId}`);
  }

  if (definition.kind === "report") {
    maximum += 1;
    if (expectedRenderer === "FinanceReportRuntimeWorkCenter" || explicitRenderer === "FinanceReportRuntimeWorkCenter") score += 1;
    else reasons.push("report not assigned to Finance report renderer");
  }

  if (definition.kind === "process") {
    maximum += 1;
    if (expectedRenderer === "FinanceOperationalWorkCenter" || explicitRenderer === "FinanceOperationalWorkCenter") score += 1;
    else reasons.push("process not assigned to Finance operational renderer");
  }

  const ratio = maximum ? score / maximum : 0;
  const status = ratio === 1 ? "PASS" : ratio >= 0.65 ? "PARTIAL" : "FAIL";

  addRow({
    id,
    name: firstMatch(block, /name:\s*["']([^"']+)["']/) || id,
    status,
    score,
    maximum,
    kind: definition.kind,
    scope: definition.scope,
    owner: definition.owner,
    route,
    renderer: expectedRenderer,
    api,
    form: formId,
    contract,
    actionPolicy,
    reasons,
  });
}

const totals = {
  capabilities: rows.length,
  passed: rows.filter(row => row.status === "PASS").length,
  partial: rows.filter(row => row.status === "PARTIAL").length,
  failed: rows.filter(row => row.status === "FAIL").length,
  globalPassed: globalChecks.filter(([, passed]) => passed).length,
  globalFailed: globalChecks.filter(([, passed]) => !passed).length,
};

const groups = {
  pass: rows.filter(row => row.status === "PASS").map(row => row.id),
  partial: rows.filter(row => row.status === "PARTIAL").map(row => ({ id: row.id, reasons: row.reasons })),
  fail: rows.filter(row => row.status === "FAIL").map(row => ({ id: row.id, reasons: row.reasons })),
};

const report = {
  suite: "Avantiqo Finance Normal Audit",
  generatedAt: new Date().toISOString(),
  scope: "Static end-to-end capability contract audit; no live browser or successful CRUD claims",
  totals,
  globalChecks: globalChecks.map(([name, passed]) => ({ name, passed })),
  groups,
  capabilities: rows,
};

fs.writeFileSync(REPORT, `${JSON.stringify(report, null, 2)}\n`);

console.log("");
console.log("================ FINAL RESULT ================");
console.log(`CAPABILITIES=${totals.capabilities}`);
console.log(`PASS=${totals.passed}`);
console.log(`PARTIAL=${totals.partial}`);
console.log(`FAIL=${totals.failed}`);
console.log(`GLOBAL_PASS=${totals.globalPassed}`);
console.log(`GLOBAL_FAIL=${totals.globalFailed}`);
console.log(`REPORT=${REPORT}`);

process.exitCode = totals.failed === 0 && totals.globalFailed === 0 ? 0 : 1;
