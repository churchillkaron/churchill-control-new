const workflowRegistry = new Map();

export function registerWorkflow({

  key,

  workflow,

}) {

  workflowRegistry.set(
    key,
    workflow
  );

  return workflow;

}

export function getWorkflow(
  key
) {

  return workflowRegistry.get(
    key
  );

}

export function getAllWorkflows() {

  return Array.from(
    workflowRegistry.keys()
  );

}
