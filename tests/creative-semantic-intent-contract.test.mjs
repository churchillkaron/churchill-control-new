import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const semantic = fs.readFileSync(
  "lib/creative/missions/runtime/CreativeHumanIntentUnderstandingRuntime.js",
  "utf8",
);
const command = fs.readFileSync("scripts/creative-command.mjs", "utf8");
const council = fs.readFileSync(
  "lib/creative/director/runtime/CreativeConceptCouncilRuntime.js",
  "utf8",
);
const gate = fs.readFileSync(
  "lib/creative/director/validation/CreativeMasterPlanDecisionGate.js",
  "utf8",
);

test("Creative Studio interprets meaning before deterministic execution", () => {
  assert.match(semantic, /Understand the user's creative meaning/);
  assert.match(semantic, /Do not classify from keywords, regexes, command phrases/);
  assert.match(semantic, /authorization_effect: "NONE"/);
  assert.match(command, /CreativeHumanIntentUnderstandingRuntime\.understand/);
  assert.doesNotMatch(command, /function inferDuration/);
  assert.doesNotMatch(command, /function inferChannels/);
  assert.doesNotMatch(command, /function inferProductionType/);
  assert.doesNotMatch(command, /function verticalRequested/);
});

test("organization scope comes from Business Context, not language matching", () => {
  assert.match(command, /CREATIVE_BUSINESS_CONTEXT_REQUIRED/);
  assert.doesNotMatch(command, /significantTokens/);
  assert.doesNotMatch(command, /CREATIVE_ORGANIZATION_AMBIGUOUS/);
});

test("Council carries semantic mission meaning into resumed and fresh plans", () => {
  assert.match(council, /function withSemanticMissionContract/);
  assert.match(council, /semantic_mission_contract: positiveMissionContract\(input\)/);
  assert.match(council, /withSemanticMissionContract\(\s*selectedConceptDominance/);
  assert.match(council, /withSemanticMissionContract\(mergedPlan, input\)/);
});

test("master story requirement fails closed before production planning", () => {
  assert.match(gate, /function validateSemanticMissionContract/);
  assert.match(gate, /CREATIVE_MASTER_STORY_REQUIRED/);
  assert.match(gate, /story_architecture\.master_story/);
  assert.match(gate, /validateSemanticMissionContract\(normalized, failures\)/);
});

const directionApprovalSource = fs.readFileSync(
  "lib/creative/director/runtime/CreativeDirectionCostApprovalRuntime.js",
  "utf8",
);

test("started bounded Creative approvals use expires_at only as a start-by deadline", () => {
  const start = directionApprovalSource.indexOf("function approvalTimeWindowValid");
  const end = directionApprovalSource.indexOf("function approvalChannel", start);
  const block = directionApprovalSource.slice(start, end);
  assert.match(block, /expires_at is a start-by deadline/);
  assert.match(block, /status === "IN_PROGRESS"/);
  assert.match(block, /Number\(approval\.call_count \|\| 0\) > 0/);
  assert.doesNotMatch(block, /now <= approvedAt \+ DIRECTION_IN_PROGRESS_CONTINUATION_WINDOW_MS/);
});

const workflowResolutionSource = fs.readFileSync(
  "lib/creative/director/runtime/CreativeWorkflowResolutionRuntime.js",
  "utf8",
);

test("stale temporal checkpoints cannot bypass a newly required master story", () => {
  assert.match(workflowResolutionSource, /masterStoryRequired\(context\) && !completeMasterStory\(master\.plan\)/);
  assert.match(workflowResolutionSource, /story_architecture/);
});

test("Tribunal-approved checkpoints are reusable only for the identical master plan hash", () => {
  const start = workflowResolutionSource.indexOf("async function reviewWithDurableResume");
  const end = workflowResolutionSource.indexOf("async function clearResolvedDirectionCheckpoints", start);
  const block = workflowResolutionSource.slice(start, end);
  assert.match(block, /reviewPlanHash\(approvedCheckpoint\.plan\)/);
  assert.match(block, /reviewPlanHash\(currentPlan\)/);
});

test("semantic structure upgrades do not replay obsolete master-plan repair receipts", () => {
  const start = workflowResolutionSource.indexOf("const councilCheckpoint = storedCouncilCheckpoint");
  const end = workflowResolutionSource.indexOf("const declared = CreativeWorkflowRegistry.resolveDeclared", start);
  const block = workflowResolutionSource.slice(start, end);
  assert.match(block, /semanticStructureUpgrade/);
  assert.match(block, /masterStoryRequired\(context\) && !completeMasterStory\(councilCheckpoint\.plan\)/);
  assert.match(block, /semanticStructureUpgrade\s*\? \[\]\s*:\s*await recoverSettledPostCouncilRepairs/);
});

const masterPlanRuntime = fs.readFileSync(
  "lib/creative/director/runtime/CreativeMasterPlanRuntime.js",
  "utf8",
);

test("Master Plan treats semantic master-story scope as system-owned structure", () => {
  assert.match(masterPlanRuntime, /function semanticMissionContractSnapshot/);
  assert.match(masterPlanRuntime, /function semanticMissionInstructions/);
  assert.match(masterPlanRuntime, /semantic_mission_contract: semanticMissionContractSnapshot/);
  assert.match(masterPlanRuntime, /story_architecture\.master_story with substantive beginning, middle, payoff/);
  assert.match(masterPlanRuntime, /applySemanticMissionContract/);
});

test("Master Plan repair receives full-story versus generation-excerpt semantics", () => {
  assert.match(masterPlanRuntime, /immutable\.semantic_mission_contract is system-owned authority/);
  assert.match(masterPlanRuntime, /generate_only_chapter_1=true/);
  assert.match(masterPlanRuntime, /master_story describes the complete work while top-level scenes remain the current generation excerpt/);
});

test("Council revision creates the full story before Tribunal when the mission requires it", () => {
  assert.match(council, /const masterStoryRequirement = missionContract\.master_story_required === true/);
  assert.match(council, /story_architecture\.master_story must contain substantive beginning, middle, payoff and an ordered chapters array/);
});
test("contract repair has a dedicated strict full-work master-story channel", () => {
  assert.match(masterPlanRuntime, /function strictMasterStorySchema/);
  assert.match(masterPlanRuntime, /master_story:\s*\{\s*anyOf:/);
  assert.match(masterPlanRuntime, /const separateMasterStory = object\(parsed\?\.master_story\)/);
  assert.match(masterPlanRuntime, /master_story: separateMasterStory/);
});

test("paid repair replay can preserve full-work story separately from excerpt scenes", () => {
  assert.match(masterPlanRuntime, /master_story describes the complete work while top-level scenes remain the current generation excerpt/);
  assert.match(masterPlanRuntime, /mergeCreativeRepairedPlan\(plan, safeRepair\)/);
});
test("empty weakest-link is derived only from existing substantive review evidence", () => {
  const start = masterPlanRuntime.indexOf("function normalizeLegacyCreativeReviewContract");
  const end = masterPlanRuntime.indexOf("function applySystemOwnedPolicy", start);
  const block = masterPlanRuntime.slice(start, end);
  assert.match(block, /repair_instructions/);
  assert.match(block, /craft_risks/);
  assert.match(block, /entry\.length >= 40/);
  assert.match(block, /weakest_link_derived_from_existing_review: true/);
});
test("validated post-repair master resumes before the older Council checkpoint", () => {
  const postRepairIndex = workflowResolutionSource.indexOf("const postRepairCheckpoint = storedPostRepairMasterCheckpoint");
  const councilIndex = workflowResolutionSource.indexOf("const councilCheckpoint = storedCouncilCheckpoint", postRepairIndex);
  assert.ok(postRepairIndex >= 0);
  assert.ok(councilIndex > postRepairIndex);
  const block = workflowResolutionSource.slice(postRepairIndex, councilIndex);
  assert.match(block, /completeMasterStory\(postRepairCheckpoint\.plan\)/);
  assert.match(block, /approved_master: postRepairCheckpoint/);
  assert.match(block, /master_repair_results: \[\]/);
});
test("post-repair Creative masters are not re-dominated before validation", () => {
  const block = council.slice(council.indexOf("async function resumeApprovedCouncilPlan"));
  assert.match(block, /CREATIVE_POST_REPAIR_MASTER_CHECKPOINT_V1/);
  assert.match(block, /postRepairCheckpoint\s*\? withSemanticMissionContract\(approvedPlan, input\)/);
});
test("Tribunal repairs act only on blocking reviewers", () => {
  const tribunal = fs.readFileSync("lib/creative/director/runtime/CreativeDynamicTribunalRuntime.js", "utf8");
  assert.match(tribunal, /passed_reviewers_to_preserve/);
  assert.match(tribunal, /blockingTribunal/);
  assert.match(tribunal, /Passed-reviewer feedback is preservation evidence, not repair authority/);
  assert.match(tribunal, /physically plausible formulation/);
});

test("Tribunal recovery replays paid repairs and preserves only unchanged reviewer evidence", () => {
  const block = workflowResolutionSource.slice(workflowResolutionSource.indexOf("async function recoverSettledTribunalResume"));
  const tribunalSource = fs.readFileSync("lib/creative/director/runtime/CreativeDynamicTribunalRuntime.js", "utf8");
  assert.match(block, /CREATIVE_DYNAMIC_TRIBUNAL_REPAIR_V1/);
  assert.match(block, /replaySettledRepair/);
  assert.match(block, /passingByReviewer\.delete/);
  assert.match(block, /replayed_plan: replayPlan/);
  assert.match(block, /recoveredTribunalResume,\s*input\.tribunal_resume_package/);
  assert.match(tribunalSource, /creative_review_evidence_hash/);
});

test("narrative review reuse tracks causal story rather than cosmetic scene labels", () => {
  const tribunalSource = fs.readFileSync("lib/creative/director/runtime/CreativeDynamicTribunalRuntime.js", "utf8");
  const start = tribunalSource.indexOf("function narrativeSceneEvidence");
  const end = tribunalSource.indexOf("function brandProductionEvidence", start);
  const block = tribunalSource.slice(start, end);
  assert.match(block, /objective/);
  assert.match(block, /state_change/);
  assert.match(block, /transition_logic/);
  const returnBlock = block.slice(block.indexOf("return {"));
  assert.doesNotMatch(returnBlock, /scene\.title/);
  assert.doesNotMatch(returnBlock, /scene\.emotion/);
});

test("Tribunal-approved temporal masters continue without rebuilding Direction", () => {
  const orchestrator = fs.readFileSync(
    "lib/creative/director/orchestrator/CreativePipelineOrchestrator.js",
    "utf8",
  );
  assert.match(
    orchestrator,
    /durableTemporalMaster \|\| tribunalApprovedMaster \|\| await CreativeUniversalTemporalDirectionRuntime\.create/,
  );
  assert.match(orchestrator, /approved_master: null/);
  assert.match(orchestrator, /sealedTribunalApprovedWorldClassDirection/);
  assert.match(orchestrator, /sealedWorldClassGate\.passed === true/);
  assert.match(orchestrator, /if \(!sealedTribunalApprovedWorldClassDirection\) \{\s*resolvedMaster = CreativeWorldClassConceptIntelligenceRuntime\.enforce/);
});

test("Creative recovery checkpoints clear only after downstream pipeline handoff", () => {
  const workflow = fs.readFileSync(
    "lib/creative/director/runtime/CreativeWorkflowResolutionRuntime.js",
    "utf8",
  );
  const director = fs.readFileSync(
    "lib/creative/director/runtime/CreativeDirectorRuntime.js",
    "utf8",
  );
  const resumeBlock = workflow.slice(workflow.indexOf("async resumeApprovedCouncil"));
  assert.doesNotMatch(resumeBlock, /await clearResolvedDirectionCheckpoints\(context\);[\s\S]*resumed_from_approved_council/);
  assert.match(workflow, /async finalizeResolvedHandoff/);
  assert.match(director, /pipeline = await buildCreativePipeline/);
  assert.match(director, /await CreativeWorkflowResolutionRuntime\.finalizeResolvedHandoff/);
});

test("settled Creative ledger replays in chronological authority order", () => {
  const workflow = fs.readFileSync(
    "lib/creative/director/runtime/CreativeWorkflowResolutionRuntime.js",
    "utf8",
  );
  const councilSource = fs.readFileSync(
    "lib/creative/director/runtime/CreativeConceptCouncilRuntime.js",
    "utf8",
  );
  assert.match(workflow, /const councilRevisionIndex = operations/);
  assert.match(workflow, /slice\(baseIndex \+ 1, Number\.isInteger\(councilRevisionIndex\)/);
  assert.match(councilSource, /async function recoverSettledPostRevisionRepairs/);
  assert.match(councilSource, /repair_results: await recoverSettledPostRevisionRepairs\(context, revisionOperation\)/);
});


test("pre-Council paid recovery can defer the current semantic mission contract", () => {
  const source = fs.readFileSync("lib/creative/director/runtime/CreativeMasterPlanRuntime.js", "utf8");
  const start = source.indexOf("async resumeFromResult");
  const end = source.indexOf("availableProductionCapabilities,", start);
  const block = source.slice(start, end);
  assert.match(block, /defer_semantic_mission_contract/);
  assert.match(block, /\? policyPlan/);
  assert.match(block, /applySemanticMissionContract\(policyPlan/);
});


test("settled Council repair recovery uses the latest bounded repair window", () => {
  const council = fs.readFileSync("lib/creative/director/runtime/CreativeConceptCouncilRuntime.js", "utf8");
  const workflow = fs.readFileSync("lib/creative/director/runtime/CreativeWorkflowResolutionRuntime.js", "utf8");
  assert.match(council, /entries\.slice\(-2\)/);
  assert.match(workflow, /repairEntries\.slice\(-2\)/);
});


test("Council uses the same world-class score policy before selection", () => {
  const council = fs.readFileSync("lib/creative/director/runtime/CreativeConceptCouncilRuntime.js", "utf8");
  assert.match(council, /WORLD_CLASS_CONCEPT_POLICY/);
  assert.match(council, /policy\.minimum_weighted_score/);
  assert.match(council, /policy\.critic_minimums/);
  assert.doesNotMatch(council, /weightedScore < 76/);
  assert.doesNotMatch(council, /weighted_score >= 76/);
});


test("autonomous regeneration is active on the real Council path", () => {
  const regeneration = fs.readFileSync("lib/creative/director/runtime/CreativeAutonomousConceptRegenerationRuntime.js", "utf8");
  const workflow = fs.readFileSync("lib/creative/director/runtime/CreativeWorkflowResolutionRuntime.js", "utf8");
  assert.match(workflow, /CreativeAutonomousConceptRegenerationRuntime/);
  assert.match(regeneration, /CreativeConceptCouncilRuntime\.run = async function runWithAutonomousConceptRegeneration/);
  assert.match(regeneration, /assertWorldClassCouncilResult\(result, policy\)/);
});

test("regeneration rounds do not replay failed Council receipts", () => {
  const regeneration = fs.readFileSync("lib/creative/director/runtime/CreativeAutonomousConceptRegenerationRuntime.js", "utf8");
  assert.match(regeneration, /state\.round <= 1/);
  assert.match(regeneration, /operations\.filter\(\(entry\) => !councilRegenerationOperation/);
  assert.match(regeneration, /CREATIVE_SELECTED_CONCEPT_PLAN_REVISION_V1/);
  assert.match(regeneration, /CREATIVE_EXECUTIVE_CONCEPT_SELECTION_V1/);
});

test("regeneration cannot grant reasoning authority", () => {
  const regeneration = fs.readFileSync("lib/creative/director/runtime/CreativeAutonomousConceptRegenerationRuntime.js", "utf8");
  assert.doesNotMatch(regeneration, /paid_direction_approval\s*:\s*\{[^}]*approved\s*:\s*true/s);
  assert.doesNotMatch(regeneration, /maximum_customer_price\s*:/);
  assert.doesNotMatch(regeneration, /media_generation_authorized\s*:\s*true/);
});


test("anonymous humans do not inherit arbitrary identity profiles", () => {
  const universal = fs.readFileSync("lib/creative/director/runtime/CreativeUniversalTemporalDirectionRuntime.js", "utf8");
  const start = universal.indexOf("function identityForShot");
  const end = universal.indexOf("function requestedAngle", start);
  const block = universal.slice(start, end);
  assert.match(block, /explicitProfileId/);
  assert.match(block, /return list\(identities\)\.find/);
  assert.match(block, /\|\| null/);
  assert.doesNotMatch(block, /return list\(identities\)\[0\]/);
  assert.doesNotMatch(block, /actor\?\.role/);
});

test("production identity gates apply only to explicitly bound identities", () => {
  const graph = fs.readFileSync("lib/creative/production-graph/runtime/ProductionGraphRuntime.js", "utf8");
  assert.match(graph, /function identityBoundHumanShot/);
  assert.match(graph, /identity_profile_id/);
  assert.match(graph, /identity_lock_required === true/);
  assert.match(graph, /identityBoundHumanShots\.filter/);
  assert.doesNotMatch(graph, /function namedHumanShot/);
});


test("post-Tribunal temporal handoff upgrades legacy masters with canonical dossier policy", () => {
  const orchestrator = fs.readFileSync("lib/creative/director/orchestrator/CreativePipelineOrchestrator.js", "utf8");
  assert.match(orchestrator, /ensureUniversalTemporalDossier/);
  assert.match(orchestrator, /dry_run_dossier_required_before_paid_generation/);
});

test("fresh temporal identity accounting distinguishes human from identity-bound shots", () => {
  const universal = fs.readFileSync("lib/creative/director/runtime/CreativeUniversalTemporalDirectionRuntime.js", "utf8");
  assert.match(universal, /let identityRequiredShots = 0/);
  assert.match(universal, /if \(profile\) identityRequiredShots \+= 1/);
  assert.match(universal, /identityBoundShots !== identityRequiredShots/);
  assert.doesNotMatch(universal, /identityBoundShots !== humanShots/);
});


test("premium benchmark floors become explicit Research targets", () => {
  const research = fs.readFileSync("lib/creative/research/reasoning/ResearchDirector.js", "utf8");
  assert.match(research, /benchmarkTargets/);
  assert.match(research, /id: "benchmark_reference_films"/);
  assert.match(research, /subjects: benchmarkTargets/);
});

test("Research policy requires and validates Benchmark Lab when benchmark floors exist", () => {
  const evidence = fs.readFileSync("lib/creative/research/runtime/ResearchEvidenceContractRuntime.js", "utf8");
  assert.match(evidence, /require_benchmark_lab: requireBenchmarkLab/);
  assert.match(evidence, /evaluateBenchmarkStudy/);
  assert.match(evidence, /CREATIVE_BENCHMARK_LAB_REQUIRED/);
  assert.match(evidence, /if \(policy\?\.require_benchmark_lab === true\)/);
});
