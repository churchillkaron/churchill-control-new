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