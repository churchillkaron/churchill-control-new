import {
  createExecutionPlan,
  createExecutionStep,
} from "../documents/ExecutionPlan";

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

      return createExecutionStep({
        node_id: node.id,
        service_code: node.generation.service,
        capability: node.generation.capability || node.generation.service,
        priority: node.priority || 100,
        depends_on: dependencies,
        estimated_cost: node.generation.estimated_cost,
        estimated_seconds: node.generation.estimated_seconds,
        metadata: {
          node_type: node.type,
          node_title: node.title,
          scene_id: node.metadata?.scene_id || null,
          scene_number: node.metadata?.scene_number || null,
          shot_number: node.metadata?.shot_number || null,
          intent: node.intent || {},
          requirements: node.requirements || {},
          source_assets: node.assets || [],
          generation: node.generation || {},
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
