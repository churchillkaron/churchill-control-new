import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const portfolioRuntime = await readFile(
  "lib/intelligence/runtime/AvantiqoProductEngineeringPortfolioRuntime.js",
  "utf8",
);
const portfolioCapability = await readFile(
  "lib/platform/capabilities/createProductEngineeringPortfolioCapability.js",
  "utf8",
);
const domainRegistry = await readFile(
  "lib/ubte/runtime/domains/DomainRuntimeRegistry.js",
  "utf8",
);
const selfEngineeringPolicy = await readFile(
  "lib/operator/runtime/OperatorSelfEngineeringPolicy.js",
  "utf8",
);
const progressRoute = await readFile(
  "app/api/operator/code/progress/route.js",
  "utf8",
);
const portfolioCard = await readFile(
  "components/operator/ProductEngineeringPortfolioCard.jsx",
  "utf8",
);
const sharedLiveCard = await readFile(
  "components/operator/CodeEngineeringIntelligenceLiveCard.jsx",
  "utf8",
);

const CONTRACT = "AVANTIQO_PRODUCT_ENGINEERING_PORTFOLIO_V1";

test("portfolio derives a bounded roadmap from existing repository-ranked candidates", () => {
  assert.match(portfolioRuntime, new RegExp(CONTRACT));
  assert.match(portfolioRuntime, /const MAX_NODES = 4/);
  assert.match(portfolioRuntime, /ranked_candidates/);
  assert.match(portfolioRuntime, /candidateToNode/);
  assert.match(portfolioRuntime, /ranked_candidates_reused_without_extra_planning_model_call:\s*true/);
  assert.match(portfolioRuntime, /current_main_is_authoritative:\s*true/);
});

test("portfolio dependencies come from deterministic repository overlap rather than model authority", () => {
  assert.match(portfolioRuntime, /EXACT_REPOSITORY_EVIDENCE_PATH_OVERLAP/);
  assert.match(portfolioRuntime, /STABLE_REPOSITORY_AREA_OVERLAP/);
  assert.match(portfolioRuntime, /dependency_basis:\s*"EXACT_PATH_OR_STABLE_AREA_OVERLAP"/);
  assert.match(portfolioRuntime, /provisional_until_fresh_main_reassessment:\s*index > 0/);
  assert.match(portfolioRuntime, /execution_serialized_by_main_only:\s*true/);
});

test("portfolio never fans out parallel source-mutating Code work", () => {
  assert.match(portfolioRuntime, /maximum_active_engineering_cycles:\s*1/);
  assert.match(portfolioRuntime, /parallel_code_execution_allowed:\s*false/);
  assert.match(portfolioRuntime, /branch_or_worktree_fanout_allowed:\s*false/);
  assert.match(portfolioCapability, /MAX_NEW_CYCLES_PER_INVOCATION = 1/);
  assert.match(portfolioCapability, /maximumNewEngineeringCyclesPerInvocation/);
  assert.match(portfolioCapability, /parallelCodeExecutionAllowed:\s*false/);
  assert.match(portfolioCapability, /branchOrWorktreeFanoutAllowed:\s*false/);
});

test("objective retirement requires explicit independently verified persistence", () => {
  assert.match(portfolioCapability, /verifiedCommitFromHandoff/);
  assert.match(portfolioCapability, /verified\.commit_sha/);
  assert.match(portfolioCapability, /stepResult\?\.commit\?\.commit_sha/);
  assert.doesNotMatch(
    portfolioCapability,
    /persistence_decision\?\.engineering_evidence\?\.current_main_head/,
  );
  assert.match(portfolioRuntime, /PRODUCT_ENGINEERING_PORTFOLIO_VERIFIED_COMMIT_REQUIRED/);
  assert.match(portfolioRuntime, /completePortfolioNodeAfterVerifiedPersistence/);
  assert.match(portfolioCapability, /fresh_main_reranking_after_verified_persistence:\s*true/);
});

test("fresh Product Engineering assessment remains authoritative over provisional portfolio focus", () => {
  assert.match(portfolioCapability, /capability:\s*"product_engineering_cycle"/);
  assert.match(portfolioCapability, /actual_cycle_objective/);
  assert.match(portfolioCapability, /objective_refined_by_fresh_cycle_assessment/);
  assert.match(portfolioCapability, /fresh_cycle_repository_assessment_authoritative:\s*true/);
  assert.match(portfolioCapability, /stale_patch_reused:\s*false/);
});

test("verified-main repetition fails closed instead of looping the portfolio", () => {
  assert.match(portfolioRuntime, /REPEATED_OBJECTIVE_AFTER_VERIFIED_PERSISTENCE/);
  assert.match(portfolioRuntime, /NEEDS_PRODUCT_REVIEW/);
  assert.match(portfolioRuntime, /automatic_execution_allowed:\s*!antiLoopTriggered/);
  assert.match(portfolioCapability, /PRODUCT_ENGINEERING_PORTFOLIO_ANTI_LOOP_REVIEW_REQUIRED/);
});

test("exact same business goal resumes actor-scoped server-owned portfolio state", () => {
  assert.match(portfolioCapability, /loadLatestProductEngineeringPortfolio/);
  assert.match(portfolioCapability, /samePortfolioIntent/);
  assert.match(portfolioCapability, /continueExistingPortfolio/);
  assert.match(portfolioCapability, /resumed_existing_portfolio:\s*true/);
  assert.match(portfolioRuntime, /actor_id:\s*actor/);
  assert.match(portfolioRuntime, /PRODUCT_ENGINEERING_PORTFOLIO_SCOPE_MISMATCH/);
});

test("portfolio is registered as a first-class UBTE Platform capability", () => {
  assert.match(domainRegistry, /createProductEngineeringPortfolioCapability/);
  assert.match(domainRegistry, /product_engineering_portfolio/);
  assert.match(domainRegistry, /capabilities:\s*\{/);
  assert.match(portfolioCapability, /capability:\s*"product_engineering_portfolio"/);
  assert.match(portfolioCapability, /operatorEnabled:\s*true/);
});

test("Business Partner routes broad goals to portfolio and bounded defects to one cycle", () => {
  assert.match(selfEngineeringPolicy, /PRODUCT_ENGINEERING_PORTFOLIO_KEY/);
  assert.match(selfEngineeringPolicy, /PRODUCT_ENGINEERING_CYCLE_KEY/);
  assert.match(selfEngineeringPolicy, /isAvantiqoEngineeringPortfolioRequest/);
  assert.match(selfEngineeringPolicy, /PORTFOLIO_BROAD_SCOPE_PATTERN/);
  assert.match(selfEngineeringPolicy, /resolveAvantiqoSelfEngineeringCapabilityKey/);
  assert.match(selfEngineeringPolicy, /Business Partner as the control plane/);
  assert.match(selfEngineeringPolicy, /Never fan out hidden branches or parallel source-mutating Code agents/);
});

test("Business Partner and Code Studio receive the same safe roadmap through existing progress feed", () => {
  assert.match(progressRoute, /loadLatestProductEngineeringPortfolio/);
  assert.match(progressRoute, /product_engineering_portfolio/);
  assert.match(progressRoute, /portfolio_current_main_is_authoritative:\s*true/);
  assert.match(progressRoute, /portfolio_queued_objectives_are_provisional:\s*true/);
  assert.match(progressRoute, /portfolio_parallel_code_execution_allowed:\s*false/);
  assert.match(sharedLiveCard, /ProductEngineeringPortfolioCard/);
  assert.match(sharedLiveCard, /progress\?\.product_engineering_portfolio/);
  assert.match(portfolioCard, /data-avantiqo-product-engineering-portfolio="true"/);
  assert.match(portfolioCard, /Business engineering roadmap/);
  assert.match(portfolioCard, /Current main is authoritative/);
});

test("portfolio has no implicit persistence, deployment, migration or knowledge authority", () => {
  assert.match(portfolioRuntime, /automatic_commit_allowed:\s*false/);
  assert.match(portfolioRuntime, /automatic_deploy_allowed:\s*false/);
  assert.match(portfolioRuntime, /automatic_knowledge_promotion:\s*false/);
  assert.match(portfolioRuntime, /authorization_effect:\s*"NONE"/);
  assert.match(portfolioCapability, /productionDeploymentAllowed:\s*false/);
  assert.match(portfolioCapability, /databaseMigrationExecutionAllowed:\s*false/);
  assert.match(portfolioCapability, /automaticRecursionAllowed:\s*false/);
  assert.match(portfolioCapability, /automatic_commit_performed:\s*false/);
  assert.match(progressRoute, /contains_raw_reasoning:\s*false/);
});
