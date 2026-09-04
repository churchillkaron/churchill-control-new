import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = process.cwd();
const read = relativePath => fs.readFileSync(path.join(root, relativePath), "utf8");

const manifest = JSON.parse(read("lib/finance/runtime/financeCapabilityRuntimeManifest.json"));
const registry = read("lib/platform/erp-engine/renderers/RendererRegistry.js");
const policy = read("lib/finance/ui/FinancePrimaryActionPolicy.js");
const workspace = read("components/workspace/finance/FinanceFxRevaluationWorkCenter.jsx");
const runtime = read("app/api/finance/fx-revaluation/runtime/route.js");
const execute = read("app/api/finance/fx-revaluation/execute/route.js");
const plan = read("lib/finance/currencies/FinanceFxRevaluationPlan.js");

test("FX Revaluation is routed to its dedicated governed workspace", () => {
  assert.deepEqual(manifest.fx_revaluation, {
    kind: "records",
    scope: "entity",
    owner: "finance",
    api: "/api/finance/fx-revaluation/runtime",
    rowsKey: "runs",
    renderer: "FinanceFxRevaluationWorkCenter",
  });
  assert.match(registry, /FinanceFxRevaluationWorkCenter/);
  assert.match(registry, /registerRenderer\("FinanceFxRevaluationWorkCenter"/);
  assert.match(policy, /fx_revaluation:\s*\{ mode: "none" \}/);
});

test("FX Revaluation keeps a workflow-first UI without KPI card machinery", () => {
  assert.match(workspace, /New Revaluation/);
  assert.match(workspace, /Preview Revaluation/);
  assert.match(workspace, /Save Draft/);
  assert.match(workspace, /Post Revaluation/);
  assert.match(workspace, /Monetary accounts/);
  assert.match(workspace, /Historical carrying/);
  assert.match(workspace, /Prior FX/);
  assert.match(workspace, /Closing value/);
  assert.match(workspace, /Missing historical rate/);
  assert.match(workspace, /Completed accounting terms are immutable/);
  assert.doesNotMatch(workspace, /function Metric\s*\(/);
  assert.doesNotMatch(workspace, /<Metric\b/);
  assert.doesNotMatch(workspace, /reverse_posted_journal|finance_reverse_posted_journal_atomic/);
});

test("FX preview and draft creation are permissioned and entity scoped", () => {
  assert.match(runtime, /requireFinanceWorkspacePermission\(\{ capabilityId: "fx_revaluation", operation/);
  assert.match(runtime, /\.from\("finance_fx_revaluation_runs"\)/);
  assert.match(runtime, /\.from\("chart_of_accounts"\)/);
  assert.match(runtime, /\.eq\("organization_id", organizationId\)/);
  assert.match(runtime, /\.eq\("entity_id", entityId\)/);
  assert.match(runtime, /buildFxRevaluationPlan/);
  assert.match(runtime, /account_ids: accountIds\.map\(account_id => \(\{ account_id \}\)\)/);
});

test("shared FX plan prevents same-date duplicate revaluation and rate guessing", () => {
  assert.match(plan, /\.lte\("revaluation_date", revaluationDate\)/);
  assert.doesNotMatch(plan, /\.lt\("revaluation_date", revaluationDate\)/);
  assert.match(plan, /missing_historical_rate_count/);
  assert.match(plan, /can_post: blockingRows === 0/);
  assert.match(plan, /same date are included in carrying value/);
  assert.match(plan, /block posting instead of silently defaulting to 1\.0/);
  assert.doesNotMatch(plan, /row\.exchange_rate\s*\|\|\s*1/);
});

test("posting consumes the exact preview plan and remains governed", () => {
  assert.match(execute, /buildFxRevaluationPlan/);
  assert.match(execute, /if \(!plan\.can_post\)/);
  assert.match(execute, /permissionKey: "finance\.journals\.post"/);
  assert.match(execute, /financeGateway\(\{/);
  assert.match(execute, /idempotencyKey: `fx-revaluation:\$\{run\.id\}`/);
  assert.match(execute, /total_adjustment: plan\.total_adjustment/);
  assert.doesNotMatch(execute, /row\.exchange_rate\s*\|\|\s*1/);
  assert.doesNotMatch(execute, /loadPriorAdjustmentMap/);
});
