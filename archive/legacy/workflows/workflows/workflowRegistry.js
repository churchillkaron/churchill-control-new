const workflowRegistry = {}

export function registerWorkflow(
  event,
  workflow
) {

  if (!workflowRegistry[event]) {
    workflowRegistry[event] = []
  }

  workflowRegistry[event].push(
    workflow
  )
}

export function getWorkflows(
  event
) {

  return (
    workflowRegistry[event] || []
  )
}

export function getWorkflowRegistry() {

  return workflowRegistry

}
