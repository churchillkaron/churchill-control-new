const workflows = new Map();

export function registerWorkflow(workflow) {
  const key = workflow.id;

  workflows.set(key, workflow);

  return workflow;
}

export function getWorkflow(id) {
  const workflow = workflows.get(id);

  if (!workflow) {
    throw new Error(
      `Workflow not found: ${id}`
    );
  }

  return workflow;
}

export function listWorkflows() {
  return [...workflows.values()];
}
