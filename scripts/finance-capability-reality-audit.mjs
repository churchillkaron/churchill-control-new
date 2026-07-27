#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const read = relative => fs.readFileSync(path.join(ROOT, relative), "utf8");
const exists = relative => fs.existsSync(path.join(ROOT, relative));
const manifest = JSON.parse(read("lib/finance/runtime/financeCapabilityRuntimeManifest.json"));
const registry = read("lib/platform/registry/erpRegistry.js");
const contracts = read("lib/finance/workspaces/FinanceWorkspaceContracts.js");
const policy = read("lib/finance/ui/FinancePrimaryActionPolicy.js");
const serializer = read("lib/platform/registry/serializeCapability.js");
const renderers = read("lib/platform/erp-engine/renderers/RendererRegistry.js");

function financeSection(source) {
  const start = source.indexOf("finance: {");
  if (start < 0) return "";
  const end = source.indexOf("\n    people:", start);
  return end > start ? source.slice(start, end) : source.slice(start);
}

const financeRegistry = financeSection(registry);
const results = [];
function check(name, passed, details = {}) {
  results.push({ name, passed: Boolean(passed), ...details });
  console.log(`${passed ? "PASS" : "FAIL"} ${name}${details.message ? ` - ${details.message}` : ""}`);
}

function registryCapability(id) {
  const marker = `id: "${id}"`;
  const start = financeRegistry.indexOf(marker);
  if (start < 0) return "";
  const next = financeRegistry.indexOf("{ id:", start + marker.length);
  return financeRegistry.slice(start, next > start ? next : start + 5000);
}

function apiFile(api) {
  if (!api || !api.startsWith("/api/")) return null;
  return `app${api}/route.js`;
}

console.log("================ FINANCE CAPABILITY REALITY AUDIT ================");
check("Manifest contains all 67 Finance capabilities", Object.keys(manifest).length === 67, {
  actual: Object.keys(manifest).length,
  expected: 67,
});
check("Finance registry section resolved", Boolean(financeRegistry));
check("Serializer consumes canonical manifest", serializer.includes("financeCapabilityRuntimeManifest.json"));
check("Report renderer registered", renderers.includes('registerRenderer("FinanceReportRuntimeWorkCenter"'));
check("Operational renderer registered", renderers.includes('registerRenderer("FinanceOperationalWorkCenter"'));

for (const [id, definition] of Object.entries(manifest)) {
  const block = registryCapability(id);
  const hasRegistry = Boolean(block);
  const routeMatch = block.match(/route:\s*["']([^"']+)["']/);
  const apiMatch = block.match(/api:\s*["']([^"']+)["']/);
  const manifestApi = definition.api || null;
  const api = manifestApi || apiMatch?.[1] || null;
  const hasContract = new RegExp(`\\b${id}\\s*:`).test(contracts);
  const hasPolicy = new RegExp(`\\b${id}\\s*:`).test(policy);
  const hasCreate = /create\s*:\s*\{[\s\S]*?(form|schema|api|endpoint)\s*:/.test(block);
  const hasRuntimeEvidence = Boolean(api || hasContract || hasPolicy || hasCreate);

  check(`${id}: registry route`, hasRegistry && routeMatch?.[1]?.startsWith("/finance/"), {
    route: routeMatch?.[1] || null,
  });
  check(`${id}: runtime class`, ["records", "report", "process"].includes(definition.kind), {
    kind: definition.kind,
  });
  check(`${id}: context scope`, ["organization", "entity"].includes(definition.scope), {
    scope: definition.scope,
  });
  check(`${id}: executable evidence`, hasRuntimeEvidence, {
    api,
    contract: hasContract,
    policy: hasPolicy,
    create: hasCreate,
  });

  if (api) {
    const file = apiFile(api);
    check(`${id}: API route exists`, !file || exists(file), { api, file });
  }

  if (definition.kind === "report") {
    check(`${id}: report renderer`, Boolean(definition.renderer || api || hasPolicy), {
      renderer: definition.renderer || null,
      api,
    });
  }

  if (definition.kind === "process") {
    check(`${id}: process renderer`, definition.renderer === "FinanceOperationalWorkCenter", {
      renderer: definition.renderer || null,
    });
  }
}

const passed = results.filter(result => result.passed).length;
const failed = results.length - passed;
const report = {
  suite: "Avantiqo Finance Capability Reality Audit",
  generatedAt: new Date().toISOString(),
  totals: { passed, failed, total: results.length },
  results,
};
const output = process.env.FINANCE_CAPABILITY_AUDIT_REPORT || "/tmp/AVANTIQO_FINANCE_CAPABILITY_REALITY_AUDIT.json";
fs.writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`);

console.log("================ FINAL RESULT ================");
console.log(`PASSED=${passed}`);
console.log(`FAILED=${failed}`);
console.log(`TOTAL=${results.length}`);
console.log(`REPORT=${output}`);
process.exitCode = failed === 0 ? 0 : 1;
