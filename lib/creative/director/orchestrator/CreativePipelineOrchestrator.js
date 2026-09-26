import { CreativeMissionRuntime } from "@/lib/creative/missions/runtime/CreativeMissionRuntime";
import { CreativeProjectRuntime } from "@/lib/creative/projects/runtime/CreativeProjectRuntime";
import { CreativeBriefRuntime } from "@/lib/creative/brief/runtime/CreativeBriefRuntime";
import { ResearchRuntime } from "@/lib/creative/research/runtime/ResearchRuntime";
import { CreativeStrategyRuntime } from "@/lib/creative/strategy/runtime/CreativeStrategyRuntime";
import { CreativeConceptRuntime } from "@/lib/creative/concepts/runtime/CreativeConceptRuntime";
import { StoryboardRuntime } from "@/lib/creative/storyboard/runtime/StoryboardRuntime";
import { SceneRuntime } from "@/lib/creative/scenes/runtime/SceneRuntime";
import { ShotRuntime } from "@/lib/creative/shots/runtime/ShotRuntime";
import { CreativeAssetsRuntime } from "@/lib/creative/assets/runtime/CreativeAssetsRuntime";
import { CreativeBrandFidelityRuntime } from "@/lib/creative/assets/intelligence/runtime/CreativeBrandFidelityRuntime";
import { CreativeMasterPlanRuntime } from "@/lib/creative/director/runtime/CreativeMasterPlanRuntime";
import {
  CreativeWorldClassConceptIntelligenceRuntime,
} from "@/lib/creative/director/runtime/CreativeWorldClassConceptIntelligenceRuntime";
import {
  WORLD_CLASS_CONCEPT_POLICY,
} from "@/lib/creative/director/runtime/CreativeWorldClassConceptPolicy";
import {
  CreativeUniversalTemporalDirectionRuntime,
  ensureUniversalTemporalDossier,
} from "@/lib/creative/director/runtime/CreativeUniversalTemporalDirectionRuntime";
import { CreativeStoryLineageContractRuntime } from "@/lib/creative/director/runtime/CreativeStoryLineageContractRuntime";
import { assertCreativeMasterPlan } from "@/lib/creative/director/validation/CreativeMasterPlanValidator";
import { ProductionGraphRuntime } from "@/lib/creative/production-graph/runtime/ProductionGraphRuntime";
import { ExecutionRuntime } from "@/lib/creative/execution/runtime/ExecutionRuntime";
import { AssetReuseEngine } from "@/lib/creative/assets/reuse/AssetReuseEngine";
import { ProductionTaskRuntime } from "@/lib/operations/tasks/runtime/ProductionTaskRuntime";
import { CreativeStateEngine, PIPELINE_STAGES } from "@/lib/creative/state/CreativeStateEngine";
import { resolveOrganizationTimeContext } from "@/lib/shared/time/organizationTime";
import crypto from "node:crypto";

function resolveMissionId(input = {}) {
  return input.creative_mission_id || input.mission_id || null;
}

function resolveProjectId(input = {}) {
  return input.creative_project_id || input.project_id || null;
}

function list(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function text(value) {
  return String(value ?? "").trim();
}

function finite(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function lineageHash(value) {
  return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

const TEMPORAL_DIRECTION_CHECKPOINT_KEY = "creative_temporal_direction_checkpoint";

function compactTemporalCheckpointMaster(master = {}) {
  const {
    production_room_bootstrap: ignoredBootstrap,
    production_room_pipeline: ignoredPipeline,
    ...masterRest
  } = object(master);
  const {
    production_room_bootstrap: ignoredPlanBootstrap,
    production_room_pipeline: ignoredPlanPipeline,
    ...planRest
  } = object(master.plan);
  return { ...masterRest, plan: planRest };
}

function recertifyTemporalMasterAgainstCurrentFloor(master = null, project = {}, assets = []) {
  if (!master) return null;
  const sourcePlan = object(master.plan || master);
  if (!list(sourcePlan.scenes).length) return null;
  const currentPlan = {
    ...sourcePlan,
    quality_profile: project.quality_profile || sourcePlan.quality_profile || null,
  };
  try {
    const validation = assertCreativeMasterPlan({ plan: currentPlan, assets: list(assets) });
    return {
      ...object(master),
      plan: { ...currentPlan, validation },
      validation,
      recertified_against_current_quality_floor: true,
    };
  } catch {
    return null;
  }
}

function temporalDirectionCheckpoint(project = {}, master = null, { assets = [], recertify = false } = {}) {
  const state = object(project.metadata?.[TEMPORAL_DIRECTION_CHECKPOINT_KEY]);
  if (state.contract !== "CREATIVE_TEMPORAL_DIRECTION_CHECKPOINT_V1") return null;
  const checkpointPlan = object(state.master?.plan);
  if (!list(checkpointPlan.scenes).length) return null;
  const universalReady =
    list(checkpointPlan.concept_candidates).length >= 3 &&
    Boolean(text(checkpointPlan.selected_concept_id)) &&
    Object.keys(object(checkpointPlan.music_world)).length > 0 &&
    checkpointPlan.production?.dry_run_dossier_required_before_paid_generation === true &&
    checkpointPlan.production?.reuse_policy === "NO_REUSE_UNLESS_EXPLICITLY_APPROVED";
  if (!universalReady) return null;
  const tribunalHash = text(master?.plan?.creative_tribunal?.tribunal_hash);
  if (tribunalHash && text(state.source_tribunal_hash) !== tribunalHash) return null;
  if (!recertify) return state.master;
  const recertified = recertifyTemporalMasterAgainstCurrentFloor(state.master, project, assets);
  return recertified ? { ...recertified, checkpoint_recertified_against_current_quality_floor: true } : null;
}

async function persistTemporalDirectionCheckpoint({ projectId, organizationId, missionId, master, sourceTribunalHash }) {
  const current = await CreativeProjectRuntime.get(projectId);
  if (!current || current.organization_id !== organizationId) throw new Error("Creative project not found");
  const existingCheckpoint = temporalDirectionCheckpoint(current, master);
  const existingPlan = object(existingCheckpoint?.plan);
  const incomingPlan = object(master?.plan);
  const existingLineage = storyLineage(existingPlan);
  const incomingLineage = storyLineage(incomingPlan);
  const existingShotCount = list(existingPlan.scenes).reduce((sum, scene) => sum + list(scene?.shots).length, 0);
  const incomingShotCount = list(incomingPlan.scenes).reduce((sum, scene) => sum + list(scene?.shots).length, 0);
  const existingCheckpointMatchesIncoming = Boolean(
    existingCheckpoint &&
    text(existingLineage.master_plan_hash) &&
    text(existingLineage.master_plan_hash) === text(incomingLineage.master_plan_hash) &&
    text(existingLineage.story_contract_hash) === text(incomingLineage.story_contract_hash) &&
    existingShotCount === incomingShotCount
  );
  let metadataBytes = Number.POSITIVE_INFINITY;
  try {
    metadataBytes = Buffer.byteLength(JSON.stringify(current.metadata || {}), "utf8");
  } catch {
    metadataBytes = Number.POSITIVE_INFINITY;
  }
  if (existingCheckpointMatchesIncoming && metadataBytes > 2 * 1024 * 1024) {
    return current;
  }
  return CreativeProjectRuntime.update(projectId, {
    metadata: {
      ...(current.metadata || {}),
      [TEMPORAL_DIRECTION_CHECKPOINT_KEY]: {
        contract: "CREATIVE_TEMPORAL_DIRECTION_CHECKPOINT_V1",
        organization_id: organizationId,
        creative_mission_id: missionId,
        creative_project_id: projectId,
        source_tribunal_hash: sourceTribunalHash || null,
        persisted_at: new Date().toISOString(),
        master: compactTemporalCheckpointMaster(master),
      },
    },
  });
}

function requiredDuration(value, label) {
  const number = finite(value);
  if (number === null || number <= 0) {
    throw new Error(`${label}_DURATION_REQUIRED`);
  }
  return number;
}

function projectCurrency(project = {}, plan = {}) {
  return (
    plan.production?.currency ||
    project.currency ||
    project.metadata?.currency ||
    project.metadata?.business_context?.currency ||
    null
  );
}

function storyLineage(value = {}) {
  return object(value.story_lineage || value.metadata?.story_lineage);
}

function lineageMetadata(value = {}) {
  const lineage = storyLineage(value);
  return {
    story_lineage: lineage,
    research_identity: lineage.research_identity || null,
    business_context_hash: lineage.business_context_hash || null,
    industry_context_hash: lineage.industry_context_hash || null,
    selected_concept_hash: lineage.selected_concept_hash || null,
    concept_council_hash: lineage.concept_council_hash || null,
    story_contract_hash: lineage.story_contract_hash || null,
    master_plan_hash: lineage.master_plan_hash || null,
    approval_plan_hash: lineage.approval_plan_hash || null,
  };
}

function lineageMatches(document = {}, lineage = {}) {
  const metadata = object(document.metadata);
  return Boolean(
    text(lineage.story_contract_hash) &&
    text(lineage.master_plan_hash) &&
    text(metadata.story_contract_hash) === text(lineage.story_contract_hash) &&
    text(metadata.master_plan_hash) === text(lineage.master_plan_hash) &&
    text(metadata.research_identity) === text(lineage.research_identity)
  );
}

function promptlessGeneration(value = {}) {
  const generation = object(value);
  const {
    prompt: ignoredPrompt,
    provider_prompt: ignoredProviderPrompt,
    negative_prompt: ignoredNegativePrompt,
    visual_prompt: ignoredVisualPrompt,
    video_prompt: ignoredVideoPrompt,
    ...structured
  } = generation;
  return structured;
}

function taskTypeFor(step = {}) {
  const capability = text(step.capability || step.service_code).toLowerCase();
  if (!capability) throw new Error("CREATIVE_EXECUTION_CAPABILITY_REQUIRED");
  if (capability.includes("image.upscale")) return "UPSCALE";
  if (capability.includes("image")) return "GENERATE_IMAGE";
  if (capability.includes("video")) return "GENERATE_VIDEO";
  if (capability.includes("voice")) return "GENERATE_VOICE";
  if (capability.includes("music")) return "GENERATE_MUSIC";
  if (capability.includes("sfx")) return "GENERATE_SFX";
  if (capability.includes("audio")) return "GENERATE_AUDIO";
  if (capability.includes("speech.to.text") || capability.includes("subtitle")) {
    return "SUBTITLE";
  }
  if (capability.includes("quality")) return "QUALITY_REVIEW";
  if (capability.includes("render")) return "RENDER_PRODUCTION";
  throw new Error(`CREATIVE_EXECUTION_CAPABILITY_UNSUPPORTED:${capability}`);
}

function plannedTakeMenu(masterPlan = {}, shotId = null) {
  const breakdown =
    masterPlan.production_room_bootstrap?.stage_inputs?.DEPARTMENT_BREAKDOWN?.report ||
    null;
  if (!breakdown?.contract || !shotId) return null;
  const assignment = list(breakdown.shot_assignments)
    .find((item) => String(item.shot_id || "") === String(shotId));
  const maxTakes = Number(breakdown.take_strategy?.max_takes_per_shot || 0);
  if (!assignment || !Number.isInteger(maxTakes) || maxTakes < 1 || maxTakes > 6) return null;
  return {
    contract: "CREATIVE_PLANNED_TAKE_MENU_V1",
    shot_id: shotId,
    unit_ids: list(assignment.unit_ids),
    continuity_keys: list(assignment.continuity_keys),
    max_takes_per_shot: maxTakes,
    planned_take_ids: Array.from({ length: maxTakes }, (_, index) => `take:${shotId}:${index + 1}`),
    selection_required_before_execution: true,
  };
}

export async function materializeProductionTasks({
  organization_id,
  creative_project_id,
  production_graph_id,
  executionPlan,
  project,
  masterPlan,
  currency: resolvedCurrency = null,
}) {
  const existing = await ProductionTaskRuntime.list({
    organization_id,
    creative_project_id,
    production_graph_id,
  });
  const existingByNode = new Map(
    existing
      .filter((task) => task.metadata?.execution_node_id)
      .map((task) => [task.metadata.execution_node_id, task]),
  );
  const taskByNode = new Map(existingByNode);
  const pendingByNode = new Map();
  const currency = resolvedCurrency || projectCurrency(project, masterPlan);
  const lineage = storyLineage(masterPlan);

  for (const step of executionPlan.steps || []) {
    if (existingByNode.has(step.node_id)) continue;

    const estimatedCost = Number(step.estimated_cost || 0);
    if (estimatedCost > 0 && !currency) {
      throw new Error("CREATIVE_PROJECT_CURRENCY_REQUIRED_FOR_COSTED_TASK");
    }

    const shotId = step.metadata?.node_type === "SHOT" ? step.node_id : null;
    const takeMenu = plannedTakeMenu(masterPlan, shotId);
    const task = {
      id: crypto.randomUUID(),
      organization_id,
      creative_project_id,
      production_graph_id,
      scene_id: step.metadata?.scene_id || null,
      shot_id: shotId,
      type: taskTypeFor(step),
      status: "WAITING",
      title: step.metadata?.node_title || "",
      description: step.metadata?.intent?.purpose || "",
      service_id: step.service_code,
      service_code: step.service_code,
      capability: step.capability,
      priority: Number(step.priority || 100),
      depends_on: [],
      input: {
        intent: step.metadata?.intent || {},
        requirements: {
          ...(step.metadata?.requirements || {}),
          planned_take_menu: takeMenu,
        },
        source_assets: step.metadata?.source_assets || [],
        generation: promptlessGeneration(step.metadata?.generation || {}),
        frame_contract: step.metadata?.frame_contract || {},
        provider_parameters: step.metadata?.provider_parameters || {},
        repair_contract: step.metadata?.repair_contract || {},
      },
      cost: {
        estimated: estimatedCost,
        currency,
        approved: estimatedCost <= 0
          ? true
          : masterPlan.production?.cost_approved === true,
      },
      timing: {
        estimated_seconds: Number(step.estimated_seconds || 0),
      },
      metadata: {
        execution_node_id: step.node_id,
        execution_step_id: step.id,
        pricing_quote: step.metadata?.pricing_quote || null,
        master_plan_validation: masterPlan.validation || null,
        workflow_kind: masterPlan.workflow_kind || null,
        provider_prompts_persisted: false,
        ...(project?.metadata?.studio_visual_generation_certification
          ? {
              studio_visual_generation_certification:
                project.metadata.studio_visual_generation_certification,
            }
          : {}),
        ...lineageMetadata({ story_lineage: lineage }),
      },
    };

    pendingByNode.set(step.node_id, task);
    taskByNode.set(step.node_id, task);
  }

  for (const step of executionPlan.steps || []) {
    const pending = pendingByNode.get(step.node_id);
    if (!pending) continue;
    pending.depends_on = (step.depends_on || [])
      .map((nodeId) => taskByNode.get(nodeId)?.id)
      .filter(Boolean);
  }

  const created = await ProductionTaskRuntime.createMany(
    [...pendingByNode.values()],
  );
  for (const task of created) {
    const nodeId = task.metadata?.execution_node_id;
    if (nodeId) taskByNode.set(nodeId, task);
  }

  return {
    created,
    all: [...taskByNode.values()],
  };
}

async function resolveContext({
  organization_id,
  creative_mission_id,
  creative_project_id,
  brief,
}) {
  const [mission, project, storedBriefs, assets] = await Promise.all([
    creative_mission_id
      ? CreativeMissionRuntime.get(creative_mission_id)
      : null,
    CreativeProjectRuntime.get(creative_project_id),
    CreativeBriefRuntime.list({
      organization_id,
      creative_mission_id,
      creative_project_id,
    }),
    CreativeAssetsRuntime.list({
      organization_id,
      creative_mission_id,
      creative_project_id,
    }),
  ]);

  if (!project || project.organization_id !== organization_id) {
    throw new Error("Creative project not found");
  }
  if (mission && mission.organization_id !== organization_id) {
    throw new Error("Creative mission not found");
  }

  return {
    mission: mission || {},
    project,
    brief: brief?.id ? brief : storedBriefs[0] || brief || {},
    assets,
  };
}

function assertTemporalRuntime(plan = {}) {
  const workflowKind = text(plan.workflow_kind).toUpperCase();
  if (workflowKind !== "TEMPORAL") {
    throw new Error(
      `CREATIVE_WORKFLOW_RUNTIME_NOT_CONNECTED:${workflowKind || "UNKNOWN"}`,
    );
  }
  if (!plan.validation?.passed) {
    throw new Error("CREATIVE_MASTER_PLAN_VALIDATION_REQUIRED");
  }
  if (plan.degraded === true) {
    throw new Error("CREATIVE_DEGRADED_DIRECTION_RELEASE_BLOCKED");
  }
  if (!list(plan.scenes).length) {
    throw new Error("CREATIVE_MASTER_PLAN_SCENES_REQUIRED");
  }
  for (const [sceneIndex, scene] of plan.scenes.entries()) {
    if (!list(scene.shots).length) {
      throw new Error(`CREATIVE_MASTER_PLAN_SCENE_SHOTS_REQUIRED:${sceneIndex + 1}`);
    }
  }
  CreativeStoryLineageContractRuntime.assert(plan);
}

function totalPlanDuration(plan = {}) {
  const duration = list(plan.scenes)
    .reduce((sum, scene) => sum + Number(scene.duration_seconds || 0), 0);
  return requiredDuration(duration, "CREATIVE_MASTER_PLAN");
}

function preserveApprovedTemporalGovernance(resolvedMaster = {}, approvedMaster = null) {
  if (!approvedMaster?.plan?.creative_tribunal?.passed) return resolvedMaster;
  const approvedPlan = object(approvedMaster.plan);
  const resolvedPlan = object(resolvedMaster.plan);
  const council = object(
    approvedMaster.independent_concept_council ||
    approvedPlan.concept_council,
  );
  const selection = object(council.selection);
  const selectedConceptId =
    approvedPlan.selected_concept_id ||
    selection.selected_concept_id ||
    selection.selected_concept?.id ||
    null;
  const recoveryAuthority = object(
    approvedMaster.lineage_recovery_authority ||
    approvedMaster.creative_story_lineage_recovery,
  );
  const existingProvenance = object(council.provenance);
  const recoveryProvenance = {
    ...existingProvenance,
    source_round: Number(
      existingProvenance.source_round ||
      existingProvenance.recovered_from_round ||
      recoveryAuthority.source_round ||
      0,
    ),
    source_usage_ids: list(existingProvenance.source_usage_ids).length
      ? list(existingProvenance.source_usage_ids)
      : list(recoveryAuthority.source_usage_ids),
    completion_repair_usage_id: text(
      existingProvenance.completion_repair_usage_id ||
      recoveryAuthority.completion_repair_usage_id ||
      approvedMaster.repair_usage?.id ||
      approvedMaster.usage?.id,
    ) || null,
    recovery_contract: text(
      existingProvenance.recovery_contract ||
      recoveryAuthority.contract,
    ) || null,
    recovered_lineage_authority:
      existingProvenance.recovered_lineage_authority === true ||
      (
        recoveryAuthority.contract === "CREATIVE_STORY_LINEAGE_RECOVERY_V1" &&
        recoveryAuthority.user_authorized === true
      ),
  };
  const recoveredCouncil =
    council.contract === "CREATIVE_STORY_LINEAGE_RECOVERY_COUNCIL_V1" &&
    recoveryProvenance.recovered_lineage_authority === true &&
    recoveryProvenance.source_round > 0 &&
    recoveryProvenance.source_usage_ids.length > 0 &&
    Boolean(text(recoveryProvenance.completion_repair_usage_id));
  const selectedConcept =
    object(selection.selected_concept).id
      ? object(selection.selected_concept)
      : object(approvedPlan.concept);
  const conceptHash =
    council.concept_hash ||
    approvedPlan.production?.selected_concept_hash ||
    (recoveredCouncil && selectedConceptId && selectedConcept.id
      ? lineageHash(selectedConcept)
      : null);
  const councilHash =
    council.council_hash ||
    approvedPlan.production?.concept_council_hash ||
    (recoveredCouncil
      ? lineageHash({
          contract: council.contract,
          concepts: list(council.concepts),
          selection,
          provenance: recoveryProvenance,
        })
      : null);
  const sealedCouncil = recoveredCouncil
    ? {
        ...council,
        provenance: recoveryProvenance,
        concept_hash: conceptHash,
        council_hash: councilHash,
      }
    : council;
  return {
    ...resolvedMaster,
    independent_concept_council:
      Object.keys(sealedCouncil).length ? sealedCouncil : resolvedMaster.independent_concept_council || null,
    plan: {
      ...resolvedPlan,
      creative_tribunal: approvedPlan.creative_tribunal,
      selected_concept_id: selectedConceptId || resolvedPlan.selected_concept_id || null,
      concept_council: Object.keys(sealedCouncil).length ? sealedCouncil : resolvedPlan.concept_council,
      production: {
        ...object(resolvedPlan.production),
        ...(councilHash ? { concept_council_hash: councilHash } : {}),
        ...(conceptHash ? { selected_concept_hash: conceptHash } : {}),
      },
    },
  };
}

async function materializeDirection({
  organization_id,
  creative_mission_id,
  creative_project_id,
  mission,
  project,
  brief,
  assets,
  master = null,
  production_room_bootstrap = null,
  resumed_from_approved_council = false,
}) {
  // The temporal pipeline builds its master with the temporal director.
  //
  // This fell back to CreativeMasterPlanRuntime -- the universal executor -- whenever the resolution had no
  // master to hand over, which is every new project. The next line then asserts the plan is temporal, so a
  // video was planned by the still executor and judged by the temporal rules. Those rules demand a shot
  // schema the universal prompt does not contain: per-shot safety arrays, a device, a frame plan, an output
  // spec, a positive duration. An eight second clip came back with title, subject, action, performance and
  // duration all absent on its only shot, and adding the missing requirements to the universal prompt as
  // instructions made it thinner rather than better, because the problem is a missing skeleton rather than a
  // missing rule.
  //
  // CreativeUniversalTemporalDirectionRuntime is the temporal path the benchmark has been exercising all
  // along, and it produces complete scenes and shots -- eight scenes and thirty-five fully directed shots on
  // a full-length film. The universal executor stays for the workflows that own it, reached through
  // buildUniversalCreativePipeline.
  const persistedResearch = await ResearchRuntime.list({
    organization_id,
    creative_project_id,
  });
  const expectedResearchIdentity = text(
    master?.plan?.story_lineage?.research_identity ||
    master?.plan?.metadata?.story_lineage?.research_identity,
  );
  const reusableResearch =
    (expectedResearchIdentity
      ? persistedResearch.find((item) =>
          item?.metadata?.validation?.passed === true &&
          text(item?.metadata?.research_identity) === expectedResearchIdentity,
        )
      : null) ||
    persistedResearch.find((item) => item?.metadata?.validation?.passed === true) ||
    null;
  const researched = reusableResearch
    ? {
        project,
        brief,
        assets,
        research: reusableResearch,
        research_validation: reusableResearch.metadata?.validation || null,
        universal_asset_intelligence:
          reusableResearch.metadata?.universal_asset_intelligence || null,
        reused_validated_research: true,
      }
    : await ResearchRuntime.resolveCreativeDirectionResearch({
        organization_id,
        mission,
        project,
        brief,
        assets,
      });
  const directionBrief = researched.brief || brief;
  const directionAssets = researched.assets || assets;
  const tribunalApprovedMaster = master?.plan?.creative_tribunal?.passed === true
    ? master
    : null;
  if (master && !tribunalApprovedMaster) {
    throw new Error("CREATIVE_TEMPORAL_TRIBUNAL_APPROVAL_REQUIRED");
  }
  const currentProject = await CreativeProjectRuntime.get(creative_project_id);
  const activeProject = currentProject || researched.project || project;
  const currentTribunalMaster = recertifyTemporalMasterAgainstCurrentFloor(
    tribunalApprovedMaster, activeProject, directionAssets,
  );
  const durableTemporalMaster = temporalDirectionCheckpoint(
    activeProject, tribunalApprovedMaster, { assets: directionAssets, recertify: true },
  );
  const incomingMasterIsLaterAuthority = Boolean(
    currentTribunalMaster &&
    (
      currentTribunalMaster.preproduction_creative_repair?.after?.passed === true ||
      currentTribunalMaster.production_room_bootstrap?.production_room_pipeline?.contract ||
      currentTribunalMaster.plan?.production_room_bootstrap?.production_room_pipeline?.contract
    )
  );
  let resolvedMaster =
    (incomingMasterIsLaterAuthority ? currentTribunalMaster : null) ||
    durableTemporalMaster ||
    currentTribunalMaster ||
    await CreativeUniversalTemporalDirectionRuntime.create({
    organization_id,
    mission,
    project: researched.project || project,
    brief: directionBrief,
    assets: directionAssets,
    approved_master: tribunalApprovedMaster,
  });
  resolvedMaster = preserveApprovedTemporalGovernance(resolvedMaster, tribunalApprovedMaster);
  resolvedMaster = CreativeWorldClassConceptIntelligenceRuntime.enforce(resolvedMaster);
  if (production_room_bootstrap?.production_room_pipeline?.contract) {
    resolvedMaster = {
      ...resolvedMaster,
      production_room_bootstrap,
      plan: {
        ...object(resolvedMaster.plan),
        production_room_bootstrap,
        production_room_pipeline: production_room_bootstrap.production_room_pipeline,
      },
    };
  }
  let research = researched.research || resolvedMaster.research || null;
  let plan = resolvedMaster.plan;
  if (!CreativeStoryLineageContractRuntime.validate(plan).passed) {
    research = research || (await ResearchRuntime.list({
      organization_id,
      creative_project_id,
    })).find((item) => item?.metadata?.validation?.passed === true) || null;
    if (!research) {
      throw new Error("CREATIVE_AUTHORITATIVE_RESEARCH_NOT_FOUND_FOR_STORY_LINEAGE");
    }
    const lineageBuild = CreativeStoryLineageContractRuntime.build({ plan, research });
    plan = lineageBuild.plan;
    resolvedMaster = { ...resolvedMaster, plan };
  }
  assertTemporalRuntime(plan);
  if (!durableTemporalMaster || resolvedMaster !== durableTemporalMaster) {
    await persistTemporalDirectionCheckpoint({
      projectId: creative_project_id,
      organizationId: organization_id,
      missionId: creative_mission_id,
      master: resolvedMaster,
      sourceTribunalHash: text(tribunalApprovedMaster?.plan?.creative_tribunal?.tribunal_hash),
    });
  }
  const totalDuration = totalPlanDuration(plan);
  const lineage = storyLineage(plan);
  research = research || (await ResearchRuntime.list({
    organization_id,
    creative_project_id,
  })).find((item) =>
    text(item.metadata?.research_identity) === text(lineage.research_identity),
  ) || null;
  if (!research) {
    throw new Error("CREATIVE_AUTHORITATIVE_RESEARCH_NOT_FOUND_FOR_STORY_LINEAGE");
  }

  const strategyRows = await CreativeStrategyRuntime.list({
    organization_id,
    creative_project_id,
  });
  let strategy = strategyRows.find((item) => lineageMatches(item, lineage)) || null;
  if (!strategy) {
    strategy = await CreativeStrategyRuntime.create({
      organization_id,
      creative_mission_id,
      creative_project_id,
      creative_brief_id: brief.id || null,
      title: plan.concept?.title || project.name || "",
      objective: project.objective || brief.creative_objective || "",
      audience_insight: plan.concept?.target_audience || {},
      creative_angle: plan.concept?.hook || "",
      core_message: plan.concept?.message || "",
      story_direction: plan.concept?.narrative || "",
      visual_direction: {
        visual_system: plan.concept?.visual_system || {},
        camera_language: plan.concept?.camera_language || {},
        lighting_system: plan.concept?.lighting_system || {},
        production_design: plan.concept?.production_design || {},
        typography_system: plan.concept?.typography_system || {},
      },
      production_direction: {
        target_duration: totalDuration,
        deliverables: plan.deliverables || [],
        production: plan.production || {},
        quality: plan.quality || {},
      },
      recommendations: research.recommendations || [],
      metadata: {
        master_plan_provider: resolvedMaster.provider,
        master_plan_model: resolvedMaster.model,
        master_plan_fallback: resolvedMaster.fallback,
        master_plan_validation: resolvedMaster.validation,
        agency_decisions: plan.agency_decisions || [],
        asset_manifest: plan.asset_manifest || [],
        ...lineageMetadata(plan),
      },
    });
  }

  const conceptRows = await CreativeConceptRuntime.list({
    organization_id,
    creative_mission_id,
    creative_project_id,
  });
  let concept = conceptRows.find((item) => lineageMatches(item, lineage)) || null;
  if (!concept) {
    concept = await CreativeConceptRuntime.create({
      organization_id,
      creative_mission_id,
      creative_project_id,
      creative_strategy_id: strategy.id,
      status: "planned",
      ...(plan.concept || {}),
      metadata: {
        master_plan_quality: plan.quality || {},
        master_plan_validation: resolvedMaster.validation,
        ...lineageMetadata(plan),
      },
    });
  }

  const storyboardRows = await StoryboardRuntime.list({
    organization_id,
    creative_project_id,
  });
  let storyboard = storyboardRows.find((item) => lineageMatches(item, lineage)) || null;
  if (!storyboard) {
    storyboard = await StoryboardRuntime.create({
      organization_id,
      creative_mission_id,
      creative_project_id,
      creative_strategy_id: strategy.id,
      creative_concept_id: concept.id,
      title: plan.concept?.title || project.name || "",
      synopsis: plan.concept?.narrative || plan.concept?.message || "",
      total_duration: totalDuration,
      metadata: {
        master_plan_quality: plan.quality || {},
        master_plan_validation: resolvedMaster.validation,
        story_architecture: plan.story_architecture || {},
        canonical_story: plan.story || {},
        ...lineageMetadata(plan),
      },
    });
  }

  // Exactly one master-plan lineage may remain active for production.
  // Historical revisions stay durable through archive timestamps, but cannot
  // coexist as active scene/shot truth and contaminate downstream planning.
  for (const priorStoryboard of storyboardRows) {
    if (
      text(priorStoryboard.id) !== text(storyboard.id) &&
      !priorStoryboard.archived_at &&
      !lineageMatches(priorStoryboard, lineage)
    ) {
      await StoryboardRuntime.archive(priorStoryboard.id);
    }
  }

  const allScenes = await SceneRuntime.list({
    organization_id,
    creative_project_id,
  });
  for (const priorScene of allScenes) {
    if (
      !priorScene.archived_at &&
      !lineageMatches(priorScene, lineage)
    ) {
      await SceneRuntime.archive(priorScene.id);
    }
  }
  let scenes = allScenes
    .filter((scene) =>
      text(scene.storyboard_id) === text(storyboard.id) &&
      lineageMatches(scene, lineage),
    )
    .sort((left, right) => Number(left.scene_number) - Number(right.scene_number));
  if (scenes.length !== plan.scenes.length) {
    scenes = [];
    for (const [index, scenePlan] of plan.scenes.entries()) {
      const scene = await SceneRuntime.create({
        organization_id,
        creative_project_id,
        storyboard_id: storyboard.id,
        scene_number: index + 1,
        title: scenePlan.title,
        objective: scenePlan.objective,
        emotion: scenePlan.emotion,
        duration_seconds: requiredDuration(
          scenePlan.duration_seconds,
          `CREATIVE_SCENE_${index + 1}`,
        ),
        location: scenePlan.location || {},
        actors: scenePlan.actors || [],
        products: scenePlan.products || [],
        brand_rules: scenePlan.brand_rules || [],
        visual_style: scenePlan.visual_style || {},
        camera_style: scenePlan.camera_style || {},
        audio_style: scenePlan.audio_style || {},
        metadata: {
          master_plan_index: index,
          master_plan_scene_id: scenePlan.id || null,
          minimum_quality: plan.quality?.minimum_scene_score ?? null,
          story_function: scenePlan.story_function || null,
          story_state_before: scenePlan.story_state_before || "",
          state_change: scenePlan.state_change || "",
          story_state_after: scenePlan.story_state_after || "",
          transition_logic: scenePlan.transition_logic || "",
          continuity_from_previous: scenePlan.continuity_from_previous || {},
          continuity_to_next: scenePlan.continuity_to_next || {},
          ...lineageMetadata(plan),
        },
      });
      scenes.push(scene);
    }
  }

  const allShots = await ShotRuntime.list({
    organization_id,
    creative_project_id,
  });
  for (const priorShot of allShots) {
    if (
      !priorShot.archived_at &&
      !lineageMatches(priorShot, lineage)
    ) {
      await ShotRuntime.archive(priorShot.id);
    }
  }
  let shots = allShots
    .filter((shot) =>
      scenes.some((scene) => text(scene.id) === text(shot.scene_id)) &&
      lineageMatches(shot, lineage),
    )
    .sort((left, right) =>
      Number(left.scene_number) - Number(right.scene_number) ||
      Number(left.shot_number) - Number(right.shot_number),
    );
  const plannedShotCount = plan.scenes.reduce(
    (sum, scene) => sum + list(scene.shots).length,
    0,
  );
  if (shots.length !== plannedShotCount) {
    shots = [];
    for (const [sceneIndex, scene] of scenes.entries()) {
      const scenePlan = plan.scenes[sceneIndex];
      const shotPlans = list(scenePlan?.shots);
      if (!shotPlans.length) {
        throw new Error(`CREATIVE_MASTER_PLAN_SCENE_SHOTS_REQUIRED:${sceneIndex + 1}`);
      }

      for (const [shotIndex, shotPlan] of shotPlans.entries()) {
        const subject = text(shotPlan.subject);
        if (!subject) {
          throw new Error(
            `CREATIVE_MASTER_PLAN_SHOT_SUBJECT_REQUIRED:${sceneIndex + 1}:${shotIndex + 1}`,
          );
        }
        const shot = await ShotRuntime.create({
          organization_id,
          creative_project_id,
          scene_id: scene.id,
          storyboard_id: storyboard.id,
          scene_number: scene.scene_number,
          shot_number: shotIndex + 1,
          title: shotPlan.title,
          purpose: shotPlan.purpose,
          subject,
          action: shotPlan.action || "",
          performance: shotPlan.performance || "",
          duration_seconds: requiredDuration(
            shotPlan.duration_seconds,
            `CREATIVE_SHOT_${sceneIndex + 1}_${shotIndex + 1}`,
          ),
          medium: shotPlan.medium || null,
          frame_plan: shotPlan.frame_plan || {},
          opening_frame: shotPlan.opening_frame || {},
          progression_frames: shotPlan.progression_frames || [],
          closing_frame: shotPlan.closing_frame || {},
          camera: shotPlan.camera || {},
          virtual_camera_state: shotPlan.virtual_camera_state || {},
          lighting: shotPlan.lighting || {},
          production_design: shotPlan.production_design || {},
          wardrobe: shotPlan.wardrobe || [],
          hair_makeup: shotPlan.hair_makeup || [],
          props: shotPlan.props || [],
          performance_direction: shotPlan.performance_direction || {},
          continuity: shotPlan.continuity || {},
          actors: shotPlan.actors || scene.actors || [],
          products: shotPlan.products || scene.products || [],
          location: shotPlan.location || scene.location || {},
          dialogue: shotPlan.dialogue || [],
          narration: shotPlan.narration || {},
          audio: shotPlan.audio || {},
          music: shotPlan.music || {},
          sound_effects: shotPlan.sound_effects || [],
          sound_design: shotPlan.sound_design || {},
          subtitles: shotPlan.subtitles || [],
          graphics: shotPlan.graphics || {},
          typography: shotPlan.typography || {},
          vfx: shotPlan.vfx || {},
          transition_in: shotPlan.transition_in || "",
          transition_out: shotPlan.transition_out || "",
          must_avoid: shotPlan.must_avoid || [],
          negative_constraints: shotPlan.negative_constraints || [],
          known_failure_modes: shotPlan.known_failure_modes || [],
          repair_instructions: shotPlan.repair_instructions || [],
          assets: shotPlan.assets || [],
          reference_assets: shotPlan.reference_assets || [],
          reference_asset_ids: shotPlan.reference_asset_ids || [],
          primary_source_asset_id: shotPlan.primary_source_asset_id || null,
          identity_requirements: shotPlan.identity_requirements || {},
          product_requirements: shotPlan.product_requirements || {},
          rights_requirements: shotPlan.rights_requirements || {},
          output_spec: shotPlan.output_spec || shotPlan.generation?.output_spec || {},
          provider_parameters: shotPlan.provider_parameters || shotPlan.generation?.provider_parameters || {},
          repair_contract: shotPlan.repair_contract || {},
          reuse_policy: shotPlan.reuse_policy || {},
          generation: promptlessGeneration(shotPlan.generation),
          metadata: {
            subject,
            performance: shotPlan.performance || "",
            must_avoid: shotPlan.must_avoid || [],
            minimum_quality: plan.quality?.minimum_scene_score ?? null,
            reuse_policy: shotPlan.reuse_policy || {},
            master_plan_scene_index: sceneIndex,
            master_plan_shot_index: shotIndex,
            master_plan_scene_id: scenePlan.id || null,
            master_plan_shot_id: shotPlan.id || null,
            aerial_cinematography: shotPlan.aerial_cinematography || {},
            creative_grounding: research?.metadata?.creative_grounding || research?.creative_grounding || {},
            provider_prompts_persisted: false,
            ...lineageMetadata(plan),
          },
        });
        shots.push(shot);
      }
    }
  }

  return {
    master: resolvedMaster,
    research,
    strategy,
    concept,
    storyboard,
    scenes,
    shots,
  };
}

export async function buildCreativePipeline(input = {}) {
  const { organization_id } = input;
  const creative_mission_id = resolveMissionId(input);
  const creative_project_id = resolveProjectId(input);

  if (!organization_id) throw new Error("organization_id required");
  if (!creative_mission_id) throw new Error("creative_mission_id required");
  if (!creative_project_id) throw new Error("creative_project_id required");

  const stateInput = {
    organization_id,
    creative_mission_id,
    creative_project_id,
  };

  let state = await CreativeStateEngine.get(stateInput);
  if (!state) state = await CreativeStateEngine.init(stateInput);

  await CreativeStateEngine.set(stateInput, PIPELINE_STAGES.UNDERSTANDING);
  const context = await resolveContext({
    organization_id,
    creative_mission_id,
    creative_project_id,
    brief: input.brief,
  });

  await CreativeStateEngine.set(stateInput, PIPELINE_STAGES.RESEARCHING);
  const organizationTimeContext = await resolveOrganizationTimeContext({ organizationId: organization_id });
  const resolvedCurrency = projectCurrency(context.project, input.master?.plan || {}) || organizationTimeContext.currency || null;

  const direction = await materializeDirection({
    organization_id,
    creative_mission_id,
    creative_project_id,
    ...context,
    master: input.master || null,
    production_room_bootstrap: input.production_room_bootstrap || null,
    resumed_from_approved_council: input.resumed_from_approved_council === true,
  });

  await CreativeStateEngine.set(stateInput, PIPELINE_STAGES.PLANNING_PRODUCTION);
  const resolvedProductionRooms = input.production_room_bootstrap?.production_room_pipeline?.contract
    ? input.production_room_bootstrap
    : direction.master?.production_room_bootstrap?.production_room_pipeline?.contract
      ? direction.master.production_room_bootstrap
      : direction.master?.plan?.production_room_bootstrap?.production_room_pipeline?.contract
        ? direction.master.plan.production_room_bootstrap
        : null;
  const graphCreativePlan = resolvedProductionRooms
    ? {
        ...object(direction.master.plan),
        production_room_bootstrap: resolvedProductionRooms,
        production_room_pipeline: resolvedProductionRooms.production_room_pipeline,
      }
    : direction.master.plan;
  const approvedConceptId = text(
    direction.master?.plan?.concept?.id ||
    direction.master?.plan?.concept_council?.selection?.selected_concept?.id ||
    direction.master?.plan?.concept_council?.selection?.selected_concept_id,
  );
  let graph = null;
  const activeLineage = storyLineage(direction.master?.plan || {});
  const activeShotCount = list(direction.master?.plan?.scenes)
    .reduce((sum, scene) => sum + list(scene?.shots).length, 0);
  if (text(direction.master?.plan?.workflow_kind).toUpperCase() === "TEMPORAL" && approvedConceptId) {
    const existingGraphs = await ProductionGraphRuntime.listSummaries({
      organization_id,
      creative_project_id,
    });
    const graphSummary = list(existingGraphs).find((candidate) => {
      const metadata = object(candidate?.metadata);
      const candidateConceptId = text(
        metadata.approval_plan_snapshot?.concept?.id ||
        metadata.approval_plan_snapshot?.concept_council?.selection?.selected_concept?.id ||
        metadata.approval_plan_snapshot?.concept_council?.selection?.selected_concept_id,
      );
      const rehearsal = list(metadata.production_room_pipeline?.stages)
        .find((stage) => stage?.id === "VIRTUAL_REHEARSAL");
      const candidatePlan = object(metadata.approval_plan_snapshot);
      const candidateShotCount = list(candidatePlan.scenes)
        .reduce((sum, scene) => sum + list(scene?.shots).length, 0);
      const candidateLineage = storyLineage(metadata);
      return (
        text(metadata.workflow_kind).toUpperCase() === "TEMPORAL" &&
        candidateConceptId === approvedConceptId &&
        text(activeLineage.story_contract_hash) &&
        text(activeLineage.master_plan_hash) &&
        text(candidateLineage.story_contract_hash) === text(activeLineage.story_contract_hash) &&
        text(candidateLineage.master_plan_hash) === text(activeLineage.master_plan_hash) &&
        candidateShotCount === activeShotCount &&
        rehearsal?.status === "SEALED" &&
        text(rehearsal?.sealed_digest)
      );
    }) || null;
    if (graphSummary?.id) {
      const candidateGraph = await ProductionGraphRuntime.get(graphSummary.id);
      if (list(candidateGraph?.nodes).length > 0) graph = candidateGraph;
    }
  }
  if (!graph) {
    graph = await ProductionGraphRuntime.plan({
      organization_id,
      creative_mission_id,
      creative_project_id,
      storyboard: direction.storyboard,
      scenes: direction.scenes,
      shots: direction.shots,
      creative_plan: graphCreativePlan,
    });
  }

  if (graph?.metadata?.production_room_pipeline?.contract) {
    const roomAutopilot = await ProductionGraphRuntime.runProductionRoomAutonomy(graph.id, {
      organization_id,
      creative_project_id,
      max_concurrency: 4,
      max_steps: 12,
      production_context: {
        approved_research: {
          source_manifest: direction.research?.metadata?.creative_grounding?.source_manifest || [],
          summary: direction.research?.summary || direction.research?.title || null,
        },
        approved_story: direction.master.plan?.story || {},
        approved_concept: direction.master.plan?.concept || {},
        approved_production: direction.master.plan?.production || {},
        approved_scenes: list(direction.master.plan?.scenes),
      },
    });
    graph = roomAutopilot?.graph || graph;
  }

  const optimizedGraph = await AssetReuseEngine.optimizeGraph({
    organization_id,
    creative_project_id,
    graph,
  });

  await CreativeStateEngine.set(stateInput, PIPELINE_STAGES.READY_FOR_EXECUTION);
  const executionPlan = await ExecutionRuntime.plan({
    organization_id,
    creative_project_id,
    production_graph: optimizedGraph,
  });
  if (!list(executionPlan.steps).length) {
    throw new Error("CREATIVE_EXECUTION_PLAN_STEPS_REQUIRED");
  }
  const execution = await ExecutionRuntime.create({ ...executionPlan, currency: resolvedCurrency });
  const tasks = await materializeProductionTasks({
    organization_id,
    creative_project_id,
    production_graph_id: optimizedGraph.id,
    executionPlan: execution,
    project: context.project,
    masterPlan: direction.master.plan,
    currency: resolvedCurrency,
  });

  const releaseGate = CreativeBrandFidelityRuntime.assertPipeline({
    mission_id: creative_mission_id,
    creative_mission_id,
    creative_project_id,
    master_plan: direction.master,
    research: direction.research,
    strategy: direction.strategy,
    concept: direction.concept,
    storyboard: direction.storyboard,
    scenes: direction.scenes,
    shots: direction.shots,
    graph,
    optimizedGraph,
    execution,
    tasks: tasks.all,
  });

  await CreativeStateEngine.set(stateInput, PIPELINE_STAGES.EXECUTING);

  return {
    mission_id: creative_mission_id,
    creative_mission_id,
    creative_project_id,
    workflow_kind: direction.master.plan.workflow_kind,
    master_plan: direction.master,
    research: direction.research,
    strategy: direction.strategy,
    concept: direction.concept,
    storyboard: direction.storyboard,
    scenes: direction.scenes,
    shots: direction.shots,
    graph,
    optimizedGraph,
    execution,
    tasks,
    release_gate: releaseGate,
  };
}
