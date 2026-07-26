import {
  createExecutionPlan,
  createExecutionStep,
} from "../documents/ExecutionPlan";

function list(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
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

  plan.steps = nodes
    .filter((node) => node.generation?.required)
    .map((node) => {
      const dependencies = edges
        .filter((edge) => edge.to === node.id && edge.type === "DEPENDS_ON")
        .map((edge) => edge.from);
      const generation = node.generation || {};
      const sourceAssets = list(node.assets);
      const referenceAssets = list(node.requirements?.reference_assets);

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
          intent: node.intent || {},
          requirements: node.requirements || {},
          source_assets: sourceAssets,
          reference_assets: referenceAssets,
          generation,
          prompt: generation.provider_prompt || null,
          provider_prompt: generation.provider_prompt || null,
          provider_parameters: generation.provider_parameters || {},
          output_spec: generation.output_spec || node.requirements?.output_spec || {},
        },
        metadata: {
          ...(node.metadata || {}),
          node_type: node.type,
          node_title: node.title,
          scene_id: node.metadata?.scene_id || null,
          scene_number: node.metadata?.scene_number || null,
          shot_number: node.metadata?.shot_number || null,
          intent: node.intent || {},
          requirements: node.requirements || {},
          source_assets: sourceAssets,
          reference_assets: referenceAssets,
          generation,
          provider_prompt: generation.provider_prompt || null,
          provider_parameters: generation.provider_parameters || {},
          output_spec: generation.output_spec || node.requirements?.output_spec || {},
          production_graph_contract: production_graph.metadata?.contract || null,
          workflow_kind: production_graph.metadata?.workflow_kind || null,
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
