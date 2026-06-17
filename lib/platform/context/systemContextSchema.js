/**
 * AVANTIQO SYSTEM CONTEXT SCHEMA (LOGICAL MODEL)
 * Defines full OS state structure
 */

export const SYSTEM_CONTEXT_SCHEMA = {
  tenant_id: "uuid",
  organization_id: "uuid",

  industry: "restaurant | hotel | healthcare | agency | retail",

  plan: "free | pro | enterprise",

  organization: {
    name: "string",
    type: "string",
  },

  modules: ["array"],
};
