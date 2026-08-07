import {
  createExecutionPlan,
  createExecutionStep,
} from "../documents/ExecutionPlan";

const PROMPT_FIELDS = new Set([
  "prompt",
  "provider_prompt",
  "negative_prompt",
  "system_prompt",
  "developer_prompt",
  "user_prompt",
  "generation_prompt",
  "visual_prompt",
  "video_prompt",
  "image_prompt",
  "music_prompt",
  "transport_prompt",
  "prompt_template",
  "prompt_text",
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

function normalizedKey(value) {
  return text(value)
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replaceAll("-", "_")
    .toLowerCase();
}

function stripPrompts(value, depth = 0) {
  if (depth > 20) return null;
  if (Array.isArray(value)) {
    return value.map((item) => stripPrompts(item, depth + 1));
  }
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !PROMPT_FIELDS.has(normalizedKey(key)))
      .map(([key, child]) => [key, stripPrompts(child, depth + 1)]),
  );
}

function graphLineage(graph = {}) {
  return object(graph.metadata?.story_lineage || graph.story_lineage);
}

function lineageMetadata(graph = {}) {
  const lineage = graphLineage(graph);
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

export function buildExecutionPlan({
  organization_id,
  creative_project_id,
  production_graph,
}) {
  const plan = createExecutionPlan({
    organization_id,
    creative_project_id,
    production_graph_id: production_graph.id,
  });

  const nodes = production_graph.nodes || [];
  const edges = production_graph.edges || [];
  const lineage = graphLineage(production_graph);
  const temporal = text(production_graph.metadata?.workflow_kind).toUpperCase() === "TEMPORAL";
  if (
    temporal &&
    (!text(lineage.story_contract_hash) || !text(lineage.master_plan_hash))
  ) {
    throw new Error("CREATIVE_EXECUTION_PLAN_STORY_LINEAGE_REQUIRED");
  }

  plan.steps = nodes
    .filter((node) => node.generation?.required)
    .map((node) => {
      const dependencies = edges
        .filter((edge) => edge.to === node.id && edge.type === "DEPENDS_ON")
        .map((edge) => edge.from);
      const generation = stripPrompts(object(node.generation));
      const requirements = stripPrompts(object(node.requirements));
      const intent = stripPrompts(node.intent || {});
      const sourceAssets = stripPrompts(list(node.assets));
      const referenceAssets = stripPrompts(list(requirements.reference_assets));
      const providerParameters = stripPrompts(generation.provider_parameters || {});
      const outputSpec = stripPrompts(
        generation.output_spec || requirements.output_spec || {},
      );

      return createExecutionStep({
        node_id: node.id,
        service_code: generation.service,
        capability: generation.capability || generation.service,
        priority: node.priority || 100,
        depends_on: dependencies,
        estimated_cost: generation.estimated_cost,
        estimated_seconds: generation.estimated_seconds,
        input: {
          node_id: node.id,
          node_type: node.type,
          title: node.title,
          description: node.description,
          intent,
          requirements,
          source_assets: sourceAssets,
          reference_assets: referenceAssets,
          reference_asset_ids: list(requirements.reference_asset_ids),
          generation,
          provider_parameters: providerParameters,
          output_spec: outputSpec,
          repair_contract: stripPrompts(requirements.repair_contract || {}),
          story_lineage: lineage,
          promptless_persistence: true,
        },
        metadata: {
          execution_node_id: node.id,
          node_type: node.type,
          node_title: node.title,
          scene_id: node.metadata?.scene_id || null,
          scene_number: node.metadata?.scene_number || null,
          shot_id: node.metadata?.shot_id || null,
          shot_number: node.metadata?.shot_number || null,
          intent,
          requirements,
          source_assets: sourceAssets,
          reference_assets: referenceAssets,
          generation,
          provider_parameters: providerParameters,
          output_spec: outputSpec,
          repair_contract: stripPrompts(requirements.repair_contract || {}),
          production_graph_contract: production_graph.metadata?.contract || null,
          workflow_kind: production_graph.metadata?.workflow_kind || null,
          task_materialization_contract:
            node.metadata?.task_materialization_contract || null,
          task_materialization_contract_hash:
            node.metadata?.task_materialization_contract_hash || null,
          provider_prompts_persisted: false,
          execution_metadata_structured_only: true,
          ...lineageMetadata(production_graph),
        },
      });
    });

  plan.estimated_cost = plan.steps.reduce(
    (total, step) => total + Number(step.estimated_cost || 0),
    0,
  );

  plan.estimated_minutes = Math.ceil(
    plan.steps.reduce(
      (total, step) => total + Number(step.estimated_seconds || 0),
      0,
    ) / 60,
  );

  return plan;
}
