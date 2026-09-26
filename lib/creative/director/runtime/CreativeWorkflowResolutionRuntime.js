import crypto from "node:crypto";
import { CreativeMissionRuntime } from "@/lib/creative/missions/runtime/CreativeMissionRuntime";
import { CreativeProjectRuntime } from "@/lib/creative/projects/runtime/CreativeProjectRuntime";
import { CreativeBriefRuntime } from "@/lib/creative/brief/runtime/CreativeBriefRuntime";
import { CreativeAssetsRuntime } from "@/lib/creative/assets/runtime/CreativeAssetsRuntime";
import { CreativeVerifiedBrandAssetBindingRuntime } from "@/lib/creative/assets/runtime/CreativeVerifiedBrandAssetBindingRuntime";
import { CreativeMasterPlanRuntime } from "@/lib/creative/director/runtime/CreativeMasterPlanRuntime";
import { CreativeTemporalMasterPlanRuntime } from "@/lib/creative/director/runtime/CreativeTemporalMasterPlanRuntime";
import { assertCreativeMasterPlan } from "@/lib/creative/director/validation/CreativeMasterPlanValidator";
import { CreativeStillPlanNormalizationRuntime } from "@/lib/creative/director/runtime/CreativeStillPlanNormalizationRuntime";
import { UsageRuntime } from "@/lib/platform/service-runtime/usage/UsageRuntime";
import { CreativeDynamicTribunalRuntime } from "@/lib/creative/director/runtime/CreativeDynamicTribunalRuntime";
import { CreativeExactClaimAuthorityRuntime } from "@/lib/creative/director/runtime/CreativeExactClaimAuthorityRuntime";
import { CreativeConceptCouncilRuntime } from "@/lib/creative/director/runtime/CreativeConceptCouncilRuntime";
import { CreativeUniversalTemporalDirectionRuntime } from "@/lib/creative/director/runtime/CreativeUniversalTemporalDirectionRuntime";
import "@/lib/creative/director/runtime/CreativeAutonomousConceptRegenerationRuntime";
import { CreativeWorkflowRegistry } from "@/lib/creative/director/registry/CreativeWorkflowRegistry";
import { enrichCreativeDirectionWithLearning } from "@/lib/creative/learning/runtime/CreativeOutcomeLearningDirectionBootstrap";
import { resolveCreativeDirectionResearch } from "@/lib/creative/research/runtime/ResearchRuntime";
import { bootstrapProductionRooms } from "@/lib/creative/production-room/runtime/CreativeProductionRoomBootstrapRuntime";
import { repairCreativeFloorPlan } from "@/lib/creative/production-room/runtime/CreativePreproductionCreativeRepairRuntime";
import {
  readPreproductionDurableState,
  persistPreproductionDurableState,
} from "@/lib/creative/production-room/runtime/CreativePreproductionDurableStateRuntime";

function resolveMissionId(input = {}) {
  return input.creative_mission_id || input.mission_id || null;
}

function resolveProjectId(input = {}) {
  return input.creative_project_id || input.project_id || null;
}

function text(value) {
  return String(value ?? "").trim().toUpperCase();
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function list(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function canonicalFingerprint(value) {
  if (Array.isArray(value)) return value.map(canonicalFingerprint);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalFingerprint(value[key])]));
}

function fingerprint(value) {
  return crypto.createHash("sha256").update(JSON.stringify(canonicalFingerprint(value))).digest("hex");
}

function masterPlanDigest(plan = {}) {
  const authoritative =
    plan?.story_lineage?.master_plan_hash ||
    plan?.metadata?.story_lineage?.master_plan_hash ||
    null;
  if (text(authoritative)) return text(authoritative);
  const {
    production_room_pipeline: _productionRoomPipeline,
    production_room_bootstrap: _productionRoomBootstrap,
    ...stablePlan
  } = object(plan);
  return fingerprint(stablePlan);
}

async function resolveContext(input = {}) {
  const organization_id = input.organization_id;
  const creative_mission_id = resolveMissionId(input);
  const creative_project_id = resolveProjectId(input);

  if (!organization_id) throw new Error("organization_id required");
  if (!creative_mission_id) throw new Error("creative_mission_id required");
  if (!creative_project_id) throw new Error("creative_project_id required");

  const [mission, initialProject, briefs] = await Promise.all([
    CreativeMissionRuntime.get(creative_mission_id),
    CreativeProjectRuntime.get(creative_project_id),
    CreativeBriefRuntime.list({ organization_id, creative_mission_id, creative_project_id }),
  ]);

  const brandBinding = initialProject && initialProject.organization_id === organization_id
    ? await CreativeVerifiedBrandAssetBindingRuntime.bind({
        organization_id,
        creative_project_id,
        project: initialProject,
      })
    : { project: initialProject };
  const project = brandBinding.project || initialProject;
  const assets = project
    ? await CreativeAssetsRuntime.list({ organization_id, creative_mission_id, creative_project_id })
    : [];

  if (!mission || mission.organization_id !== organization_id) {
    throw new Error("Creative mission not found");
  }
  if (!project || project.organization_id !== organization_id) {
    throw new Error("Creative project not found");
  }

  return {
    organization_id,
    creative_mission_id,
    creative_project_id,
    mission,
    project,
    brief: input.brief?.id ? input.brief : briefs[0] || input.brief || {},
    assets,
  };
}

function projectForDirection(project = {}, declared = null) {
  if (!declared) return project;
  return {
    ...project,
    metadata: {
      ...(project.metadata || {}),
      workflow_kind: declared.workflow_kind,
      workflow_constraint_source: declared.source,
      workflow_declared_value: declared.declared_value,
    },
  };
}

const TRIBUNAL_RESUME_METADATA_KEY = "creative_tribunal_resume";
const TRIBUNAL_APPROVED_METADATA_KEY = "creative_tribunal_approved_checkpoint";
const COUNCIL_CHECKPOINT_METADATA_KEY = "creative_council_checkpoint";
const MASTER_CHECKPOINT_METADATA_KEY = "creative_post_repair_master_checkpoint";
const STORY_LINEAGE_RECOVERY_METADATA_KEY = "creative_story_lineage_recovery";
const TEMPORAL_DIRECTION_CHECKPOINT_METADATA_KEY = "creative_temporal_direction_checkpoint";
const CHALLENGER_SELECTION_METADATA_KEY = "creative_challenger_selection_checkpoint";

function rejectedCheckpointCollision(project = {}, concept = {}) {
  return CreativeConceptCouncilRuntime.rejectedLineageCollision(concept, { project });
}

function storedChallengerSelectionCheckpoint(project = {}, context = {}) {
  const state = object(project.metadata?.[CHALLENGER_SELECTION_METADATA_KEY]);
  if (state.contract !== "CREATIVE_CHALLENGER_SELECTION_CHECKPOINT_V1") return null;
  if (state.organization_id !== context.organization_id) return null;
  if (state.creative_mission_id !== context.creative_mission_id) return null;
  if (state.creative_project_id !== context.creative_project_id) return null;
  if (!state.selected_base_usage_id || !state.selector_job_id) return null;
  if (Number(state.target_seconds) !== 60) return null;
  const challengerConcept = {
    id: state.selected_concept_id || null,
    title: state.selected_title || null,
    ...object(state.selected_concept),
  };
  if (rejectedCheckpointCollision(project, challengerConcept)) return null;
  return state;
}

async function clearChallengerSelectionCheckpoint(context = {}) {
  const current = await CreativeProjectRuntime.get(context.creative_project_id);
  if (!current || current.organization_id !== context.organization_id) return null;
  if (!current.metadata?.[CHALLENGER_SELECTION_METADATA_KEY]) return current;
  const metadata = { ...(current.metadata || {}) };
  delete metadata[CHALLENGER_SELECTION_METADATA_KEY];
  return CreativeProjectRuntime.update(current.id, { metadata });
}

function masterStoryRequired(context = {}) {
  const missionMetadata = object(context.mission?.metadata);
  const projectMetadata = object(context.project?.metadata);
  const briefMetadata = object(context.brief?.metadata);
  const briefMissionMetadata = object(briefMetadata.mission_metadata);
  const semantic = object(
    projectMetadata.semantic_creative_understanding ||
    missionMetadata.semantic_creative_understanding ||
    briefMissionMetadata.semantic_creative_understanding,
  );
  return semantic.master_story_required === true ||
    projectMetadata.master_story_required === true ||
    missionMetadata.master_story_required === true ||
    briefMissionMetadata.master_story_required === true;
}

function completeMasterStory(plan = {}) {
  const masterStory = object(object(plan.story_architecture).master_story);
  return Object.keys(masterStory).length > 0 &&
    Array.isArray(masterStory.chapters) && masterStory.chapters.length > 0;
}

function storedTemporalDirectionCheckpoint(project = {}, context = {}) {
  const state = object(project.metadata?.[TEMPORAL_DIRECTION_CHECKPOINT_METADATA_KEY]);
  if (state.contract !== "CREATIVE_TEMPORAL_DIRECTION_CHECKPOINT_V1") return null;
  if (state.organization_id !== context.organization_id) return null;
  if (state.creative_mission_id !== context.creative_mission_id) return null;
  if (state.creative_project_id !== context.creative_project_id) return null;
  const master = object(state.master);
  if (!master.plan || !Array.isArray(master.plan.scenes) || !master.plan.scenes.length) return null;
  if (master.plan?.creative_tribunal?.passed !== true) return null;
  if (text(master.plan?.workflow_kind) !== "TEMPORAL") return null;
  const council = object(master.independent_concept_council || master.plan?.concept_council);
  const selection = object(council.selection);
  const selectedConcept = object(
    selection.selected_concept ||
    master.plan?.selected_concept ||
    master.plan?.concept
  );
  if (rejectedCheckpointCollision(project, selectedConcept)) return null;

  const currentPlan = {
    ...object(master.plan),
    quality_profile: project.quality_profile || master.plan?.quality_profile || null,
  };
  try {
    const validation = assertCreativeMasterPlan({
      plan: currentPlan,
      assets: list(context.assets),
    });
    return restoreTribunalLineage({
      ...master,
      plan: { ...currentPlan, validation },
      validation,
      checkpoint_recertified_against_current_quality_floor: true,
    }, master);
  } catch {
    return null;
  }
}

async function persistTemporalDirectionCheckpoint(context = {}, master = {}) {
  const plan = object(master.plan);
  if (text(plan.workflow_kind) !== "TEMPORAL" || !Array.isArray(plan.scenes) || !plan.scenes.length || plan.creative_tribunal?.passed !== true) return null;
  const current = await CreativeProjectRuntime.get(context.creative_project_id);
  if (!current || current.organization_id !== context.organization_id) throw new Error("Creative project not found");
  return CreativeProjectRuntime.update(current.id, {
    metadata: {
      ...(current.metadata || {}),
      [TEMPORAL_DIRECTION_CHECKPOINT_METADATA_KEY]: {
        contract: "CREATIVE_TEMPORAL_DIRECTION_CHECKPOINT_V1",
        organization_id: context.organization_id,
        creative_mission_id: context.creative_mission_id,
        creative_project_id: context.creative_project_id,
        persisted_at: new Date().toISOString(),
        master,
      },
    },
  });
}

function usageAsSettledDirectionResult(usage = {}) {
  const providerResult = usage?.metadata?.provider_result || usage?.metadata?.result || {};
  return {
    ...(providerResult && typeof providerResult === "object" ? providerResult : {}),
    provider: usage.provider || providerResult.provider || null,
    model: usage.provider_model || providerResult.model || null,
    usage,
  };
}

function parseTribunalJson(value) {
  if (value && typeof value === "object" && !Array.isArray(value)) return value;
  const source = String(value ?? "").trim();
  if (!source) return null;
  const candidates = [source];
  for (const match of source.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi)) {
    if (match[1]) candidates.push(match[1].trim());
  }
  const first = source.indexOf("{");
  const last = source.lastIndexOf("}");
  if (first >= 0 && last > first) candidates.push(source.slice(first, last + 1));
  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed;
    } catch {}
  }
  return null;
}

function findTribunalField(value, key, depth = 0) {
  if (!value || typeof value !== "object" || depth > 5) return null;
  if (!Array.isArray(value) && value[key] !== undefined) return value;
  for (const child of (Array.isArray(value) ? value : Object.values(value))) {
    const found = findTribunalField(child, key, depth + 1);
    if (found) return found;
  }
  return null;
}

function normalizedTribunalUsageOutput(usage = {}, expects) {
  let transport = usage?.metadata?.provider_result || usage?.metadata?.result || {};
  for (let depth = 0; depth < 4; depth += 1) {
    const raw = transport && typeof transport === "object" ? transport.raw : null;
    if (!raw) break;
    transport = raw;
  }
  const parsed = parseTribunalJson(
    transport?.output?.text || transport?.text || transport?.content || transport,
  );
  return findTribunalField(parsed, expects) || parsed;
}

function canonicalReviewerId(value) {
  return String(value ?? "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

async function recoverSettledInitialMaster({ context, project, brief, assets }) {
  const approval = project?.metadata?.paid_direction_approval || {};
  const operations = Array.isArray(approval.operations) ? approval.operations : [];
  const baseIndexes = operations
    .map((entry, index) => [entry, index])
    .filter(([entry]) => String(entry?.operation || "").toUpperCase() === "MASTER_PLAN_DYNAMIC_V2" && entry?.usage_id && entry?.completed_at);
  if (!baseIndexes.length) return null;

  const [base, baseIndex] = baseIndexes.at(-1);
  const initialPhaseEntries = [];
  for (const entry of operations.slice(baseIndex + 1)) {
    const operation = String(entry?.operation || "").toUpperCase();
    if (operation !== "MASTER_PLAN_CONTRACT_REPAIR_V1") break;
    initialPhaseEntries.push(entry);
  }
  const repairEntries = initialPhaseEntries
    .filter((entry) => entry?.usage_id && entry?.completed_at);

  const usages = await Promise.all([base, ...repairEntries].map((entry) => UsageRuntime.get(entry.usage_id)));
  if (!usages[0] || String(usages[0].status || "").toUpperCase() !== "SUCCESS") return null;
  if (usages.slice(1).some((usage) => !usage || String(usage.status || "").toUpperCase() !== "SUCCESS")) return null;

  return CreativeMasterPlanRuntime.resumeFromResult({
    organization_id: context.organization_id,
    mission: context.mission,
    project,
    brief,
    assets,
    result: usageAsSettledDirectionResult(usages[0]),
    repair_results: usages.slice(1).map(usageAsSettledDirectionResult),
    defer_semantic_mission_contract: true,
  });
}

async function recoverSettledPostCouncilRepairs(project = {}) {
  const approval = project?.metadata?.paid_direction_approval || {};
  const operations = Array.isArray(approval.operations) ? approval.operations : [];
  const revisionIndex = operations
    .map((entry, index) => [entry, index])
    .filter(([entry]) => String(entry?.operation || "").toUpperCase() === "CREATIVE_SELECTED_CONCEPT_PLAN_REVISION_V1" && entry?.usage_id && entry?.completed_at)
    .map(([, index]) => index)
    .at(-1);
  if (!Number.isInteger(revisionIndex)) return [];

  const repairEntries = operations
    .slice(revisionIndex + 1)
    .filter((entry) => String(entry?.operation || "").toUpperCase() === "MASTER_PLAN_CONTRACT_REPAIR_V1" && entry?.usage_id && entry?.completed_at);
  if (!repairEntries.length) return [];

  const latestRepairEntries = repairEntries.slice(-2);
  const usages = await Promise.all(latestRepairEntries.map((entry) => UsageRuntime.get(entry.usage_id)));
  return usages
    .filter((usage) => usage && String(usage.status || "").toUpperCase() === "SUCCESS")
    .map(usageAsSettledDirectionResult);
}

function normalizeRecoveredTribunalPlan(plan = {}, mission = {}) {
  return CreativeStillPlanNormalizationRuntime.normalize(
    CreativeExactClaimAuthorityRuntime.ground({ plan, mission }),
  );
}

async function recoverSettledTribunalResume({ context, project, master, available_capabilities = [] }) {
  // Recover from the latest durable post-repair checkpoint when available. That
  // checkpoint already contains every Tribunal repair completed before it was
  // persisted, so replaying those same repairs again corrupts the plan and invalidates
  // paid review receipts. Only operations newer than the checkpoint's last included
  // repair are replayed.
  const liveProject = await CreativeProjectRuntime.get(context.creative_project_id);
  const approval = liveProject?.metadata?.paid_tribunal_approval || project?.metadata?.paid_tribunal_approval || {};
  const operations = Array.isArray(approval.operations) ? approval.operations : [];
  const completedEntries = operations
    .map((entry, index) => ({ entry, index }))
    .filter(({ entry }) => entry?.usage_id && entry?.completed_at);
  const panelEntries = completedEntries.filter(({ entry }) =>
    String(entry.operation || "").toUpperCase() === "CREATIVE_DYNAMIC_TRIBUNAL_PANEL_V1",
  );
  if (!panelEntries.length) return null;

  const checkpointState = liveProject?.metadata?.[MASTER_CHECKPOINT_METADATA_KEY] || {};
  const checkpointMaster = storedPostRepairMasterCheckpoint(liveProject || project, context);
  const checkpointAt = Date.parse(String(checkpointState.persisted_at || ""));
  const checkpointRepairIndex = checkpointMaster?.plan && Number.isFinite(checkpointAt)
    ? completedEntries
        .filter(({ entry }) =>
          String(entry.operation || "").toUpperCase() === "CREATIVE_DYNAMIC_TRIBUNAL_REPAIR_V1" &&
          Date.parse(String(entry.completed_at || "")) <= checkpointAt,
        )
        .map(({ index }) => index)
        .at(-1) ?? -1
    : -1;

  let replayPlan = normalizeRecoveredTribunalPlan(
    checkpointMaster?.plan || master.plan,
    context.mission,
  );
  const quality = object(replayPlan?.quality);
  const configuredFloor = Number(quality.minimum_release_score ?? quality.minimum_scene_score);
  const requiredFloor = Math.max(90, Math.min(100, Number.isFinite(configuredFloor) ? configuredFloor : 90));
  const reviewContext = CreativeDynamicTribunalRuntime.reviewContextSnapshot({
    mission: context.mission,
    project,
    brief: context.brief,
    assets: context.assets,
    available_capabilities,
  });

  const activePanelEntry = panelEntries.filter(({ index }) => index <= Math.max(checkpointRepairIndex, 0)).at(-1)
    || panelEntries[0];
  let reviewPanel = null;
  let normalizedReviewers = [];
  const settledByReviewer = new Map();

  const loadPanel = async (entry) => {
    const usage = await UsageRuntime.get(entry.usage_id);
    if (!usage || String(usage.status || "").toUpperCase() !== "SUCCESS") return false;
    const panelOutput = normalizedTribunalUsageOutput(usage, "reviewers");
    const reviewers = Array.isArray(panelOutput?.reviewers) ? panelOutput.reviewers : [];
    if (!reviewers.length) return false;
    normalizedReviewers = reviewers.map((reviewer) => ({
      ...reviewer,
      id: canonicalReviewerId(reviewer?.id),
    }));
    reviewPanel = { ...panelOutput, reviewers: normalizedReviewers };
    settledByReviewer.clear();
    return true;
  };

  if (!(await loadPanel(activePanelEntry.entry))) return null;
  const reviewerForPlan = (reviewerId, plan) =>
    CreativeDynamicTribunalRuntime.reviewersForPlan({ reviewers: normalizedReviewers, plan })
      .find((row) => canonicalReviewerId(row?.id) === reviewerId);

  const startIndex = checkpointMaster?.plan ? checkpointRepairIndex + 1 : activePanelEntry.index + 1;
  for (const { entry, index } of completedEntries.filter(({ index }) => index >= startIndex)) {
    const operation = String(entry?.operation || "").toUpperCase();
    if (operation === "CREATIVE_DYNAMIC_TRIBUNAL_PANEL_V1") {
      if (index === activePanelEntry.index) continue;
      await loadPanel(entry);
      continue;
    }
    if (!/^CREATIVE_DYNAMIC_TRIBUNAL_.+[-_]REVIEWER_V1$/i.test(operation) &&
        operation !== "CREATIVE_DYNAMIC_TRIBUNAL_REPAIR_V1") continue;

    const usage = await UsageRuntime.get(entry.usage_id);
    if (!usage || String(usage.status || "").toUpperCase() !== "SUCCESS") continue;

    if (operation === "CREATIVE_DYNAMIC_TRIBUNAL_REPAIR_V1") {
      const repairSourcePlanHash = String(usage?.metadata?.creative_repair_source_plan_hash || "");
      const currentSourcePlanHash = CreativeDynamicTribunalRuntime.reviewPlanHash(replayPlan);
      if (!repairSourcePlanHash || repairSourcePlanHash !== currentSourcePlanHash) continue;
      const repairOutput = normalizedTribunalUsageOutput(usage, "plan");
      const replay = CreativeDynamicTribunalRuntime.replaySettledRepair({
        plan: replayPlan,
        output: repairOutput,
        assets: context.assets,
        available_capabilities,
        historical_replay: true,
      });
      if (!replay.adopted) continue;
      replayPlan = normalizeRecoveredTribunalPlan(replay.plan, context.mission);
      for (const [reviewerId, row] of [...settledByReviewer.entries()]) {
        const currentReviewer = reviewerForPlan(reviewerId, replayPlan);
        if (!currentReviewer) {
          settledByReviewer.delete(reviewerId);
          continue;
        }
        const currentHash = CreativeDynamicTribunalRuntime.reviewEvidenceHash({
          reviewer: currentReviewer, context: reviewContext, plan: replayPlan,
        });
        if (currentHash !== row.review_evidence_hash) settledByReviewer.delete(reviewerId);
        else settledByReviewer.set(reviewerId, { ...row, reviewer: currentReviewer });
      }
      continue;
    }

    const review = normalizedTribunalUsageOutput(usage, "reviewer_id");
    const reviewerId = canonicalReviewerId(review?.reviewer_id);
    const reviewer = reviewerForPlan(reviewerId, replayPlan);
    if (!reviewer || !reviewerId) continue;
    const normalizedReview = { ...review, reviewer_id: reviewerId };
    const storedEvidenceHash = usage?.metadata?.creative_review_evidence_hash || null;
    const currentEvidenceHash = CreativeDynamicTribunalRuntime.reviewEvidenceHash({
      reviewer, context: reviewContext, plan: replayPlan,
    });
    const legacyEvidenceHash = CreativeDynamicTribunalRuntime.legacyReviewEvidenceHash({
      reviewer, context: reviewContext, plan: replayPlan,
    });
    const exactHashMatch = !storedEvidenceHash || [currentEvidenceHash, legacyEvidenceHash].includes(storedEvidenceHash);
    const semanticMigration = !exactHashMatch && CreativeDynamicTribunalRuntime.reviewStillSupported({
      reviewer, review: normalizedReview, plan: replayPlan,
    });
    if (!exactHashMatch && !semanticMigration) continue;
    settledByReviewer.set(reviewerId, {
      reviewer,
      review: normalizedReview,
      usage,
      billing: usage.billing || null,
      review_evidence_hash: currentEvidenceHash,
    });
  }

  const settledReviews = [...settledByReviewer.entries()].flatMap(([reviewerId, row]) => {
    const reviewer = reviewerForPlan(reviewerId, replayPlan);
    if (!reviewer) return [];
    const currentHash = CreativeDynamicTribunalRuntime.reviewEvidenceHash({
      reviewer, context: reviewContext, plan: replayPlan,
    });
    return currentHash === row.review_evidence_hash ? [{ ...row, reviewer }] : [];
  });
  return {
    contract: "CREATIVE_TRIBUNAL_RESUME_PACKAGE_V1",
    review_panel: reviewPanel,
    settled_reviews: settledReviews,
    settled_review_source_plan: replayPlan,
    settled_review_plan_hash: CreativeDynamicTribunalRuntime.reviewPlanHash(replayPlan),
    replayed_plan: replayPlan,
  };
}

function storedTribunalResume(project = {}, context = {}) {
  const state = project.metadata?.[TRIBUNAL_RESUME_METADATA_KEY] || {};
  if (state.contract !== "CREATIVE_TRIBUNAL_DURABLE_RESUME_V1") return null;
  if (state.organization_id !== context.organization_id) return null;
  if (state.creative_project_id !== context.creative_project_id) return null;
  if (state.creative_mission_id !== context.creative_mission_id) return null;
  const resume = state.resume_package || null;
  const sourcePlan = object(resume?.settled_review_source_plan);
  const controlKeys = [
    "task", "rules", "context", "tribunal", "blocking_reviewers",
    "passed_reviewers_to_preserve", "rejected_repair_feedback", "output",
  ];
  if (controlKeys.some((key) => sourcePlan[key] !== undefined)) return null;
  return resume;
}

function storedTribunalApprovedMaster(project = {}, context = {}) {
  const state = project.metadata?.[TRIBUNAL_APPROVED_METADATA_KEY] || {};
  if (state.contract !== "CREATIVE_TRIBUNAL_APPROVED_CHECKPOINT_V1") return null;
  if (state.organization_id !== context.organization_id) return null;
  if (state.creative_project_id !== context.creative_project_id) return null;
  if (state.creative_mission_id !== context.creative_mission_id) return null;
  if (state.master?.plan?.creative_tribunal?.passed !== true) return null;
  return state.master;
}

async function persistTribunalApprovedMaster(context = {}, master = null) {
  if (master?.plan?.creative_tribunal?.passed !== true) return null;
  const current = await CreativeProjectRuntime.get(context.creative_project_id);
  if (!current || current.organization_id !== context.organization_id) throw new Error("Creative project not found");
  return CreativeProjectRuntime.update(current.id, {
    metadata: {
      ...(current.metadata || {}),
      [TRIBUNAL_APPROVED_METADATA_KEY]: {
        contract: "CREATIVE_TRIBUNAL_APPROVED_CHECKPOINT_V1",
        organization_id: context.organization_id,
        creative_mission_id: context.creative_mission_id,
        creative_project_id: context.creative_project_id,
        persisted_at: new Date().toISOString(),
        master,
      },
    },
  });
}

async function clearTribunalApprovedMaster(context = {}) {
  const current = await CreativeProjectRuntime.get(context.creative_project_id);
  if (!current || current.organization_id !== context.organization_id) return null;
  if (!current.metadata?.[TRIBUNAL_APPROVED_METADATA_KEY]) return current;
  const metadata = { ...(current.metadata || {}) };
  delete metadata[TRIBUNAL_APPROVED_METADATA_KEY];
  return CreativeProjectRuntime.update(current.id, { metadata });
}


function storedPostRepairMasterCheckpoint(project = {}, context = {}) {
  const state = project.metadata?.[MASTER_CHECKPOINT_METADATA_KEY] || {};
  if (state.contract !== "CREATIVE_POST_REPAIR_MASTER_CHECKPOINT_V1") return null;
  if (state.organization_id !== context.organization_id) return null;
  if (state.creative_project_id !== context.creative_project_id) return null;
  if (state.creative_mission_id !== context.creative_mission_id) return null;
  if (!state.master?.plan) return null;

  const currentPlan = {
    ...object(state.master.plan),
    quality_profile: project.quality_profile || state.master.plan?.quality_profile || null,
  };
  try {
    const validation = assertCreativeMasterPlan({
      plan: currentPlan,
      assets: list(context.assets),
    });
    return {
      ...state.master,
      plan: { ...currentPlan, validation },
      validation,
      resume_checkpoint_contract: state.contract,
      checkpoint_recertified_against_current_quality_floor: true,
    };
  } catch {
    return null;
  }
}

async function persistPostRepairMasterCheckpoint(context = {}, master = null) {
  if (!master?.plan || !master?.independent_concept_council) return null;
  const current = await CreativeProjectRuntime.get(context.creative_project_id);
  if (!current || current.organization_id !== context.organization_id) {
    throw new Error("Creative project not found");
  }
  return CreativeProjectRuntime.update(current.id, {
    metadata: {
      ...(current.metadata || {}),
      [MASTER_CHECKPOINT_METADATA_KEY]: {
        contract: "CREATIVE_POST_REPAIR_MASTER_CHECKPOINT_V1",
        organization_id: context.organization_id,
        creative_mission_id: context.creative_mission_id,
        creative_project_id: context.creative_project_id,
        persisted_at: new Date().toISOString(),
        master,
      },
    },
  });
}

async function clearPostRepairMasterCheckpoint(context = {}) {
  const current = await CreativeProjectRuntime.get(context.creative_project_id);
  if (!current || current.organization_id !== context.organization_id) return null;
  if (!current.metadata?.[MASTER_CHECKPOINT_METADATA_KEY]) return current;
  const metadata = { ...(current.metadata || {}) };
  delete metadata[MASTER_CHECKPOINT_METADATA_KEY];
  return CreativeProjectRuntime.update(current.id, { metadata });
}

function storedStoryLineageRecoveryCheckpoint(project = {}, context = {}) {
  const state = project.metadata?.[STORY_LINEAGE_RECOVERY_METADATA_KEY] || {};
  if (state.contract !== "CREATIVE_STORY_LINEAGE_RECOVERY_V1") return null;
  if (state.organization_id !== context.organization_id) return null;
  if (state.creative_project_id !== context.creative_project_id) return null;
  if (state.creative_mission_id !== context.creative_mission_id) return null;
  if (state.user_authorized !== true || !state.master?.plan) return null;
  return {
    ...state.master,
    lineage_recovery_authority: state,
    resume_checkpoint_contract: state.contract,
  };
}

function storedCouncilCheckpoint(project = {}, context = {}) {
  const state = project.metadata?.[COUNCIL_CHECKPOINT_METADATA_KEY] || {};
  if (state.contract !== "CREATIVE_COUNCIL_DURABLE_CHECKPOINT_V1") return null;
  if (state.organization_id !== context.organization_id) return null;
  if (state.creative_project_id !== context.creative_project_id) return null;
  if (state.creative_mission_id !== context.creative_mission_id) return null;
  return state.approved_master || null;
}

async function persistCouncilCheckpoint(context = {}, approvedMaster = null) {
  if (!approvedMaster?.plan || !approvedMaster?.independent_concept_council) return null;
  const current = await CreativeProjectRuntime.get(context.creative_project_id);
  if (!current || current.organization_id !== context.organization_id) {
    throw new Error("Creative project not found");
  }
  return CreativeProjectRuntime.update(current.id, {
    metadata: {
      ...(current.metadata || {}),
      [COUNCIL_CHECKPOINT_METADATA_KEY]: {
        contract: "CREATIVE_COUNCIL_DURABLE_CHECKPOINT_V1",
        organization_id: context.organization_id,
        creative_mission_id: context.creative_mission_id,
        creative_project_id: context.creative_project_id,
        persisted_at: new Date().toISOString(),
        approved_master: approvedMaster,
      },
    },
  });
}

async function clearCouncilCheckpoint(context = {}) {
  const current = await CreativeProjectRuntime.get(context.creative_project_id);
  if (!current || current.organization_id !== context.organization_id) return null;
  if (!current.metadata?.[COUNCIL_CHECKPOINT_METADATA_KEY]) return current;
  const metadata = { ...(current.metadata || {}) };
  delete metadata[COUNCIL_CHECKPOINT_METADATA_KEY];
  return CreativeProjectRuntime.update(current.id, { metadata });
}

async function persistTribunalResume(context = {}, resumePackage = null) {
  if (!resumePackage || resumePackage.contract !== "CREATIVE_TRIBUNAL_RESUME_PACKAGE_V1") return null;
  const current = await CreativeProjectRuntime.get(context.creative_project_id);
  if (!current || current.organization_id !== context.organization_id) {
    throw new Error("Creative project not found");
  }
  return CreativeProjectRuntime.update(current.id, {
    metadata: {
      ...(current.metadata || {}),
      [TRIBUNAL_RESUME_METADATA_KEY]: {
        contract: "CREATIVE_TRIBUNAL_DURABLE_RESUME_V1",
        organization_id: context.organization_id,
        creative_mission_id: context.creative_mission_id,
        creative_project_id: context.creative_project_id,
        persisted_at: new Date().toISOString(),
        resume_package: resumePackage,
      },
    },
  });
}

async function clearTribunalResume(context = {}) {
  const current = await CreativeProjectRuntime.get(context.creative_project_id);
  if (!current || current.organization_id !== context.organization_id) return null;
  if (!current.metadata?.[TRIBUNAL_RESUME_METADATA_KEY]) return current;
  const metadata = { ...(current.metadata || {}) };
  delete metadata[TRIBUNAL_RESUME_METADATA_KEY];
  return CreativeProjectRuntime.update(current.id, { metadata });
}

function restoreTribunalLineage(authoritativeMaster = {}, incomingMaster = {}) {
  const authoritative = object(authoritativeMaster);
  const incoming = object(incomingMaster);
  const authoritativePlan = object(authoritative.plan);
  const incomingPlan = object(incoming.plan);
  const incomingCouncil = object(incoming.independent_concept_council || incomingPlan.concept_council);
  const authoritativeCouncil = object(authoritative.independent_concept_council || authoritativePlan.concept_council);
  const mergedCouncilBase = Object.keys(authoritativeCouncil).length || Object.keys(incomingCouncil).length
    ? { ...incomingCouncil, ...authoritativeCouncil }
    : null;
  const selectedCouncilConcept = object(
    mergedCouncilBase?.selection?.selected_concept ||
    list(mergedCouncilBase?.concepts)[0],
  );
  const derivedConceptHash = Object.keys(selectedCouncilConcept).length
    ? fingerprint(selectedCouncilConcept)
    : null;
  const derivedCouncilHash = mergedCouncilBase
    ? fingerprint({
        contract: mergedCouncilBase.contract || null,
        selection: object(mergedCouncilBase.selection),
      })
    : null;
  const mergedCouncil = mergedCouncilBase
    ? {
        ...mergedCouncilBase,
        concept_hash:
          authoritativeCouncil.concept_hash ||
          incomingCouncil.concept_hash ||
          derivedConceptHash,
        council_hash:
          authoritativeCouncil.council_hash ||
          incomingCouncil.council_hash ||
          derivedCouncilHash,
      }
    : null;
  return {
    ...incoming,
    ...authoritative,
    independent_concept_council: mergedCouncil,
    plan: {
      ...incomingPlan,
      ...authoritativePlan,
      concept_council: mergedCouncil,
      selected_concept_id:
        authoritativePlan.selected_concept_id ||
        incomingPlan.selected_concept_id ||
        mergedCouncil?.selection?.selected_concept_id ||
        null,
      production: {
        ...object(incomingPlan.production),
        ...object(authoritativePlan.production),
        ...(mergedCouncil?.council_hash ? { concept_council_hash: mergedCouncil.council_hash } : {}),
        ...(mergedCouncil?.concept_hash ? { selected_concept_hash: mergedCouncil.concept_hash } : {}),
      },
      common_plan_contract: authoritativePlan.common_plan_contract || incomingPlan.common_plan_contract || null,
      validation_summary: authoritativePlan.validation_summary || incomingPlan.validation_summary || null,
    },
  };
}

async function reviewWithDurableResume(context = {}, reviewInput = {}) {
  const currentProject = await CreativeProjectRuntime.get(context.creative_project_id);
  const scopedProject = currentProject || context.project;
  const approvedCheckpoint = storedTribunalApprovedMaster(scopedProject, context);
  if (approvedCheckpoint) return restoreTribunalLineage(approvedCheckpoint, reviewInput.master);

  // Rehydrate durable Tribunal state for every Director branch. The normal challenger
  // path previously ignored it and recomposed a fresh paid panel after a rejection.
  const storedResume = storedTribunalResume(scopedProject, context) || {};
  const storedPlan = object(storedResume.repaired_plan);
  const incomingMaster = object(reviewInput.master);
  let effectiveMaster = Object.keys(storedPlan).length
    ? restoreTribunalLineage({ ...incomingMaster, plan: storedPlan }, incomingMaster)
    : reviewInput.master;
  let effectiveCapabilities = list(reviewInput.available_capabilities);

  // Re-derive system-owned policy shape and the registered production capability context
  // before a durable Tribunal resume. This is deterministic and prevents resumed repairs
  // from failing merely because a transient temporal object omitted capability metadata.
  if (effectiveMaster?.plan) {
    const compatiblePlan = CreativeConceptCouncilRuntime.normalizeDecisionGateCompatibility(
      effectiveMaster.plan,
      {},
    );
    const validatedExisting = await CreativeMasterPlanRuntime.validateExistingPlan({
      organization_id: context.organization_id,
      mission: context.mission,
      project: effectiveMaster.project || context.project,
      brief: context.brief,
      assets: context.assets,
      plan: compatiblePlan,
    });
    effectiveMaster = {
      ...effectiveMaster,
      plan: validatedExisting.plan,
      available_production_capabilities: validatedExisting.available_production_capabilities || [],
    };
    if (!effectiveCapabilities.length) {
      effectiveCapabilities = list(validatedExisting.available_production_capabilities);
    }
  }

  const effectiveReviewInput = {
    ...reviewInput,
    master: effectiveMaster,
    available_capabilities: effectiveCapabilities,
    review_panel: reviewInput.review_panel || storedResume.review_panel || null,
    settled_reviews: list(reviewInput.settled_reviews).length
      ? reviewInput.settled_reviews
      : list(storedResume.settled_reviews),
    settled_review_plan_hash:
      reviewInput.settled_review_plan_hash || storedResume.settled_review_plan_hash || null,
    settled_review_source_plan:
      reviewInput.settled_review_source_plan || storedResume.settled_review_source_plan || null,
  };
  try {
    const master = await CreativeDynamicTribunalRuntime.review(effectiveReviewInput);
    await persistTribunalApprovedMaster(context, master);
    await clearTribunalResume(context);
    return master;
  } catch (error) {
    if (error?.resume_package) {
      try {
        const nextResume = { ...error.resume_package };
        if (!list(nextResume.settled_reviews).length && list(storedResume.settled_reviews).length) {
          nextResume.review_panel = nextResume.review_panel || storedResume.review_panel || null;
          nextResume.settled_reviews = storedResume.settled_reviews;
          nextResume.settled_review_source_plan = storedResume.settled_review_source_plan || nextResume.settled_review_source_plan || null;
          nextResume.settled_review_plan_hash = storedResume.settled_review_plan_hash || nextResume.settled_review_plan_hash || null;
        }
        await persistTribunalResume(context, nextResume);
      } catch (persistenceError) {
        error.resume_persistence_error = String(persistenceError?.message || persistenceError);
      }
    }
    throw error;
  }
}

async function clearResolvedDirectionCheckpoints(context = {}) {
  await clearTribunalResume(context);
  await clearTribunalApprovedMaster(context);
  await clearCouncilCheckpoint(context);
  await clearPostRepairMasterCheckpoint(context);
}

function normalizedDirectionLabel(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function rejectedDirectionLineageMatch(project = {}, plan = {}) {
  const currentTitle = normalizedDirectionLabel(plan?.concept?.title);
  if (!currentTitle) return null;
  const history = Array.isArray(project?.metadata?.rejected_direction_history)
    ? project.metadata.rejected_direction_history
    : [];
  for (const entry of history) {
    const rejectedTitle = normalizedDirectionLabel(entry?.title);
    if (!rejectedTitle) continue;
    if (
      currentTitle === rejectedTitle ||
      currentTitle.startsWith(`${rejectedTitle} `) ||
      rejectedTitle.startsWith(`${currentTitle} `)
    ) {
      return entry;
    }
  }
  return null;
}

async function bootstrapResolvedProductionRooms({ context, project, brief, researched = {}, master }) {
  const workflowKind = text(master.plan?.workflow_kind);
  const workflow = CreativeWorkflowRegistry.require(workflowKind);
  const incomingPreproductionCreativeRepair =
    master?.preproduction_creative_repair?.after?.passed === true
      ? master.preproduction_creative_repair
      : null;
  const incomingCreativeTribunal =
    master?.plan?.creative_tribunal?.passed === true
      ? master.plan.creative_tribunal
      : (master?.creative_tribunal?.passed === true
          ? master.creative_tribunal
          : (master?.preproduction_creative_repair?.plan?.creative_tribunal?.passed === true
              ? master.preproduction_creative_repair.plan.creative_tribunal
              : null));
  const incomingConceptCouncil =
    master?.independent_concept_council ||
    master?.plan?.independent_concept_council ||
    null;
  const incomingLineageRecoveryAuthority =
    master?.lineage_recovery_authority ||
    master?.creative_story_lineage_recovery ||
    null;
  let resolvedMaster = master;
  if (
    workflow.workflow_kind === "TEMPORAL" &&
    incomingCreativeTribunal?.passed === true &&
    !list(resolvedMaster.plan?.scenes).length
  ) {
    const directionApprovedMaster = {
      ...resolvedMaster,
      creative_tribunal: incomingCreativeTribunal,
      plan: {
        ...resolvedMaster.plan,
        creative_tribunal: incomingCreativeTribunal,
      },
    };
    const directedMaster = await CreativeUniversalTemporalDirectionRuntime.create({
      organization_id: context.organization_id,
      mission: context.mission,
      project,
      brief,
      assets: researched?.assets || context.assets || [],
      approved_master: directionApprovedMaster,
    });
    resolvedMaster = {
      ...directedMaster,
      ...(incomingPreproductionCreativeRepair
        ? { preproduction_creative_repair: incomingPreproductionCreativeRepair }
        : {}),
      ...(incomingCreativeTribunal
        ? { creative_tribunal: incomingCreativeTribunal }
        : {}),
      ...(incomingConceptCouncil
        ? { independent_concept_council: incomingConceptCouncil }
        : {}),
      ...(incomingLineageRecoveryAuthority
        ? { lineage_recovery_authority: incomingLineageRecoveryAuthority }
        : {}),
      plan: {
        ...directedMaster.plan,
        ...(incomingCreativeTribunal
          ? { creative_tribunal: incomingCreativeTribunal }
          : {}),
        ...(incomingConceptCouncil
          ? { independent_concept_council: incomingConceptCouncil }
          : {}),
      },
    };
  }
  const initialMasterPlanDigest = masterPlanDigest(resolvedMaster.plan);
  const durableState = workflow.workflow_kind === "TEMPORAL"
    ? readPreproductionDurableState({
        project: context.project,
        context,
        master_plan_digest: initialMasterPlanDigest,
      })
    : null;
  const repairedFloorEvidence = resolvedMaster.preproduction_creative_repair?.after || null;
  const repairedCreativeFloorReport =
    repairedFloorEvidence?.passed === true
      ? {
          contract: "CREATIVE_FRONT_PRODUCTION_ROOMS_V1",
          room: "CREATIVE_FLOOR",
          passed: true,
          failures: [],
          benchmark_lab:
            repairedFloorEvidence.study ||
            repairedFloorEvidence.benchmark_lab ||
            null,
        }
      : null;
  const effectiveDurableState = repairedCreativeFloorReport
    ? {
        ...(durableState || {}),
        production_room_pipeline: {
          ...(durableState?.production_room_pipeline || {}),
          stages: (() => {
            const stages = list(durableState?.production_room_pipeline?.stages);
            const replaced = stages.map((stage) =>
              text(stage?.id).toUpperCase() === "CREATIVE_FLOOR"
                ? {
                    ...stage,
                    status: "SEALED",
                    report: repairedCreativeFloorReport,
                  }
                : stage,
            );
            return replaced.some((stage) => text(stage?.id).toUpperCase() === "CREATIVE_FLOOR")
              ? replaced
              : [{
                  id: "CREATIVE_FLOOR",
                  status: "SEALED",
                  report: repairedCreativeFloorReport,
                }];
          })(),
        },
        production_room_stage_inputs: {
          ...(durableState?.production_room_stage_inputs || {}),
          CREATIVE_FLOOR: {
            ...object(durableState?.production_room_stage_inputs?.CREATIVE_FLOOR),
            room_report: repairedCreativeFloorReport,
          },
        },
        reports_by_stage: durableState?.reports_by_stage || {},
        specialist_wave_audit: durableState?.specialist_wave_audit || [],
      }
    : durableState;
  let productionRooms = workflow.workflow_kind === "TEMPORAL"
    ? bootstrapProductionRooms({
        project,
        brief,
        research: researched?.research || {},
        universal_asset_intelligence: researched?.universal_asset_intelligence || {},
        master: resolvedMaster,
        durable_state: effectiveDurableState,
      })
    : null;

  const creativeFloorBlocked =
    productionRooms?.upstream_handoff_failure?.stage_id === "CREATIVE_FLOOR" &&
    text(productionRooms?.upstream_handoff_failure?.error).includes("BENCHMARK_LAB");
  if (creativeFloorBlocked) {
    const research = object(researched?.research);
    const researchMetadata = object(research.metadata);
    const researchGrounding = object(research.creative_grounding || researchMetadata.creative_grounding);
    const benchmarkLab =
      resolvedMaster.plan?.benchmark_lab ||
      resolvedMaster.plan?.production?.benchmark_lab ||
      researchGrounding.benchmark_lab ||
      researchMetadata.benchmark_lab ||
      research.benchmark_lab ||
      {};
    const failures = list(
      productionRooms?.stage_inputs?.CREATIVE_FLOOR?.room_report?.benchmark_lab?.failures,
    );
    const repair = await repairCreativeFloorPlan({
      organization_id: context.organization_id,
      creative_project_id: context.creative_project_id,
      plan: resolvedMaster.plan,
      benchmark_lab: benchmarkLab,
      failures,
    });
    resolvedMaster = {
      ...resolvedMaster,
      plan: repair.plan,
      preproduction_creative_repair: repair,
    };
    await persistPostRepairMasterCheckpoint(context, resolvedMaster);
    const repairedRoomReport = repair.after?.passed === true
      ? {
          contract: "CREATIVE_FRONT_PRODUCTION_ROOMS_V1",
          room: "CREATIVE_FLOOR",
          passed: true,
          failures: [],
          benchmark_lab: repair.after.study || repair.after.benchmark_lab || null,
        }
      : null;
    productionRooms = bootstrapProductionRooms({
      project,
      brief,
      research: researched?.research || {},
      universal_asset_intelligence: researched?.universal_asset_intelligence || {},
      master: resolvedMaster,
      durable_state: repairedRoomReport
        ? {
            production_room_pipeline: {
              stages: [{
                id: "CREATIVE_FLOOR",
                status: "SEALED",
                report: repairedRoomReport,
              }],
            },
            production_room_stage_inputs: {
              CREATIVE_FLOOR: { room_report: repairedRoomReport },
            },
            reports_by_stage: {},
            specialist_wave_audit: [],
          }
        : null,
    });
  }

  const finalMasterPlanDigest = masterPlanDigest(resolvedMaster.plan) || initialMasterPlanDigest;
  if (productionRooms) {
    await persistPreproductionDurableState({
      context,
      master_plan_digest: finalMasterPlanDigest,
      state: {
        production_room_pipeline: productionRooms.production_room_pipeline,
        reports_by_stage: productionRooms.reports_by_stage || {},
        production_room_stage_inputs: productionRooms.stage_inputs || {},
        specialist_wave_audit: creativeFloorBlocked ? [] : (durableState?.specialist_wave_audit || []),
        preproduction_continuation: productionRooms.preproduction_continuation || null,
      },
    });
    if (productionRooms.upstream_handoff_failure) {
      const stage = text(productionRooms.upstream_handoff_failure.stage_id) || "UNKNOWN";
      const reason = text(productionRooms.upstream_handoff_failure.error) || "UPSTREAM_ROOM_NOT_SEALED";
      throw new Error(`CREATIVE_UPSTREAM_PRODUCTION_ROOM_BLOCKED:${stage}:${reason}`);
    }

  }
  const governedMaster = productionRooms
    ? {
        ...resolvedMaster,
        plan: {
          ...resolvedMaster.plan,
          production_room_pipeline: productionRooms.production_room_pipeline,
          production_room_bootstrap: productionRooms,
        },
        production_room_bootstrap: productionRooms,
      }
    : resolvedMaster;

  if (
    creativeFloorBlocked &&
    productionRooms &&
    !productionRooms.upstream_handoff_failure
  ) {
    await persistPostRepairMasterCheckpoint(context, governedMaster);
  }

  return { workflow, productionRooms, governedMaster };
}

export const CreativeWorkflowResolutionRuntime = Object.freeze({
  async finalizeResolvedHandoff(input = {}) {
    const context = await resolveContext(input);
    await clearResolvedDirectionCheckpoints(context);
    return { cleared: true };
  },

  async resolve(input = {}) {
    const context = await resolveContext(input);
    const forceDirectionRestart =
      input.force_direction_restart === true ||
      context.project?.metadata?.creative_direction_human_rejection?.restart_required === true;
    if (forceDirectionRestart) {
      await clearResolvedDirectionCheckpoints(context);
      if (context.project?.metadata?.creative_direction_human_rejection?.restart_required === true) {
        const current = await CreativeProjectRuntime.get(context.creative_project_id);
        if (current && current.organization_id === context.organization_id) {
          await CreativeProjectRuntime.update(current.id, {
            metadata: {
              ...(current.metadata || {}),
              creative_direction_human_rejection: {
                ...current.metadata.creative_direction_human_rejection,
                restart_required: false,
                restart_consumed_at: new Date().toISOString(),
              },
            },
          });
        }
      }
    }
    const challengerCheckpoint = forceDirectionRestart
      ? null
      : storedChallengerSelectionCheckpoint(context.project, context);
    if (challengerCheckpoint) {
      const declared = CreativeWorkflowRegistry.resolveDeclared({ input, project: context.project });
      const directionProject = projectForDirection(context.project, declared);
      const temporal = await CreativeTemporalMasterPlanRuntime.create({
        organization_id: context.organization_id,
        mission: context.mission,
        project: directionProject,
        brief: context.brief,
        assets: context.assets,
      });
      const selectorUsage = await UsageRuntime.get(challengerCheckpoint.selected_base_usage_id);
      if (!selectorUsage || String(selectorUsage.status || "").toUpperCase() !== "SUCCESS") {
        throw new Error("CREATIVE_CHALLENGER_SELECTED_BASE_USAGE_REQUIRED");
      }
      const selectedConcept = temporal.plan?.concept || {};
      const selection = {
        selected_concept_id: challengerCheckpoint.selected_concept_id,
        selected_title: challengerCheckpoint.selected_title,
        confidence: challengerCheckpoint.confidence,
        selector_job_id: challengerCheckpoint.selector_job_id,
        selected_base_usage_id: challengerCheckpoint.selected_base_usage_id,
        selected_concept: selectedConcept,
      };
      const conceptHash = fingerprint(selectedConcept);
      const councilHash = fingerprint({
        contract: "CREATIVE_STUDIO_CHALLENGER_SELECTION_V1",
        selection,
      });
      const council = {
        contract: "CREATIVE_STUDIO_CHALLENGER_SELECTION_V1",
        selection,
        concepts: [selectedConcept].filter((entry) => Object.keys(object(entry)).length),
        concept_hash: conceptHash,
        council_hash: councilHash,
      };
      const challengerPlan = {
        ...temporal.plan,
        selected_concept_id: challengerCheckpoint.selected_concept_id,
        concept_council: council,
        production: {
          ...object(temporal.plan?.production),
          concept_council_hash: councilHash,
          selected_concept_hash: conceptHash,
        },
      };
      const challengerMaster = {
        ...temporal,
        plan: challengerPlan,
        independent_concept_council: council,
      };
      const master = await reviewWithDurableResume(context, {
        organization_id: context.organization_id,
        creative_mission_id: context.creative_mission_id,
        creative_project_id: context.creative_project_id,
        mission: context.mission,
        project: directionProject,
        brief: context.brief,
        assets: context.assets,
        available_capabilities: temporal.available_production_capabilities || [],
        master: challengerMaster,
      });
      const resolved = await bootstrapResolvedProductionRooms({
        context,
        project: directionProject,
        brief: context.brief,
        master,
      });
      await persistTemporalDirectionCheckpoint(context, resolved.governedMaster);
      await clearChallengerSelectionCheckpoint(context);
      return {
        ...context,
        project: directionProject,
        brief: context.brief,
        declared_workflow: declared,
        workflow: resolved.workflow,
        master: resolved.governedMaster,
        production_room_bootstrap: resolved.productionRooms,
        resumed_studio_challenger_selection: true,
      };
    }
    const postRepairCheckpoint = forceDirectionRestart
      ? null
      : storedPostRepairMasterCheckpoint(context.project, context);
    const councilCheckpoint = forceDirectionRestart
      ? null
      : storedCouncilCheckpoint(context.project, context);
    const temporalCheckpoint = forceDirectionRestart
      ? null
      : storedTemporalDirectionCheckpoint(context.project, context);
    const effectiveTemporalCheckpoint =
      postRepairCheckpoint?.preproduction_creative_repair?.after?.passed === true
        ? null
        : temporalCheckpoint;
    if (effectiveTemporalCheckpoint) {
      const declared = CreativeWorkflowRegistry.resolveDeclared({ input, project: context.project });
      const directionProject = projectForDirection(context.project, declared);
      const researched = await resolveCreativeDirectionResearch({
        organization_id: context.organization_id,
        mission: context.mission,
        project: directionProject,
        brief: context.brief,
        assets: context.assets,
        force_research: false,
      });
      const directionBrief = researched.brief || context.brief;
      const resolved = await bootstrapResolvedProductionRooms({
        context,
        project: researched.project || directionProject,
        brief: directionBrief,
        researched,
        master: effectiveTemporalCheckpoint,
      });
      const { workflow, productionRooms, governedMaster } = resolved;
      if (declared && workflow.workflow_kind !== declared.workflow_kind) {
        throw new Error(`CREATIVE_WORKFLOW_CONSTRAINT_MISMATCH:${declared.workflow_kind}:${workflow.workflow_kind}`);
      }
      return {
        ...context,
        project: researched.project || directionProject,
        brief: directionBrief,
        research: researched.research || null,
        research_validation: researched.research_validation || null,
        universal_asset_intelligence: researched.universal_asset_intelligence || null,
        creative_learning: null,
        declared_workflow: declared,
        workflow,
        master: governedMaster,
        production_room_bootstrap: productionRooms,
        resumed_temporal_direction_checkpoint: true,
      };
    }
    const approvedCouncilResumeCheckpoint = forceDirectionRestart
      ? null
      : (
          storedPostRepairMasterCheckpoint(context.project, context) ||
          storedCouncilCheckpoint(context.project, context)
        );
    if (approvedCouncilResumeCheckpoint) {
      const semanticStructureUpgrade =
        masterStoryRequired(context) && !completeMasterStory(approvedCouncilResumeCheckpoint.plan);
      const settledRepairs = semanticStructureUpgrade
        ? []
        : await recoverSettledPostCouncilRepairs(context.project);
      return CreativeWorkflowResolutionRuntime.resumeApprovedCouncil({
        ...input,
        approved_master: approvedCouncilResumeCheckpoint,
        master_repair_results: settledRepairs,
      });
    }
    const declared = CreativeWorkflowRegistry.resolveDeclared({
      input,
      project: context.project,
    });
    const rejectedDirectionCheckpoint = forceDirectionRestart
      ? (storedPostRepairMasterCheckpoint(context.project, context) ||
        storedCouncilCheckpoint(context.project, context) ||
        storedTemporalDirectionCheckpoint(context.project, context))
      : null;
    const rejectedDirectionPlan = rejectedDirectionCheckpoint?.plan || null;
    const restartRejectionContext = rejectedDirectionPlan
      ? {
          contract: "CREATIVE_FRESH_DIRECTION_REJECTION_MEMORY_V1",
          rejected_concept: rejectedDirectionPlan.concept || null,
          rejected_story: rejectedDirectionPlan.story || null,
          rejected_patterns: rejectedDirectionPlan.creative_review?.rejected_patterns || [],
          instruction: "This prior direction was explicitly rejected. Do not rename, reskin, hybridize or reuse its governing metaphor, signature device, visual system, causal narrative engine or abstract proof mechanism. Invent a materially different mission-specific direction.",
        }
      : null;
    const restartAwareProject = restartRejectionContext
      ? {
          ...context.project,
          metadata: {
            ...(context.project?.metadata || {}),
            creative_fresh_direction_rejection_memory: restartRejectionContext,
          },
        }
      : context.project;
    const constrainedProject = projectForDirection(restartAwareProject, declared);

    let researched = null;
    let learned = null;
    let directionProject = constrainedProject;
    let directionBrief = context.brief;

    // Recover settled paid direction before any new research or generation. A human
    // fresh-direction rejection can still discard that recovered creative seed.
    let initialMaster = await recoverSettledInitialMaster({
      context,
      project: directionProject,
      brief: directionBrief,
      assets: context.assets,
    });
    if (forceDirectionRestart) initialMaster = null;

    if (!initialMaster) {
      researched = await resolveCreativeDirectionResearch({
        organization_id: context.organization_id,
        mission: context.mission,
        project: constrainedProject,
        brief: context.brief,
        assets: context.assets,
        force_research: input.force_research === true,
        reuse_completed_research_on_direction_restart:
          forceDirectionRestart === true,
      });

      learned = await enrichCreativeDirectionWithLearning({
        organization_id: context.organization_id,
        mission: context.mission,
        project: researched.project || constrainedProject,
        brief: researched.brief || context.brief,
        assets: context.assets,
      });

      directionProject = learned.project || researched.project || constrainedProject;
      directionBrief = researched.brief || context.brief;
      initialMaster = await CreativeMasterPlanRuntime.create({
        organization_id: context.organization_id,
        mission: context.mission,
        project: directionProject,
        brief: directionBrief,
        assets: context.assets,
      });
    }

    const rejectedLineage = rejectedDirectionLineageMatch(directionProject, initialMaster.plan);
    if (rejectedLineage) {
      const failure = new Error(`CREATIVE_MASTER_PLAN_REJECTED_LINEAGE:${rejectedLineage.title || "UNKNOWN"}`);
      failure.rejected_direction = rejectedLineage;
      failure.rejected_plan = initialMaster.plan;
      throw failure;
    }

    const council = await CreativeConceptCouncilRuntime.run(
      {
        organization_id: context.organization_id,
        mission: context.mission,
        project: directionProject,
        brief: directionBrief,
        assets: context.assets,
      },
      initialMaster,
    );
    const councilMaster = {
      ...initialMaster,
      plan: council.plan,
      independent_concept_council: council.council,
      usage: {
        ...(initialMaster.usage || {}),
        concept_council: council.usage,
      },
      billing: {
        ...(initialMaster.billing || {}),
        concept_council: council.billing,
      },
    };

    await persistCouncilCheckpoint(context, councilMaster);

    const recoveredTribunalResume = await recoverSettledTribunalResume({
      context,
      project: directionProject,
      master: councilMaster,
      available_capabilities: initialMaster.available_production_capabilities || [],
    });
    const tribunalMasterRaw = recoveredTribunalResume?.replayed_plan
      ? { ...councilMaster, plan: recoveredTribunalResume.replayed_plan }
      : councilMaster;
    const tribunalMaster = {
      ...tribunalMasterRaw,
      plan: CreativeExactClaimAuthorityRuntime.ground({
        plan: tribunalMasterRaw.plan,
        mission: context.mission,
      }),
    };
    const master = await reviewWithDurableResume(context, {
      organization_id: context.organization_id,
      creative_mission_id: context.creative_mission_id,
      creative_project_id: context.creative_project_id,
      mission: context.mission,
      project: directionProject,
      brief: directionBrief,
      assets: context.assets,
      available_capabilities: initialMaster.available_production_capabilities || [],
      master: tribunalMaster,
      review_panel: recoveredTribunalResume?.review_panel || null,
      settled_reviews: recoveredTribunalResume?.settled_reviews || [],
      settled_review_plan_hash: recoveredTribunalResume?.settled_review_plan_hash || null,
      settled_review_source_plan: recoveredTribunalResume?.settled_review_source_plan || null,
    });

    const resolved = await bootstrapResolvedProductionRooms({
      context,
      project: directionProject,
      brief: directionBrief,
      researched,
      master,
    });
    const { workflow, productionRooms, governedMaster } = resolved;

    if (declared && workflow.workflow_kind !== declared.workflow_kind) {
      throw new Error(
        `CREATIVE_WORKFLOW_CONSTRAINT_MISMATCH:${declared.workflow_kind}:${workflow.workflow_kind}`,
      );
    }
    await persistTemporalDirectionCheckpoint(context, resolved.governedMaster);
    await clearResolvedDirectionCheckpoints(context);

    return {
      ...context,
      project: directionProject,
      brief: directionBrief,
      research: researched?.research || null,
      research_validation: researched?.research_validation || null,
      universal_asset_intelligence: researched?.universal_asset_intelligence || null,
      creative_learning: learned?.creative_learning || null,
      declared_workflow: declared,
      workflow,
      master: governedMaster,
      production_room_bootstrap: productionRooms,
    };
  },

  async resumeApprovedCouncil(input = {}) {
    const context = await resolveContext(input);
    // Durable post-repair state is later authority than the original Council
    // checkpoint and than any stale master carried through a resumed caller.
    // Prefer that exact persisted plan so restart cannot resurrect superseded
    // asset manifests, role decisions or already-repaired Tribunal state.
    const approvedMasterSource =
      storedPostRepairMasterCheckpoint(context.project, context) ||
      input.approved_master ||
      input.master ||
      storedCouncilCheckpoint(context.project, context) ||
      null;
    if (!approvedMasterSource) throw new Error("CREATIVE_APPROVED_COUNCIL_MASTER_REQUIRED");
    const tribunalApprovedFallback = storedTribunalApprovedMaster(context.project, context);
    const approvedConceptId =
      text(approvedMasterSource?.plan?.concept?.id) ||
      text(approvedMasterSource?.plan?.selected_concept_id);
    const tribunalConceptId =
      text(tribunalApprovedFallback?.plan?.concept?.id) ||
      text(tribunalApprovedFallback?.plan?.selected_concept_id);
    const matchingTribunalAuthority =
      tribunalApprovedFallback?.plan?.creative_tribunal?.passed === true &&
      tribunalApprovedFallback?.plan?.creative_tribunal?.verdict?.passed === true &&
      approvedConceptId &&
      approvedConceptId === tribunalConceptId
        ? tribunalApprovedFallback.plan.creative_tribunal
        : null;
    const approvedMaster = {
      ...approvedMasterSource,
      ...(approvedMasterSource.creative_tribunal
        ? {}
        : (matchingTribunalAuthority ? { creative_tribunal: matchingTribunalAuthority } : {})),
      plan: CreativeVerifiedBrandAssetBindingRuntime.reconcilePlan({
        plan: {
          ...approvedMasterSource.plan,
          ...(approvedMasterSource.plan?.creative_tribunal
            ? {}
            : (matchingTribunalAuthority ? { creative_tribunal: matchingTribunalAuthority } : {})),
        },
        project: context.project,
        assets: context.assets,
      }),
    };

    const declared = CreativeWorkflowRegistry.resolveDeclared({
      input,
      project: context.project,
    });
    const directionProject = projectForDirection(context.project, declared);
    const directionBrief = context.brief;

    const approvedRepairPassed =
      approvedMaster.preproduction_creative_repair?.after?.passed === true &&
      list(approvedMaster.preproduction_creative_repair?.after?.failures).length === 0;

    // A persisted post-repair PASS master is later authority than Council/Tribunal
    // regeneration. Resume production from that exact plan, seal the digest-scoped
    // production rooms, persist the temporal direction checkpoint, and return.
    // Re-open Council/Tribunal only when the repaired master is incomplete.
    if (approvedRepairPassed) {
      const resumedResearch = await resolveCreativeDirectionResearch({
        organization_id: context.organization_id,
        mission: context.mission,
        project: directionProject,
        brief: directionBrief,
        assets: context.assets,
        force_research: false,
        reuse_completed_research_on_direction_restart: true,
      });
      const resumedProject = resumedResearch.project || directionProject;
      const resumedBrief = resumedResearch.brief || directionBrief;
      const resolved = await bootstrapResolvedProductionRooms({
        context,
        project: resumedProject,
        brief: resumedBrief,
        researched: resumedResearch,
        master: approvedMaster,
      });
      if (declared && resolved.workflow.workflow_kind !== declared.workflow_kind) {
        throw new Error(`CREATIVE_WORKFLOW_CONSTRAINT_MISMATCH:${declared.workflow_kind}:${resolved.workflow.workflow_kind}`);
      }
      await persistTemporalDirectionCheckpoint(context, resolved.governedMaster);
      await clearTribunalResume(context);
      await clearTribunalApprovedMaster(context);
      await clearCouncilCheckpoint(context);
      return {
        ...context,
        project: resumedProject,
        brief: resumedBrief,
        research: resumedResearch.research || null,
        research_validation: resumedResearch.research_validation || null,
        universal_asset_intelligence: resumedResearch.universal_asset_intelligence || null,
        declared_workflow: declared,
        workflow: resolved.workflow,
        master: resolved.governedMaster,
        production_room_bootstrap: resolved.productionRooms,
        resumed_from_repaired_master: true,
      };
    }

    const resumedCouncil = await CreativeConceptCouncilRuntime.resumeApprovedCouncilPlan({
      organization_id: context.organization_id,
      mission: context.mission,
      project: directionProject,
      brief: directionBrief,
      assets: context.assets,
      approved_master: approvedMaster,
      repair_results:
        input.master_repair_results ||
        input.repair_results ||
        await recoverSettledPostCouncilRepairs(directionProject),
    });
    const councilMaster = {
      ...approvedMaster,
      plan: resumedCouncil.plan,
      independent_concept_council: resumedCouncil.independent_concept_council,
      post_revision_master_validation: resumedCouncil.post_revision_master_validation,
    };
    const lineageRecovery =
      approvedMaster.resume_checkpoint_contract === "CREATIVE_STORY_LINEAGE_RECOVERY_V1";

    // Settled Tribunal repairs are later paid authority than the Council checkpoint.
    // Never persist the pre-replay Council master as the post-repair checkpoint: doing
    // so resurrects already-repaired failures on every restart and causes paid review
    // loops. Replay the durable Tribunal ledger first, then checkpoint that exact plan.
    const recoveredTribunalResume = lineageRecovery
      ? null
      : await recoverSettledTribunalResume({
          context,
          project: directionProject,
          master: councilMaster,
          available_capabilities: resumedCouncil.available_production_capabilities || approvedMaster.available_production_capabilities || [],
        });
    const tribunalResumeCandidates = lineageRecovery
      ? []
      : [
          recoveredTribunalResume,
          input.tribunal_resume_package,
          approvedMaster.tribunal_resume_package,
          approvedMaster.creative_tribunal?.resume_package,
          storedTribunalResume(context.project, context),
        ].filter(Boolean);
    const tribunalResume = tribunalResumeCandidates.find((resume) =>
      Array.isArray(resume?.review_panel?.reviewers) && resume.review_panel.reviewers.length > 0,
    ) || tribunalResumeCandidates.find((resume) =>
      Array.isArray(resume?.settled_reviews) && resume.settled_reviews.length > 0,
    ) || recoveredTribunalResume || {};

    const tribunalMasterRaw = recoveredTribunalResume?.replayed_plan
      ? { ...councilMaster, plan: recoveredTribunalResume.replayed_plan }
      : councilMaster;
    const tribunalMaster = {
      ...tribunalMasterRaw,
      plan: CreativeExactClaimAuthorityRuntime.ground({
        plan: tribunalMasterRaw.plan,
        mission: context.mission,
      }),
    };
    await persistPostRepairMasterCheckpoint(context, tribunalMaster);
    if (recoveredTribunalResume?.contract === "CREATIVE_TRIBUNAL_RESUME_PACKAGE_V1") {
      await persistTribunalResume(context, recoveredTribunalResume);
    }

    const master = await reviewWithDurableResume(context, {
      organization_id: context.organization_id,
      creative_mission_id: context.creative_mission_id,
      creative_project_id: context.creative_project_id,
      mission: context.mission,
      project: directionProject,
      brief: directionBrief,
      assets: context.assets,
      available_capabilities: resumedCouncil.available_production_capabilities || approvedMaster.available_production_capabilities || [],
      master: tribunalMaster,
      review_panel: input.review_panel || tribunalResume.review_panel || approvedMaster.creative_tribunal?.review_panel || null,
      settled_reviews: input.settled_reviews || tribunalResume.settled_reviews || [],
      settled_review_plan_hash: input.settled_review_plan_hash || tribunalResume.settled_review_plan_hash || null,
      settled_review_source_plan: input.settled_review_source_plan || tribunalResume.settled_review_source_plan || null,
    });

    const resumedResearch = await resolveCreativeDirectionResearch({
      organization_id: context.organization_id,
      mission: context.mission,
      project: directionProject,
      brief: directionBrief,
      assets: context.assets,
      force_research: false,
      reuse_completed_research_on_direction_restart: true,
    });
    const resumedProject = resumedResearch.project || directionProject;
    const resumedBrief = resumedResearch.brief || directionBrief;

    const resolved = await bootstrapResolvedProductionRooms({
      context,
      project: resumedProject,
      brief: resumedBrief,
      researched: resumedResearch,
      master,
    });
    if (declared && resolved.workflow.workflow_kind !== declared.workflow_kind) {
      throw new Error(`CREATIVE_WORKFLOW_CONSTRAINT_MISMATCH:${declared.workflow_kind}:${resolved.workflow.workflow_kind}`);
    }
    await persistTemporalDirectionCheckpoint(context, resolved.governedMaster);
    await clearResolvedDirectionCheckpoints(context);

    return {
      ...context,
      project: resumedProject,
      brief: resumedBrief,
      research: resumedResearch.research || null,
      research_validation: resumedResearch.research_validation || null,
      universal_asset_intelligence: resumedResearch.universal_asset_intelligence || null,
      declared_workflow: declared,
      workflow: resolved.workflow,
      master: resolved.governedMaster,
      production_room_bootstrap: resolved.productionRooms,
      resumed_from_approved_council: true,
      council_resume: resumedCouncil,
    };
  },
});
