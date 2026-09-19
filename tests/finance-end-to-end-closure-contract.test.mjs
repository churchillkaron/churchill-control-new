import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = process.cwd();
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");
const exists = (p) => fs.existsSync(path.join(root, p));
const registry = read("lib/platform/registry/erpRegistry.base.js");
const manifest = JSON.parse(read("lib/finance/runtime/financeCapabilityRuntimeManifest.json"));
const policy = read("lib/finance/ui/FinancePrimaryActionPolicy.js");
const contracts = read("lib/finance/workspaces/FinanceWorkspaceContracts.js");
const serializer = read("lib/platform/registry/serializeCapability.js");
const renderer = read("lib/platform/erp-engine/renderers/RendererRegistry.js");
const actionContract = read("lib/platform/actions/ActionContract.js");
const processCenter = read("components/workspace/finance/FinanceAccountantProcessWorkCenter.jsx");
const practiceTower = read("components/workspace/finance/FinancePracticeControlTower.jsx");
const workspaceApi = read("app/api/finance/workspaces/[capabilityId]/route.js");

function financeBlock() {
  const start = registry.indexOf("\n    finance: {");
  const end = registry.indexOf("\n    services: {", start);
  assert.ok(start >= 0 && end > start);
  return registry.slice(start, end);
}


function registryItemBlock(id) {
  const block = financeBlock();
  const marker = `id: "${id}"`;
  const markerIndex = block.indexOf(marker);
  assert.ok(markerIndex >= 0, `Missing Finance registry item ${id}`);
  const start = block.lastIndexOf("{", markerIndex);
  const next = block.indexOf("\n            { id:", markerIndex + marker.length);
  return block.slice(start, next >= 0 ? next : block.length);
}

function policyBlock(id) {
  const start = policy.search(new RegExp(`^  ${id}:`, "m"));
  assert.ok(start >= 0, `Missing primary action policy for ${id}`);
  const tail = policy.slice(start);
  const next = tail.slice(1).search(/^  [a-z0-9_]+:/m);
  return next >= 0 ? tail.slice(0, next + 1) : tail;
}

test("all 67 Finance capabilities are live at source", () => {
  assert.equal(Object.keys(manifest).length, 67);
  const block = financeBlock();
  assert.doesNotMatch(block, /status:\s*"(?:planned|coming-soon|coming_soon|blocked|disabled|unavailable|partial|unproven)"/i);
  assert.doesNotMatch(practiceTower, /label="Planned"/);
});

test("every controlled Finance action points to a real endpoint or report authority", () => {
  for (const id of Object.keys(manifest)) {
    const segment = policyBlock(id);
    const mode = segment.match(/mode:\s*"([^"]+)"/)?.[1];
    assert.ok(["none", "create", "action"].includes(mode), `${id} has invalid action mode`);
    if (mode !== "action") continue;
    const type = segment.match(/type:\s*"([^"]+)"/)?.[1] || "";
    const endpoint = segment.match(/(?:endpoint|api):\s*"([^"]+)"/)?.[1] || null;
    if (type === "report" || type === "reports") continue;
    assert.ok(endpoint, `${id} controlled action has no endpoint`);
    const route = path.join("app", endpoint.replace(/^\//, ""), "route.js");
    assert.ok(exists(route), `${id} endpoint is missing route.js: ${endpoint}`);
  }
});

test("every Finance process has a real executable action", () => {
  for (const [id, runtime] of Object.entries(manifest)) {
    if (runtime.kind !== "process") continue;
    const segment = policyBlock(id);
    assert.match(segment, /mode:\s*"action"/, `${id} process is not action-backed`);
    assert.match(segment, /(?:endpoint|api):\s*"\/api\/finance\//, `${id} process has no Finance endpoint`);
  }
  assert.match(processCenter, /actions\.length === 0/);
});

test("closed Finance create workspaces are schema-backed through the generic governed API", () => {
  for (const id of Object.keys(manifest)) {
    const segment = policyBlock(id);
    if (!/mode:\s*"create"/.test(segment)) continue;
    const hasClosedContract = new RegExp(`^  ${id}:\\s*(?:entityWorkspace|organizationWorkspace)\\(`, "m").test(contracts);
    const hasExplicitCreate = /create:\s*\{/.test(segment);
    const registrySegment = registryItemBlock(id);
    const registryCreate = /create:\s*\{[\s\S]*?enabled:\s*true/.test(registrySegment);
    assert.ok(hasClosedContract || hasExplicitCreate || registryCreate, `${id} create action has no schema/form authority`);
  }
  assert.match(serializer, /schema: explicitCreate\?\.schema \|\| defaultCreate\.schema/);
  assert.match(serializer, /endpoint = `\/api\/finance\/workspaces\/\$\{capability\.id\}`/);
  assert.match(workspaceApi, /validateRequiredFields/);
  assert.match(workspaceApi, /validateFinanceWorkspaceWrite/);
});

test("Finance menus expose only executable actions", () => {
  assert.match(renderer, /sanitizeCapability/);
  assert.match(renderer, /sanitizeActionList/);
  assert.match(actionContract, /isActionExecutable/);
  assert.match(actionContract, /hasActionExecutionTarget/);
  assert.match(actionContract, /hasUsableCreateAction/);
  assert.match(actionContract, /IMMUTABLE_CREATE_BACKED_WORKSPACES/);
});

test("canonical Collections archive target uses the converged table", () => {
  assert.match(workspaceApi, /"customer_collection_cases"/);
  assert.doesNotMatch(workspaceApi, /"finance_collection_cases"/);
});
