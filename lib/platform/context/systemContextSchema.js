/**
 * AVANTIQO SYSTEM CONTEXT SCHEMA
 */

export const SYSTEM_CONTEXT_SCHEMA = {
  organization_id: "uuid",
  entity_id: "uuid | null",
  period_id: "uuid | null",

  industry: "restaurant | hotel | healthcare | agency | retail | general",

  plan: "free | pro | enterprise",

  country: "string | null",
  currency: "string | null",
  timezone: "string | null",

  organization: {
    id: "uuid",
    name: "string",
    type: "string",
  },

  modules: ["array"],
};
