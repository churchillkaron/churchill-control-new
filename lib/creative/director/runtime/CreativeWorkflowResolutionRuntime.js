import { CreativeMissionRuntime } from "@/lib/creative/missions/runtime/CreativeMissionRuntime";
import { CreativeProjectRuntime } from "@/lib/creative/projects/runtime/CreativeProjectRuntime";
import { CreativeBriefRuntime } from "@/lib/creative/brief/runtime/CreativeBriefRuntime";
import { CreativeAssetsRuntime } from "@/lib/creative/assets/runtime/CreativeAssetsRuntime";
import { CreativeMasterPlanRuntime } from "@/lib/creative/director/runtime/CreativeMasterPlanRuntime";
import { CreativeDynamicTribunalRuntime } from "@/lib/creative/director/runtime/CreativeDynamicTribunalRuntime";
import { CreativeConceptCouncilRuntime } from "@/lib/creative/director/runtime/CreativeConceptCouncilRuntime";
import { CreativeWorkflowRegistry } from "@/lib/creative/director/registry/CreativeWorkflowRegistry";
import { enrichCreativeDirectionWithLearning } from "@/lib/creative/learning/runtime/CreativeOutcomeLearningDirectionBootstrap";
import { resolveCreativeDirectionResearch } from "@/lib/creative/research/runtime/ResearchRuntime";
import { bootstrapProductionRooms } from "@/lib/creative/production-room/runtime/CreativeProductionRoomBootstrapRuntime";

function resolveMissionId(input = {}) {
  return input.creative_mission_id || input.mission_id || null;
}

function resolveProjectId(input = {}) {
  return input.creative_project_id || input.project_id || null;
}

function text(value) {
  return String(value ?? "").trim().toUpperCase();
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
const COUNCIL_CHECKPOINT_METADATA_KEY = "creative_council_checkpoint";
const MASTER_CHECKPOINT_METADATA_KEY = "creative_post_repair_master_checkpoint";

function storedTribunalResume(project = {}, context = {}) {
  const state = project.metadata?.[TRIBUNAL_RESUME_METADATA_KEY] || {};
  if (state.contract !== "CREATIVE_TRIBUNAL_DURABLE_RESUME_V1") return null;
  if (state.organization_id !== context.organization_id) return null;
  if (state.creative_project_id !== context.creative_project_id) return null;
  if (state.creative_mission_id !== context.creative_mission_id) return null;
  return state.resume_package || null;
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
  try {
    const master = await CreativeDynamicTribunalRuntime.review(reviewInput);
    await clearTribunalResume(context);
    await clearCouncilCheckpoint(context);
    await clearPostRepairMasterCheckpoint(context);
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

function bootstrapResolvedProductionRooms({ context, project, brief, researched = {}, master }) {
  const workflowKind = text(master.plan?.workflow_kind);
  const workflow = CreativeWorkflowRegistry.require(workflowKind);
  const productionRooms = workflow.workflow_kind === "TEMPORAL"
    ? bootstrapProductionRooms({
        project,
        brief,
        research: researched.research || {},
        universal_asset_intelligence: researched.universal_asset_intelligence || {},
        master,
      })
    : null;
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
    const declared = CreativeWorkflowRegistry.resolveDeclared({
      input,
      project: context.project,
    });
    const constrainedProject = projectForDirection(context.project, declared);

    const researched = await resolveCreativeDirectionResearch({
      organization_id: context.organization_id,
      mission: context.mission,
      project: constrainedProject,
      brief: context.brief,
      assets: context.assets,
      force_research: input.force_research === true,
    });

    const learned = await enrichCreativeDirectionWithLearning({
      organization_id: context.organization_id,
      mission: context.mission,
      project: researched.project || constrainedProject,
      brief: researched.brief || context.brief,
      assets: context.assets,
    });

    const directionProject = learned.project || researched.project || constrainedProject;
    const directionBrief = researched.brief || context.brief;

    const initialMaster = await CreativeMasterPlanRuntime.create({
      organization_id: context.organization_id,
      mission: context.mission,
      project: directionProject,
      brief: directionBrief,
      assets: context.assets,
    });

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

    const workflowKind = text(master.plan?.workflow_kind);
    const workflow = CreativeWorkflowRegistry.require(workflowKind);
    const productionRooms = workflow.workflow_kind === "TEMPORAL"
      ? bootstrapProductionRooms({
          project: directionProject,
          brief: directionBrief,
          research: researched.research || {},
          universal_asset_intelligence: researched.universal_asset_intelligence || {},
          master,
        })
      : null;
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

    if (declared && workflow.workflow_kind !== declared.workflow_kind) {
      throw new Error(
        `CREATIVE_WORKFLOW_CONSTRAINT_MISMATCH:${declared.workflow_kind}:${workflow.workflow_kind}`,
      );
    }

    return {
      ...context,
      project: directionProject,
      brief: directionBrief,
      research: researched.research || null,
      research_validation: researched.research_validation || null,
      universal_asset_intelligence: researched.universal_asset_intelligence || null,
      creative_learning: learned.creative_learning || null,
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
      repair_results: input.master_repair_results || input.repair_results || [],
    });
    const councilMaster = {
      ...approvedMaster,
      plan: resumedCouncil.plan,
      independent_concept_council: resumedCouncil.independent_concept_council,
      post_revision_master_validation: resumedCouncil.post_revision_master_validation,
    };
    await persistPostRepairMasterCheckpoint(context, councilMaster);

    const tribunalResume =
      input.tribunal_resume_package ||
      approvedMaster.tribunal_resume_package ||
      approvedMaster.creative_tribunal?.resume_package ||
      storedTribunalResume(context.project, context) ||
      {};

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

    const resolved = bootstrapResolvedProductionRooms({
      context,
      project: directionProject,
      brief: directionBrief,
      master,
    });
    if (declared && resolved.workflow.workflow_kind !== declared.workflow_kind) {
      throw new Error(`CREATIVE_WORKFLOW_CONSTRAINT_MISMATCH:${declared.workflow_kind}:${resolved.workflow.workflow_kind}`);
    }

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
