function list(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function text(value) {
  return String(value ?? "").trim();
}

export function scopeProductionTasksForGraph({
  tasks = [],
  production_graph_id,
} = {}) {
  const graphId = text(production_graph_id);
  if (!graphId) {
    throw new Error("PRODUCTION_TASK_GRAPH_SCOPE_REQUIRED");
  }

  const scoped = [];
  const crossGraphCollisions = [];
  const scopedNodeIds = new Set();

  for (const task of list(tasks)) {
    const taskGraphId = text(
      task.production_graph_id || task.metadata?.production_graph_id,
    );
    const nodeId = text(task.metadata?.execution_node_id);

    if (taskGraphId === graphId) {
      scoped.push(task);
      if (nodeId) scopedNodeIds.add(nodeId);
      continue;
    }

    if (nodeId) {
      crossGraphCollisions.push({
        task_id: task.id || null,
        execution_node_id: nodeId,
        production_graph_id: taskGraphId || null,
      });
    }
  }

  const existingByNode = new Map(
    scoped
      .filter((task) => text(task.metadata?.execution_node_id))
      .map((task) => [text(task.metadata.execution_node_id), task]),
  );

  return {
    production_graph_id: graphId,
    scoped_tasks: scoped,
    existing_by_node: existingByNode,
    scoped_node_ids: [...scopedNodeIds],
    cross_graph_collisions: crossGraphCollisions,
    contract: "PRODUCTION_TASK_GRAPH_SCOPE_V1",
  };
}

export const ProductionTaskGraphScopePlanner = Object.freeze({
  scope: scopeProductionTasksForGraph,
});
