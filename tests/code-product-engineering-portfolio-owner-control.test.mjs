import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const runtime = await readFile(
  "lib/intelligence/runtime/AvantiqoProductEngineeringPortfolioOwnerControlRuntime.js",
  "utf8",
);
const portfolioCapability = await readFile(
  "lib/platform/capabilities/createProductEngineeringPortfolioCapability.js",
  "utf8",
);
const controlCapability = await readFile(
  "lib/platform/capabilities/createProductEngineeringPortfolioControlCapability.js",
  "utf8",
);
const controlRoute = await readFile(
  "app/api/operator/code/portfolio/control/route.js",
  "utf8",
);
const progressRoute = await readFile(
  "app/api/operator/code/progress/route.js",
  "utf8",
);
const card = await readFile(
  "components/operator/ProductEngineeringPortfolioCard.jsx",
  "utf8",
);
const liveCard = await readFile(
  "components/operator/CodeEngineeringIntelligenceLiveCard.jsx",
  "utf8",
);
const domainRegistry = await readFile(
  "lib/ubte/runtime/domains/DomainRuntimeRegistry.js",
  "utf8",
);

const CONTRACT = "AVANTIQO_PRODUCT_ENGINEERING_PORTFOLIO_OWNER_CONTROL_V1";

test("owner control is a separate durable actor and organization scoped control record", () => {
  assert.match(runtime, new RegExp(CONTRACT));
  assert.match(runtime, /product_engineering_portfolio_owner_control/);
  assert.match(runtime, /organization_id:\s*control\.organization_id/);
  assert.match(runtime, /actor_id:\s*control\.actor_id/);
  assert.match(runtime, /PRODUCT_ENGINEERING_PORTFOLIO_CONTROL_SCOPE_MISMATCH/);
  assert.match(runtime, /ordinary_memory_recall:\s*false/);
  assert.match(runtime, /reusable_platform_knowledge:\s*false/);
});

test("claimed objective is immutable and owner decisions control future work only", () => {
  assert.match(runtime, /LOCKED_NODE_STATES/);
  assert.match(runtime, /PRODUCT_ENGINEERING_PORTFOLIO_CONTROL_ACTIVE_OBJECTIVE_IMMUTABLE/);
  assert.match(runtime, /current_objective_immutable_once_claimed:\s*true/);
  assert.match(runtime, /owner_controls_future_execution_order_only:\s*true/);
  assert.match(card, /Claimed work is immutable/);
});

test("owner can pause resume promote defer remove and restore queued objectives", () => {
  for (const action of ["PAUSE", "RESUME", "PROMOTE", "DEFER", "REMOVE", "RESTORE"]) {
    assert.match(runtime, new RegExp(`"${action}"`));
    assert.match(controlCapability, new RegExp(`"${action}"`));
  }
  assert.match(card, /Pause roadmap/);
  assert.match(card, /Resume roadmap/);
  assert.match(card, /Make next/);
  assert.match(card, /Defer/);
  assert.match(card, /Remove/);
  assert.match(card, /Restore/);
});

test("promoted objectives cannot bypass repository dependencies", () => {
  assert.match(runtime, /dependencyBlocked/);
  assert.match(runtime, /owner_priority_blocked_by_dependency/);
  assert.match(card, /blocked by dependency until prerequisite is cleared/);
});

test("owner decisions survive fresh-main roadmap rebuild through objective fingerprints", () => {
  assert.match(runtime, /objectiveFingerprint/);
  assert.match(runtime, /owner_directive_matched_current_assessment/);
  assert.match(runtime, /unmatched_directive_count/);
  assert.match(card, /no longer match the fresh-main assessment/);
});

test("control revisions prevent silent multi-tab overwrite", () => {
  assert.match(runtime, /expectedControlRevision/);
  assert.match(runtime, /PRODUCT_ENGINEERING_PORTFOLIO_CONTROL_REVISION_CONFLICT/);
  assert.match(controlRoute, /expectedControlRevision/);
  assert.match(card, /expectedControlRevision:\s*controlRevision/);
});

test("portfolio executor re-applies owner control before every new Code cycle", () => {
  assert.match(portfolioCapability, /governedPortfolioForExecution/);
  assert.match(portfolioCapability, /ownerControlAllowsNewEngineeringCycle/);
  assert.match(portfolioCapability, /PORTFOLIO_PAUSED_BY_OWNER/);
  assert.match(portfolioCapability, /owner_control_reapplied_before_each_new_cycle:\s*true/);
  assert.match(portfolioCapability, /owner_pause_blocks_persistence_continuation_until_resumed:\s*true/);
  assert.match(portfolioCapability, /current_claimed_objective_immutable_to_owner_reordering:\s*true/);
});

test("owner control is available through authenticated API and Business Partner capability", () => {
  assert.match(controlRoute, /requireOrganizationAccess/);
  assert.match(controlRoute, /platform\.code\.ai\.execute/);
  assert.match(controlCapability, /capability:\s*"product_engineering_portfolio_control"/);
  assert.match(controlCapability, /operatorEnabled:\s*true/);
  assert.match(controlCapability, /operatorAutoExecute:\s*true/);
  assert.match(domainRegistry, /product_engineering_portfolio_control/);
  assert.match(domainRegistry, /createProductEngineeringPortfolioControlCapability/);
});

test("Home and Code Studio show the same governed portfolio state", () => {
  assert.match(progressRoute, /governProductEngineeringPortfolioWithOwnerControl/);
  assert.match(progressRoute, /attachOwnerControlToProductEngineeringPortfolioProjection/);
  assert.match(progressRoute, /portfolio_current_objective_immutable_once_claimed:\s*true/);
  assert.match(liveCard, /organizationId=\{organizationId\}/);
  assert.match(card, /data-avantiqo-product-engineering-owner-control="true"/);
});

test("owner control never grants source mutation commit deploy migration or knowledge authority", () => {
  assert.match(runtime, /raw_source_persisted:\s*false/);
  assert.match(runtime, /raw_patch_persisted:\s*false/);
  assert.match(runtime, /raw_reasoning_persisted:\s*false/);
  assert.match(runtime, /automatic_commit_allowed:\s*false/);
  assert.match(runtime, /production_deployment_allowed:\s*false/);
  assert.match(runtime, /authorization_effect:\s*"NONE"/);
  assert.match(controlCapability, /source_code_mutated:\s*false/);
  assert.match(controlCapability, /database_migrations_applied:\s*false/);
  assert.match(controlCapability, /automatic_knowledge_promotion:\s*false/);
  assert.match(controlRoute, /commit_performed:\s*false/);
  assert.match(controlRoute, /production_deployed:\s*false/);
});
