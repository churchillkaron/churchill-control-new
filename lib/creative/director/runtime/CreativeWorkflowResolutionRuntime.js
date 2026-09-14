import { CreativeMissionRuntime } from "@/lib/creative/missions/runtime/CreativeMissionRuntime";
import { CreativeProjectRuntime } from "@/lib/creative/projects/runtime/CreativeProjectRuntime";
import { CreativeBriefRuntime } from "@/lib/creative/brief/runtime/CreativeBriefRuntime";
import { CreativeAssetsRuntime } from "@/lib/creative/assets/runtime/CreativeAssetsRuntime";
import { CreativeMasterPlanRuntime } from "@/lib/creative/director/runtime/CreativeMasterPlanRuntime";
import { UsageRuntime } from "@/lib/platform/service-runtime/usage/UsageRuntime";
import { CreativeDynamicTribunalRuntime } from "@/lib/creative/director/runtime/CreativeDynamicTribunalRuntime";
import { CreativeConceptCouncilRuntime } from "@/lib/creative/director/runtime/CreativeConceptCouncilRuntime";
import { CreativeWorkflowRegistry } from "@/lib/creative/director/registry/CreativeWorkflowRegistry";
import { enrichCreativeDirectionWithLearning } from "@/lib/creative/learning/runtime/CreativeOutcomeLearningDirectionBootstrap";
import { resolveCreativeDirectionResearch } from "@/lib/creative/research/runtime/ResearchRuntime";
import { bootstrapProductionRooms } from "@/lib/creative/production-room/runtime/CreativeProductionRoomBootstrapRuntime";
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

async function resolveContext(input = {}) {
  const organization_id = input.organization_id;
  const creative_mission_id = resolveMissionId(input);
  const creative_project_id = resolveProjectId(input);

  if (!organization_id) throw new Error("organization_id required");
  if (!creative_mission_id) throw new Error("creative_mission_id required");
  if (!creative_project_id) throw new Error("creative_project_id required");

  const [mission, project, briefs, assets] = await Promise.all([
    CreativeMissionRuntime.get(creative_mission_id),
    CreativeProjectRuntime.get(creative_project_id),
    CreativeBriefRuntime.list({ organization_id, creative_mission_id, creative_project_id }),
    CreativeAssetsRuntime.list({ organization_id, creative_mission_id, creative_project_id }),
  ]);

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
const TEMPORAL_DIRECTION_CHECKPOINT_METADATA_KEY = "creative_temporal_direction_checkpoint";

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
  if (masterStoryRequired(context) && !completeMasterStory(master.plan)) return null;
  return master;
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
  const repairEntries = operations
    .slice(baseIndex + 1)
    .filter((entry) => String(entry?.operation || "").toUpperCase() === "MASTER_PLAN_CONTRACT_REPAIR_V1" && entry?.usage_id && entry?.completed_at);

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

  const usages = await Promise.all(repairEntries.map((entry) => UsageRuntime.get(entry.usage_id)));
  return usages
    .filter((usage) => usage && String(usage.status || "").toUpperCase() === "SUCCESS")
    .map(usageAsSettledDirectionResult);
}

async function recoverSettledTribunalResume({ context, project, master, available_capabilities = [] }) {
  const approval = project?.metadata?.paid_tribunal_approval || {};
  const operations = Array.isArray(approval.operations) ? approval.operations : [];
  const latestPanelIndex = operations
    .map((entry, index) => [entry, index])
    .filter(([entry]) => String(entry?.operation || "").toUpperCase() === "CREATIVE_DYNAMIC_TRIBUNAL_PANEL_V1" && entry?.usage_id && entry?.completed_at)
    .map(([, index]) => index)
    .at(-1);
  if (!Number.isInteger(latestPanelIndex)) return null;

  const panelEntry = operations[latestPanelIndex];
  const reviewEntries = operations
    .slice(latestPanelIndex + 1)
    .filter((entry) => /^CREATIVE_DYNAMIC_TRIBUNAL_.+_REVIEWER_V1$/i.test(String(entry?.operation || "")) && entry?.usage_id && entry?.completed_at);
  const usages = await Promise.all([panelEntry, ...reviewEntries].map((entry) => UsageRuntime.get(entry.usage_id)));
  const panelUsage = usages[0];
  if (!panelUsage || String(panelUsage.status || "").toUpperCase() !== "SUCCESS") return null;

  const panelOutput = normalizedTribunalUsageOutput(panelUsage, "reviewers");
  const reviewers = Array.isArray(panelOutput?.reviewers) ? panelOutput.reviewers : [];
  if (!reviewers.length) return null;
  const normalizedReviewers = reviewers.map((reviewer) => ({
    ...reviewer,
    id: canonicalReviewerId(reviewer?.id),
  }));
  const reviewPanel = {
    ...panelOutput,
    reviewers: normalizedReviewers,
  };
  const reviewContext = CreativeDynamicTribunalRuntime.reviewContextSnapshot({
    mission: context.mission,
    project,
    brief: context.brief,
    assets: context.assets,
    available_capabilities,
  });
  const settledReviews = usages.slice(1).flatMap((usage) => {
    if (!usage || String(usage.status || "").toUpperCase() !== "SUCCESS") return [];
    const review = normalizedTribunalUsageOutput(usage, "reviewer_id");
    const reviewerId = canonicalReviewerId(review?.reviewer_id);
    const reviewer = normalizedReviewers.find((row) => canonicalReviewerId(row?.id) === reviewerId);
    if (!reviewer || !reviewerId) return [];
    const normalizedReview = { ...review, reviewer_id: reviewerId };
    return [{
      reviewer,
      review: normalizedReview,
      usage,
      billing: usage.billing || null,
      review_evidence_hash: CreativeDynamicTribunalRuntime.reviewEvidenceHash({
        reviewer,
        context: reviewContext,
        plan: master.plan,
      }),
    }];
  });

  return {
    contract: "CREATIVE_TRIBUNAL_RESUME_PACKAGE_V1",
    review_panel: reviewPanel,
    settled_reviews: settledReviews,
    settled_review_source_plan: master.plan,
    settled_review_plan_hash: CreativeDynamicTribunalRuntime.reviewPlanHash(master.plan),
  };
}

function storedTribunalResume(project = {}, context = {}) {
  const state = project.metadata?.[TRIBUNAL_RESUME_METADATA_KEY] || {};
  if (state.contract !== "CREATIVE_TRIBUNAL_DURABLE_RESUME_V1") return null;
  if (state.organization_id !== context.organization_id) return null;
  if (state.creative_project_id !== context.creative_project_id) return null;
  if (state.creative_mission_id !== context.creative_mission_id) return null;
  return state.resume_package || null;
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
  return state.master || null;
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

async function reviewWithDurableResume(context = {}, reviewInput = {}) {
  const currentProject = await CreativeProjectRuntime.get(context.creative_project_id);
  const approvedCheckpoint = storedTribunalApprovedMaster(currentProject || context.project, context);
  const currentPlan = object(reviewInput.master).plan;
  if (
    approvedCheckpoint &&
    currentPlan &&
    CreativeDynamicTribunalRuntime.reviewPlanHash(approvedCheckpoint.plan) ===
      CreativeDynamicTribunalRuntime.reviewPlanHash(currentPlan)
  ) return approvedCheckpoint;
  try {
    const master = await CreativeDynamicTribunalRuntime.review(reviewInput);
    await persistTribunalApprovedMaster(context, master);
    return master;
  } catch (error) {
    if (error?.resume_package) {
      try {
        await persistTribunalResume(context, error.resume_package);
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

async function bootstrapResolvedProductionRooms({ context, project, brief, researched = {}, master }) {
  const workflowKind = text(master.plan?.workflow_kind);
  const workflow = CreativeWorkflowRegistry.require(workflowKind);
  const masterPlanDigest =
    master.plan?.story_lineage?.master_plan_hash ||
    master.plan?.metadata?.story_lineage?.master_plan_hash ||
    null;
  const durableState = workflow.workflow_kind === "TEMPORAL"
    ? readPreproductionDurableState({
        project: context.project,
        context,
        master_plan_digest: masterPlanDigest,
      })
    : null;
  const productionRooms = workflow.workflow_kind === "TEMPORAL"
    ? bootstrapProductionRooms({
        project,
        brief,
        research: researched?.research || {},
        universal_asset_intelligence: researched?.universal_asset_intelligence || {},
        master,
        durable_state: durableState,
      })
    : null;
  if (productionRooms) {
    await persistPreproductionDurableState({
      context,
      master_plan_digest: masterPlanDigest,
      state: {
        production_room_pipeline: productionRooms.production_room_pipeline,
        reports_by_stage: productionRooms.reports_by_stage || {},
        production_room_stage_inputs: productionRooms.stage_inputs || {},
        specialist_wave_audit: durableState?.specialist_wave_audit || [],
        preproduction_continuation: productionRooms.preproduction_continuation || null,
      },
    });
  }
  const governedMaster = productionRooms
    ? {
        ...master,
        plan: {
          ...master.plan,
          production_room_pipeline: productionRooms.production_room_pipeline,
          production_room_bootstrap: productionRooms,
        },
        production_room_bootstrap: productionRooms,
      }
    : master;
  return { workflow, productionRooms, governedMaster };
}

export const CreativeWorkflowResolutionRuntime = Object.freeze({
  async resolve(input = {}) {
    const context = await resolveContext(input);
    const temporalCheckpoint = storedTemporalDirectionCheckpoint(context.project, context);
    if (temporalCheckpoint) {
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
        master: temporalCheckpoint,
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
    const postRepairCheckpoint = storedPostRepairMasterCheckpoint(context.project, context);
    if (
      postRepairCheckpoint &&
      (!masterStoryRequired(context) || completeMasterStory(postRepairCheckpoint.plan))
    ) {
      return CreativeWorkflowResolutionRuntime.resumeApprovedCouncil({
        ...input,
        approved_master: postRepairCheckpoint,
        master_repair_results: [],
      });
    }
    const councilCheckpoint = storedCouncilCheckpoint(context.project, context);
    if (councilCheckpoint) {
      const semanticStructureUpgrade =
        masterStoryRequired(context) && !completeMasterStory(councilCheckpoint.plan);
      const settledRepairs = semanticStructureUpgrade
        ? []
        : await recoverSettledPostCouncilRepairs(context.project);
      return CreativeWorkflowResolutionRuntime.resumeApprovedCouncil({
        ...input,
        approved_master: councilCheckpoint,
        master_repair_results: settledRepairs,
      });
    }
    const declared = CreativeWorkflowRegistry.resolveDeclared({
      input,
      project: context.project,
    });
    const constrainedProject = projectForDirection(context.project, declared);

    let researched = null;
    let learned = null;
    let directionProject = constrainedProject;
    let directionBrief = context.brief;
    let initialMaster = await recoverSettledInitialMaster({
      context,
      project: directionProject,
      brief: directionBrief,
      assets: context.assets,
    });

    if (!initialMaster) {
      researched = await resolveCreativeDirectionResearch({
        organization_id: context.organization_id,
        mission: context.mission,
        project: constrainedProject,
        brief: context.brief,
        assets: context.assets,
        force_research: input.force_research === true,
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

    const master = await reviewWithDurableResume(context, {
      organization_id: context.organization_id,
      creative_mission_id: context.creative_mission_id,
      creative_project_id: context.creative_project_id,
      mission: context.mission,
      project: directionProject,
      brief: directionBrief,
      assets: context.assets,
      available_capabilities: initialMaster.available_production_capabilities || [],
      master: councilMaster,
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
    const approvedMaster =
      input.approved_master ||
      input.master ||
      storedPostRepairMasterCheckpoint(context.project, context) ||
      storedCouncilCheckpoint(context.project, context) ||
      null;
    if (!approvedMaster) throw new Error("CREATIVE_APPROVED_COUNCIL_MASTER_REQUIRED");

    const declared = CreativeWorkflowRegistry.resolveDeclared({
      input,
      project: context.project,
    });
    const directionProject = projectForDirection(context.project, declared);
    const directionBrief = context.brief;

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
    await persistPostRepairMasterCheckpoint(context, councilMaster);

    const recoveredTribunalResume = await recoverSettledTribunalResume({
      context,
      project: directionProject,
      master: councilMaster,
      available_capabilities: resumedCouncil.available_production_capabilities || approvedMaster.available_production_capabilities || [],
    });
    const tribunalResumeCandidates = [
      input.tribunal_resume_package,
      approvedMaster.tribunal_resume_package,
      approvedMaster.creative_tribunal?.resume_package,
      storedTribunalResume(context.project, context),
      recoveredTribunalResume,
    ].filter(Boolean);
    const tribunalResume = tribunalResumeCandidates.find((resume) =>
      Array.isArray(resume?.review_panel?.reviewers) && resume.review_panel.reviewers.length > 0,
    ) || tribunalResumeCandidates.find((resume) =>
      Array.isArray(resume?.settled_reviews) && resume.settled_reviews.length > 0,
    ) || recoveredTribunalResume || {};

    const master = await reviewWithDurableResume(context, {
      organization_id: context.organization_id,
      creative_mission_id: context.creative_mission_id,
      creative_project_id: context.creative_project_id,
      mission: context.mission,
      project: directionProject,
      brief: directionBrief,
      assets: context.assets,
      available_capabilities: resumedCouncil.available_production_capabilities || approvedMaster.available_production_capabilities || [],
      master: councilMaster,
      review_panel: input.review_panel || tribunalResume.review_panel || approvedMaster.creative_tribunal?.review_panel || null,
      settled_reviews: input.settled_reviews || tribunalResume.settled_reviews || [],
      settled_review_plan_hash: input.settled_review_plan_hash || tribunalResume.settled_review_plan_hash || null,
      settled_review_source_plan: input.settled_review_source_plan || tribunalResume.settled_review_source_plan || null,
    });

    const resolved = await bootstrapResolvedProductionRooms({
      context,
      project: directionProject,
      brief: directionBrief,
      master,
    });
    if (declared && resolved.workflow.workflow_kind !== declared.workflow_kind) {
      throw new Error(`CREATIVE_WORKFLOW_CONSTRAINT_MISMATCH:${declared.workflow_kind}:${resolved.workflow.workflow_kind}`);
    }
    await clearResolvedDirectionCheckpoints(context);

    return {
      ...context,
      project: directionProject,
      brief: directionBrief,
      declared_workflow: declared,
      workflow: resolved.workflow,
      master: resolved.governedMaster,
      production_room_bootstrap: resolved.productionRooms,
      resumed_from_approved_council: true,
      council_resume: resumedCouncil,
    };
  },
});
