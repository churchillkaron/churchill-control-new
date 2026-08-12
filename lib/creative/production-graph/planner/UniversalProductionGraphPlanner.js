import {
  createProductionGraph,
  createProductionNode,
  createProductionEdge,
} from "../documents/ProductionGraph";
import {
  CreativeWorkflowRegistry,
} from "@/lib/creative/director/registry/CreativeWorkflowRegistry";

const CONTRACT = "CREATIVE_DIRECTOR_AUTHORED_PRODUCTION_GRAPH_V1";

const FORBIDDEN_STEP_KEYS = new Set([
  "prompt",
  "provider_prompt",
  "negative_prompt",
  "visual_prompt",
  "video_prompt",
  "provider_parameters",
  "provider",
  "provider_id",
]);

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

function slug(value, fallback = "node") {
  return text(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || fallback;
}

function unique(values = []) {
  return [...new Set(list(values).flat(Infinity).map(text).filter(Boolean))];
}

function assetId(value) {
  if (typeof value === "string" || typeof value === "number") {
    return text(value);
  }
  return text(value?.asset_id || value?.id);
}

function workflowFor(plan = {}) {
  const workflow = CreativeWorkflowRegistry.require(plan.workflow_kind);
  if (workflow.executor !== "UNIVERSAL") {
    throw new Error(
      `CREATIVE_UNIVERSAL_WORKFLOW_REQUIRED:${workflow.workflow_kind}`,
    );
  }
  return workflow;
}

function assertNoProviderTransportDetails(value, path = "production_step") {
  if (Array.isArray(value)) {
    value.forEach((item, index) =>
      assertNoProviderTransportDetails(item, `${path}.${index}`),
    );
    return;
  }
  if (!value || typeof value !== "object") return;

  for (const [key, nested] of Object.entries(value)) {
    if (FORBIDDEN_STEP_KEYS.has(key) && nested != null && nested !== "") {
      throw new Error(
        `CREATIVE_PROVIDER_TRANSPORT_DETAIL_FORBIDDEN:${path}.${key}`,
      );
    }
    assertNoProviderTransportDetails(nested, `${path}.${key}`);
  }
}

function normalizeStep(step = {}, index, scopeId) {
  assertNoProviderTransportDetails(step, `${scopeId}.production_steps.${index}`);

  const id = text(step.id);
  const title = text(step.title);
  const purpose = text(step.purpose || step.description);
  const service = text(step.service || step.service_code);
  const capability = text(step.capability);
  const outputSpec = object(step.output_spec);

  if (!id) throw new Error(`CREATIVE_PRODUCTION_STEP_ID_REQUIRED:${scopeId}:${index}`);
  if (!title) throw new Error(`CREATIVE_PRODUCTION_STEP_TITLE_REQUIRED:${scopeId}:${id}`);
  if (!purpose) throw new Error(`CREATIVE_PRODUCTION_STEP_PURPOSE_REQUIRED:${scopeId}:${id}`);
  if (!service) throw new Error(`CREATIVE_PRODUCTION_STEP_SERVICE_REQUIRED:${scopeId}:${id}`);
  if (!capability) throw new Error(`CREATIVE_PRODUCTION_STEP_CAPABILITY_REQUIRED:${scopeId}:${id}`);
  if (!Object.keys(outputSpec).length) {
    throw new Error(`CREATIVE_PRODUCTION_STEP_OUTPUT_SPEC_REQUIRED:${scopeId}:${id}`);
  }
  if (step.quality_gate !== true && step.quality_gate !== false) {
    throw new Error(`CREATIVE_PRODUCTION_STEP_QUALITY_FLAG_REQUIRED:${scopeId}:${id}`);
  }

  return {
    id,
    title,
    purpose,
    service,
    capability,
    depends_on: unique(step.depends_on),
    output_spec: outputSpec,
    requirements: object(step.requirements),
    estimated_cost: Number(step.estimated_cost || 0),
    estimated_seconds: Number(step.estimated_seconds || 0),
    quality_gate: step.quality_gate === true,
    metadata: object(step.metadata),
  };
}

function assetAssignments(plan, deliverables) {
  const knownTargets = new Set(deliverables.map((item) => text(item.id)));
  const direct = new Map();
  const references = new Map();

  for (const entry of list(plan.asset_manifest)) {
    const id = assetId(entry);
    if (!id) throw new Error("CREATIVE_UNIVERSAL_ASSET_ID_REQUIRED");

    const disposition = text(entry.disposition).toUpperCase();
    if (disposition === "EXCLUDE") continue;
    if (!["ASSIGNED", "REFERENCE", "REGENERATE"].includes(disposition)) {
      throw new Error(`CREATIVE_UNIVERSAL_ASSET_DISPOSITION_INVALID:${id}`);
    }

    const targets = unique(entry.assignments);
    if (!targets.length) {
      throw new Error(`CREATIVE_UNIVERSAL_ASSET_ASSIGNMENT_REQUIRED:${id}`);
    }

    for (const target of targets) {
      if (!knownTargets.has(target)) continue;
      const map = disposition === "ASSIGNED" ? direct : references;
      map.set(target, [
        ...(map.get(target) || []),
        disposition === "ASSIGNED"
          ? id
          : {
              asset_id: id,
              disposition,
              restrictions: object(entry.restrictions),
              continuity_anchors: object(entry.continuity_anchors),
              repair_requirements: list(entry.repair_requirements),
            },
      ]);
    }
  }

  return { direct, references };
}

function addStepNode({
  graph,
  step,
  scopeId,
  workflowKind,
  creativePlan,
  deliverable = null,
  directAssets = [],
  referenceAssets = [],
}) {
  const nodeId = `${scopeId}:${slug(step.id)}`;
  const mergedOutputSpec = {
    ...object(deliverable?.output_spec),
    ...step.output_spec,
  };

  graph.nodes.push(createProductionNode({
    id: nodeId,
    type: step.quality_gate ? "ASSET" : "RENDER",
    title: step.title,
    description: step.purpose,
    intent: {
      workflow_kind: workflowKind,
      deliverable_id: deliverable?.id || null,
      deliverable_type: deliverable?.type || null,
      purpose: deliverable?.purpose || step.purpose,
      step_purpose: step.purpose,
    },
    requirements: {
      ...step.requirements,
      creative_contract: CONTRACT,
      concept: object(creativePlan.concept),
      role_decisions: object(creativePlan.role_decisions),
      quality_policy: object(creativePlan.quality),
      channels: list(deliverable?.channels),
      languages: list(deliverable?.languages),
      output_spec: mergedOutputSpec,
      reference_assets: referenceAssets,
    },
    assets: directAssets,
    generation: {
      required: true,
      service: step.service,
      capability: step.capability,
      output_spec: mergedOutputSpec,
      estimated_cost: step.estimated_cost,
      estimated_seconds: step.estimated_seconds,
      status: "WAITING",
    },
    metadata: {
      ...step.metadata,
      contract: CONTRACT,
      workflow_kind: workflowKind,
      deliverable_id: deliverable?.id || null,
      deliverable_type: deliverable?.type || null,
      production_step_id: step.id,
      quality_gate: step.quality_gate,
      reference_asset_ids: referenceAssets.map(assetId).filter(Boolean),
      provider_prompt_persisted: false,
      provider_parameters_persisted: false,
    },
  }));

  return nodeId;
}

function addExplicitDependencies({ graph, steps, nodeIds, scopeId, metadata = {} }) {
  for (const step of steps) {
    const to = nodeIds.get(step.id);
    for (const dependency of step.depends_on) {
      const from = nodeIds.get(dependency);
      if (!from) {
        throw new Error(
          `CREATIVE_PRODUCTION_STEP_DEPENDENCY_UNKNOWN:${scopeId}:${step.id}:${dependency}`,
        );
      }
      graph.edges.push(createProductionEdge({
        from,
        to,
        type: "DEPENDS_ON",
        metadata,
      }));
    }
  }
}

export function buildUniversalProductionGraph({
  organization_id,
  creative_mission_id = null,
  creative_project_id,
  creative_plan = {},
} = {}) {
  if (!organization_id) throw new Error("organization_id required");
  if (!creative_project_id) throw new Error("creative_project_id required");
  if (!creative_plan.validation?.passed) {
    throw new Error("CREATIVE_MASTER_PLAN_VALIDATION_REQUIRED");
  }
  if (creative_plan.degraded === true) {
    throw new Error("CREATIVE_DEGRADED_DIRECTION_RELEASE_BLOCKED");
  }

  const workflow = workflowFor(creative_plan);
  const workflowKind = workflow.workflow_kind;
  const deliverables = list(creative_plan.deliverables).map((item, index) => ({
    ...item,
    id: text(item.id) || `deliverable-${index + 1}`,
  }));

  if (!deliverables.length) {
    throw new Error("CREATIVE_UNIVERSAL_DELIVERABLES_REQUIRED");
  }

  const assets = assetAssignments(creative_plan, deliverables);
  const graph = createProductionGraph({
    organization_id,
    creative_project_id,
    title: text(creative_plan.concept?.title),
    description: text(
      creative_plan.concept?.narrative || creative_plan.concept?.message,
    ),
    cost_plan: {
      currency: creative_plan.production?.currency || null,
      approval_required:
        creative_plan.production?.cost_approval_required ?? null,
      approved:
        creative_plan.production?.cost_approved ?? null,
    },
    production_plan: {
      quality_profile: creative_plan.production?.quality_profile || null,
      draft_first: creative_plan.production?.draft_first ?? null,
      reuse_assets: creative_plan.production?.reuse_assets ?? null,
      render_modes: list(creative_plan.production?.render_modes),
    },
    metadata: {
      contract: CONTRACT,
      workflow_kind: workflowKind,
      creative_mission_id,
      deliverables,
      role_decisions: object(creative_plan.role_decisions),
      quality_policy: object(creative_plan.quality),
      asset_manifest: list(creative_plan.asset_manifest),
      master_plan_validation: creative_plan.validation,
      director_authored_steps_required: true,
      downstream_default_recipes_forbidden: true,
      provider_prompts_persisted: false,
      provider_parameters_persisted: false,
    },
  });

  const finalNodesByDeliverable = new Map();

  for (const deliverable of deliverables) {
    const scopeId = `deliverable:${slug(deliverable.id, "deliverable")}`;
    const rawSteps = list(deliverable.production_steps);
    if (!rawSteps.length) {
      throw new Error(
        `CREATIVE_DIRECTOR_PRODUCTION_STEPS_REQUIRED:${deliverable.id}`,
      );
    }

    const steps = rawSteps.map((step, index) =>
      normalizeStep(step, index, deliverable.id),
    );
    if (!steps.some((step) => step.quality_gate)) {
      throw new Error(
        `CREATIVE_DELIVERABLE_QUALITY_GATE_REQUIRED:${deliverable.id}`,
      );
    }

    const nodeIds = new Map();
    const directAssets = unique(assets.direct.get(deliverable.id) || []);
    const referenceAssets = list(assets.references.get(deliverable.id));

    for (const step of steps) {
      const nodeId = addStepNode({
        graph,
        step,
        scopeId,
        workflowKind,
        creativePlan: creative_plan,
        deliverable,
        directAssets,
        referenceAssets,
      });
      nodeIds.set(step.id, nodeId);
    }

    addExplicitDependencies({
      graph,
      steps,
      nodeIds,
      scopeId,
      metadata: { deliverable_id: deliverable.id },
    });

    const dependedOn = new Set(steps.flatMap((step) => step.depends_on));
    const terminalSteps = steps.filter((step) => !dependedOn.has(step.id));
    finalNodesByDeliverable.set(
      deliverable.id,
      terminalSteps.map((step) => nodeIds.get(step.id)).filter(Boolean),
    );
  }

  const crossSteps = list(creative_plan.production?.cross_deliverable_steps);
  if (crossSteps.length) {
    const scopeId = "cross-deliverable";
    const steps = crossSteps.map((step, index) =>
      normalizeStep(step, index, scopeId),
    );
    const nodeIds = new Map();

    for (const step of steps) {
      const nodeId = addStepNode({
        graph,
        step,
        scopeId,
        workflowKind,
        creativePlan: creative_plan,
      });
      nodeIds.set(step.id, nodeId);
    }

    addExplicitDependencies({
      graph,
      steps,
      nodeIds,
      scopeId,
      metadata: { cross_deliverable: true },
    });

    const entrySteps = steps.filter((step) => !step.depends_on.length);
    for (const step of entrySteps) {
      const to = nodeIds.get(step.id);
      for (const terminalNodes of finalNodesByDeliverable.values()) {
        for (const from of terminalNodes) {
          graph.edges.push(createProductionEdge({
            from,
            to,
            type: "DEPENDS_ON",
            metadata: { cross_deliverable: true },
          }));
        }
      }
    }
  }

  return graph;
}
