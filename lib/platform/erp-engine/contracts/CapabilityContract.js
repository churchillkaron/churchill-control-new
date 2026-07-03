export function normalizeCapability(capability = {}) {

  return {

    id:
      capability.id,

    domain:
      capability.domain,

    workspace:
      capability.workspace,

    document:
      capability.document,

    repository:
      capability.repository,

    workflow:
      capability.workflow,

    renderer:
      capability.renderer,

    form:
      capability.form,

    permissions:
      capability.permissions || [],

    actions:
      capability.actions || {},

    reports:
      capability.reports || [],

    search:
      capability.search || [],

    ai:
      capability.ai || [],

    api:
      capability.api || null,

    table:
      capability.table || null,

  };

}
