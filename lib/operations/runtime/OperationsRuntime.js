export function buildOperationsRuntime(context = {}) {
  return {
    domain: "operations",
    tasks: {},
    dispatch: {},
    incidents: {},
    activities: {},
    checklists: {},
    context,
  };
}

export default buildOperationsRuntime;
