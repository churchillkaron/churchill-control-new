export function buildAIContext({
  tenant,
  industry,
  modules = [],
  permissions = [],
  dashboard = [],
}) {

  return {

    tenant: {

      id:
        tenant?.id,

      name:
        tenant?.name,

    },

    industry: {

      id:
        industry?.id,

      name:
        industry?.name,

    },

    modules:
      modules.map(
        module => ({

          id:
            module.module_id,

          name:
            module.module_name,

        })
      ),

    permissions,

    dashboard,

    aiCapabilities: {

      forecasting:
        modules.some(
          m =>

            m.module_id ===
            "analytics"
        ),

      marketing:
        modules.some(
          m =>

            m.module_id ===
            "marketing_ai"
        ),

      executive:
        modules.some(
          m =>

            m.module_id ===
            "owner_ai"
        ),

      finance:
        modules.some(
          m =>

            m.module_id ===
            "finance"
        ),

      operations:
        modules.some(
          m =>

            m.module_id ===
            "operations" ||

            m.module_id ===
            "pos"
        ),

    },

  };

}
