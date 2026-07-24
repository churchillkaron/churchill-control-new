import {
  createExecutionPlan,
  createExecutionStep,
} from "../documents/ExecutionPlan";

function isBlockingDependency(edge = {}) {
  if (edge.type === "DEPENDS_ON") return true;

  return (
    edge.type === "FOLLOWS" &&
    edge.metadata?.blocks_execution === true
  );
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
    metadata: {
      production_contract:
        production_graph.metadata?.production_contract ||
        "atomic_reference_grounded_shots_v1",
      source_graph_version:
        production_graph.updated_at ||
        production_graph.created_at ||
        null,
    },
  });

  const nodes = production_graph.nodes || [];
  const edges = production_graph.edges || [];
  const generatedNodeIds = new Set(
    nodes
      .filter((node) => node.generation?.required)
      .map((node) => node.id),
  );

  plan.steps = nodes
    .filter((node) => node.generation?.required)
    .map((node) => {
      const dependencies = edges
        .filter(
          (edge) =>
            edge.to === node.id &&
            isBlockingDependency(edge) &&
            generatedNodeIds.has(edge.from),
        )
        .map((edge) => edge.from);

      return createExecutionStep({
        id: `step:${node.id}`,
        node_id: node.id,
        service_code: node.generation.service,
        capability:
          node.generation.capability ||
          node.generation.service,
        priority: Number(node.priority || 100),
        depends_on: dependencies.map(
          (dependencyNodeId) =>
            `step:${dependencyNodeId}`,
        ),
        estimated_cost:
          node.generation.estimated_cost,
        estimated_seconds:
          node.generation.estimated_seconds,
        input: {
          ...(node.generation.input || {}),
          node_id: node.id,
          node_type: node.type,
          title: node.title,
          description: node.description,
          intent: node.intent || {},
          requirements: node.requirements || {},
          assets: node.assets || [],
          duration_seconds:
            Number(node.duration_seconds || 0),
        },
        metadata: {
          ...(node.metadata || {}),
          node_type: node.type,
          node_title: node.title,
          production_graph_id: production_graph.id,
          generation_status:
            node.generation.status ||
            "WAITING",
        },
      });
    });

  plan.estimated_cost = plan.steps.reduce(
    (total, step) =>
      total + Number(step.estimated_cost || 0),
    0,
  );

  plan.estimated_minutes = Math.ceil(
    plan.steps.reduce(
      (total, step) =>
        total + Number(step.estimated_seconds || 0),
      0,
    ) / 60,
  );

  plan.status = "PLANNED";

  return plan;
}
