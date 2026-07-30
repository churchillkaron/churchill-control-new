import crypto from "node:crypto";

import {
  createCreativeAssetNode,
  CREATIVE_ASSET_NODE_STATUS,
  CREATIVE_ASSET_NODE_TYPES,
} from "@/lib/creative/assets/graph/documents/CreativeAssetNode";
import * as AssetGraphRepository
from "@/lib/creative/assets/graph/repositories/CreativeAssetGraphRepository";
import * as ProductionGraphRepository
from "@/lib/creative/production-graph/repositories/ProductionGraphRepository";

const VOLATILE_KEYS = new Set([
  "created_at",
  "updated_at",
  "measured_at",
  "generated_at",
  "evaluated_at",
  "approved_at",
  "started_at",
  "completed_at",
  "last_polled_at",
  "provider_job_id",
  "raw",
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

function finite(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.keys(value)
      .filter((key) => !VOLATILE_KEYS.has(key))
      .filter((key) => value[key] !== undefined)
      .sort()
      .map((key) => [key, canonical(value[key])]),
  );
}

function digest(value) {
  return crypto
    .createHash("sha256")
    .update(JSON.stringify(canonical(value)))
    .digest("hex");
}

function planSnapshot(graph = {}) {
  const snapshot = object(graph.metadata?.approval_plan_snapshot);
  if (!Object.keys(snapshot).length) {
    throw new Error("PRODUCTION_DOSSIER_PLAN_SNAPSHOT_REQUIRED");
  }
  return snapshot;
}

function graphSnapshot(graph = {}) {
  return {
    id: graph.id,
    organization_id: graph.organization_id,
    creative_project_id: graph.creative_project_id,
    storyboard_id: graph.storyboard_id,
    title: graph.title,
    description: graph.description,
    cost_plan: graph.cost_plan,
    production_plan: graph.production_plan,
    nodes: list(graph.nodes).map((node) => ({
      id: node.id,
      type: node.type,
      title: node.title,
      description: node.description,
      duration_seconds: node.duration_seconds,
      intent: node.intent,
      requirements: node.requirements,
      assets: node.assets,
      generation: node.generation,
      metadata: node.metadata,
    })),
    edges: list(graph.edges).map((edge) => ({
      id: edge.id,
      from: edge.from,
      to: edge.to,
      type: edge.type,
      metadata: edge.metadata,
    })),
    metadata: {
      workflow_kind: graph.metadata?.workflow_kind || null,
      concept_council_hash: graph.metadata?.concept_council_hash || null,
      selected_concept_hash: graph.metadata?.selected_concept_hash || null,
      measured_audio_evidence_hash:
        graph.metadata?.measured_audio_evidence_hash || null,
      identity_atlas_hashes: graph.metadata?.identity_atlas_hashes || [],
    },
  };
}

function executionSnapshot(executionPlan = {}) {
  return {
    organization_id: executionPlan.organization_id,
    creative_project_id: executionPlan.creative_project_id,
    production_graph_id: executionPlan.production_graph_id,
    estimated_cost: finite(executionPlan.estimated_cost) || 0,
    estimated_minutes: finite(executionPlan.estimated_minutes) || 0,
    steps: list(executionPlan.steps).map((step) => ({
      id: step.id,
      node_id: step.node_id,
      service_code: step.service_code,
      capability: step.capability,
      priority: step.priority,
      depends_on: step.depends_on,
      estimated_cost: finite(step.estimated_cost) || 0,
      estimated_seconds: finite(step.estimated_seconds) || 0,
      input: step.input,
      metadata: step.metadata,
    })),
  };
}

function generationSummary(executionPlan = {}) {
  const byCapability = {};
  const byProvider = {};
  let paidOrExternalTaskCount = 0;
  let estimatedCost = 0;

  for (const step of list(executionPlan.steps)) {
    const capability = text(step.capability || step.service_code) || "UNKNOWN";
    const provider = text(
      step.input?.generation?.provider ||
      step.metadata?.generation?.provider ||
      step.input?.provider_id ||
      "AUTO",
    );
    const cost = Math.max(0, finite(step.estimated_cost) || 0);
    estimatedCost += cost;
    byCapability[capability] = (byCapability[capability] || 0) + 1;
    byProvider[provider] = (byProvider[provider] || 0) + 1;
    if (cost > 0 || capability.startsWith("ai.")) paidOrExternalTaskCount += 1;
  }

  return {
    task_count: list(executionPlan.steps).length,
    paid_or_external_task_count: paidOrExternalTaskCount,
    estimated_cost: Number(estimatedCost.toFixed(6)),
    by_capability: byCapability,
    by_provider: byProvider,
  };
}

function sceneDossier(graph = {}) {
  const nodes = list(graph.nodes);
  const edges = list(graph.edges);
  const children = new Map();
  for (const edge of edges.filter((edge) => edge.type === "CONTAINS")) {
    if (!children.has(edge.from)) children.set(edge.from, []);
    children.get(edge.from).push(edge.to);
  }
  const nodeMap = new Map(nodes.map((node) => [node.id, node]));
  return nodes
    .filter((node) => node.type === "SCENE")
    .map((scene) => ({
      id: scene.id,
      title: scene.title,
      description: scene.description,
      duration_seconds: scene.duration_seconds,
      intent: scene.intent,
      requirements: scene.requirements,
      shots: list(children.get(scene.id)).map((id) => nodeMap.get(id)).filter(Boolean)
        .map((shot) => ({
          id: shot.id,
          title: shot.title,
          purpose: shot.intent?.purpose || shot.description || "",
          action: shot.intent?.action || shot.requirements?.action || "",
          duration_seconds: shot.duration_seconds,
          opening_frame:
            shot.intent?.opening_frame || shot.requirements?.opening_frame || null,
          progression:
            shot.intent?.progression_frames ||
            shot.requirements?.progression_frames ||
            null,
          closing_frame:
            shot.intent?.closing_frame || shot.requirements?.closing_frame || null,
          camera: shot.requirements?.camera || null,
          lighting: shot.requirements?.lighting || null,
          production_design: shot.requirements?.production_design || null,
          identity_requirements: shot.requirements?.identity_requirements || null,
          product_requirements: shot.requirements?.product_requirements || null,
          rights_requirements: shot.requirements?.rights_requirements || null,
          reuse_policy:
            shot.requirements?.reuse_policy || shot.metadata?.reuse_policy || null,
          source_asset_ids: shot.assets || [],
          reference_asset_ids:
            shot.requirements?.reference_asset_ids ||
            shot.metadata?.reference_asset_ids ||
            [],
          generation: {
            required: shot.generation?.required === true,
            service: shot.generation?.service || null,
            capability: shot.generation?.capability || null,
            provider: shot.generation?.provider || null,
            model: shot.generation?.model || null,
            estimated_cost: finite(shot.generation?.estimated_cost) || 0,
            estimated_seconds: finite(shot.generation?.estimated_seconds) || 0,
            provider_prompt: shot.generation?.provider_prompt || null,
            provider_parameters: shot.generation?.provider_parameters || {},
            output_spec: shot.generation?.output_spec || {},
          },
        })),
    }));
}

function approvalChecklist({ plan, graph, executionPlan, summary }) {
  const failures = [];
  if (!text(plan.selected_concept_id)) failures.push("SELECTED_CONCEPT_REQUIRED");
  if (!text(plan.concept_council?.council_hash || plan.production?.concept_council_hash)) {
    failures.push("CONCEPT_COUNCIL_HASH_REQUIRED");
  }
  if (!list(graph.nodes).length) failures.push("PRODUCTION_GRAPH_NODES_REQUIRED");
  if (!list(executionPlan.steps).length) failures.push("EXECUTION_STEPS_REQUIRED");
  if (summary.paid_or_external_task_count > 0 && !text(
    plan.production?.currency || graph.cost_plan?.currency,
  )) {
    failures.push("CURRENCY_REQUIRED_FOR_PAID_PRODUCTION");
  }
  for (const step of list(executionPlan.steps)) {
    if (!text(step.capability || step.service_code)) {
      failures.push(`CAPABILITY_REQUIRED:${step.node_id || step.id}`);
    }
    if (finite(step.estimated_cost) === null || Number(step.estimated_cost) < 0) {
      failures.push(`VALID_ESTIMATED_COST_REQUIRED:${step.node_id || step.id}`);
    }
  }
  return {
    passed: failures.length === 0,
    failures,
    checks: {
      concept_selected: Boolean(text(plan.selected_concept_id)),
      concept_council_locked: Boolean(text(
        plan.concept_council?.council_hash || plan.production?.concept_council_hash,
      )),
      graph_present: list(graph.nodes).length > 0,
      execution_present: list(executionPlan.steps).length > 0,
      costs_declared: list(executionPlan.steps).every((step) =>
        finite(step.estimated_cost) !== null && Number(step.estimated_cost) >= 0,
      ),
      provider_prompts_included: list(graph.nodes)
        .filter((node) => node.generation?.required === true)
        .every((node) => Boolean(text(node.generation?.provider_prompt)) ||
          !text(node.generation?.capability).startsWith("ai.")),
    },
  };
}

function dossierDocument({ graph, executionPlan }) {
  const plan = planSnapshot(graph);
  const graphEvidence = graphSnapshot(graph);
  const executionEvidence = executionSnapshot(executionPlan);
  const summary = generationSummary(executionPlan);
  const checklist = approvalChecklist({
    plan,
    graph,
    executionPlan,
    summary,
  });
  const planHash = digest(plan);
  const graphHash = digest(graphEvidence);
  const executionHash = digest(executionEvidence);
  const currency = text(
    plan.production?.currency ||
    graph.cost_plan?.currency ||
    null,
  ) || null;
  const content = {
    contract: "PRODUCTION_DOSSIER_V1",
    organization_id: graph.organization_id,
    creative_project_id: graph.creative_project_id,
    production_graph_id: graph.id,
    workflow_kind: graph.metadata?.workflow_kind || plan.workflow_kind || null,
    selected_concept: {
      id: plan.selected_concept_id || null,
      title: plan.concept?.title || null,
      narrative: plan.concept?.narrative || null,
      selection_reason: plan.concept_selection_reason || null,
      selected_concept_hash:
        plan.concept_council?.concept_hash ||
        plan.production?.selected_concept_hash ||
        null,
      concept_council_hash:
        plan.concept_council?.council_hash ||
        plan.production?.concept_council_hash ||
        null,
      scorecard: plan.concept_council?.selection?.selected_scorecard || null,
      mandatory_repairs:
        plan.concept_council?.selection?.mandatory_repairs_before_planning || [],
    },
    story_architecture: plan.story_architecture || {},
    measured_audio: {
      evidence_hash:
        plan.measured_audio_intelligence?.evidence_hash ||
        plan.production?.measured_audio_evidence_hash ||
        null,
      source_asset_id:
        plan.measured_audio_intelligence?.source_asset_id ||
        plan.production?.primary_audio_asset_id ||
        null,
      tempo: plan.measured_audio_intelligence?.tempo || null,
      structural_sections:
        plan.measured_audio_intelligence?.structural_sections || [],
      energy_curve: plan.measured_audio_intelligence?.energy_curve || [],
    },
    identity: {
      profiles: plan.identity_profiles || plan.subject_profiles || [],
      atlases: plan.identity_atlases || [],
      keyframe_required:
        plan.production?.identity_story_keyframe_required_before_video === true,
      lip_sync_required:
        plan.production?.audio_conditioned_lip_sync_required === true,
    },
    deliverables: plan.deliverables || [],
    scenes: sceneDossier(graph),
    generation_summary: summary,
    cost: {
      currency,
      estimated_total: summary.estimated_cost,
      approved_cost_ceiling: null,
      approval_required: true,
    },
    approval_checklist: checklist,
    immutable_evidence: {
      plan_hash: planHash,
      graph_hash: graphHash,
      execution_hash: executionHash,
    },
  };
  return {
    ...content,
    dossier_hash: digest(content),
  };
}

function newest(nodes = []) {
  return [...nodes].sort((left, right) =>
    Date.parse(right.updated_at || right.created_at || 0) -
    Date.parse(left.updated_at || left.created_at || 0),
  )[0] || null;
}

export const CreativeProductionDossierRuntime = {
  hash: digest,

  async materialize({
    organization_id,
    creative_project_id,
    production_graph,
    execution_plan,
  } = {}) {
    if (!organization_id) throw new Error("organization_id required");
    if (!creative_project_id) throw new Error("creative_project_id required");
    if (!production_graph?.id) throw new Error("production_graph required");
    if (!execution_plan) throw new Error("execution_plan required");
    if (String(production_graph.organization_id) !== String(organization_id)) {
      throw new Error("PRODUCTION_DOSSIER_ORGANIZATION_MISMATCH");
    }
    if (String(production_graph.creative_project_id) !== String(creative_project_id)) {
      throw new Error("PRODUCTION_DOSSIER_PROJECT_MISMATCH");
    }

    const dossier = dossierDocument({
      graph: production_graph,
      executionPlan: execution_plan,
    });
    if (!dossier.approval_checklist.passed) {
      throw new Error(
        `PRODUCTION_DOSSIER_VALIDATION_FAILED:${dossier.approval_checklist.failures.join(",")}`,
      );
    }

    const nodes = await AssetGraphRepository.listByProject({
      organization_id,
      creative_project_id,
    });
    let node = newest(nodes.filter((candidate) =>
      candidate.type === CREATIVE_ASSET_NODE_TYPES.PRODUCTION_DOSSIER &&
      candidate.metadata?.contract === "PRODUCTION_DOSSIER_V1" &&
      candidate.metadata?.dossier_hash === dossier.dossier_hash &&
      candidate.status !== CREATIVE_ASSET_NODE_STATUS.ARCHIVED,
    ));
    let reused = true;

    if (!node) {
      reused = false;
      node = await AssetGraphRepository.create(createCreativeAssetNode({
        organization_id,
        creative_project_id,
        type: CREATIVE_ASSET_NODE_TYPES.PRODUCTION_DOSSIER,
        status: CREATIVE_ASSET_NODE_STATUS.REVIEW,
        name: `${production_graph.title || "Creative production"} approval dossier`,
        description: "Immutable zero-generation production dossier containing the approved concept, evidence, scenes, shots, prompts, references, reuse decisions, generation count and cost ceiling request.",
        lineage: {
          source: "production_planning",
          provider_id: null,
          capability: "creative.production.dossier",
          generation_version: 1,
        },
        cost: {
          currency: dossier.cost.currency,
          estimated: dossier.cost.estimated_total,
          actual: 0,
        },
        reuse: {
          reusable: false,
          approved_for_reuse: false,
        },
        review: {
          ai_reviewed: false,
          human_reviewed: false,
          approved: false,
          notes: "Human approval of the exact plan hash and cost ceiling is required before provider execution.",
        },
        intelligence: {
          quality_score: null,
          safety_status: "UNKNOWN",
          tags: [
            "production-dossier",
            "human-approval-required",
            `workflow:${text(dossier.workflow_kind).toLowerCase() || "unknown"}`,
          ],
        },
        metadata: {
          contract: dossier.contract,
          passed: dossier.approval_checklist.passed,
          dossier_hash: dossier.dossier_hash,
          plan_hash: dossier.immutable_evidence.plan_hash,
          graph_hash: dossier.immutable_evidence.graph_hash,
          execution_hash: dossier.immutable_evidence.execution_hash,
          production_graph_id: production_graph.id,
          selected_concept_id: dossier.selected_concept.id,
          selected_concept_hash: dossier.selected_concept.selected_concept_hash,
          concept_council_hash: dossier.selected_concept.concept_council_hash,
          measured_audio_evidence_hash: dossier.measured_audio.evidence_hash,
          estimated_cost: dossier.cost.estimated_total,
          currency: dossier.cost.currency,
          approved_cost_ceiling: null,
          human_approval_required: true,
          approval_scope: "PRODUCTION_DOSSIER",
          dossier,
        },
      }));
    }

    const graph = await ProductionGraphRepository.update(production_graph.id, {
      cost_plan: {
        ...object(production_graph.cost_plan),
        currency: dossier.cost.currency,
        estimated_cost: dossier.cost.estimated_total,
        approval_required: true,
        approved: false,
      },
      metadata: {
        ...object(production_graph.metadata),
        production_dossier_contract: dossier.contract,
        production_dossier_asset_node_id: node.id,
        production_dossier_hash: dossier.dossier_hash,
        approved_plan_hash: null,
        plan_hash: dossier.immutable_evidence.plan_hash,
        graph_hash: dossier.immutable_evidence.graph_hash,
        execution_hash: dossier.immutable_evidence.execution_hash,
        estimated_production_cost: dossier.cost.estimated_total,
        production_currency: dossier.cost.currency,
        production_dossier_human_approval_required: true,
      },
    });

    return {
      contract: dossier.contract,
      dossier,
      dossier_asset_node: node,
      production_graph: graph,
      reused,
      approved: false,
      approval_required: true,
    };
  },
};
