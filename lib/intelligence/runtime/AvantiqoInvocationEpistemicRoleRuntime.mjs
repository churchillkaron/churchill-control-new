const CONTRACT = "AVANTIQO_INVOCATION_EPISTEMIC_ROLE_V1";
const OPERATOR_LIVE_READ_TOOL = "operator_live_read";
const ALLOWED_EPISTEMIC_ROLES = new Set([
  "research",
  "live_read",
  "verification",
]);
const OPERATOR_RESEARCH_CAPABILITY_KEYS = new Set([
  "platform.research.search",
  "platform.research_source.read",
  "platform.research_compare.analyze",
]);

function text(value, limit = 300) {
  return String(value ?? "").trim().slice(0, limit);
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

function normalizedStaticRoles(value) {
  return list(value)
    .map((role) => text(role, 80).toLowerCase())
    .filter((role) => ALLOWED_EPISTEMIC_ROLES.has(role));
}

export function resolveAvantiqoInvocationEpistemicRoles({
  tool_name = null,
  capability_key = null,
  static_roles = [],
} = {}) {
  const toolName = text(tool_name, 120);
  const capabilityKey = text(capability_key, 300);
  const roles = new Set(normalizedStaticRoles(static_roles));

  if (toolName === OPERATOR_LIVE_READ_TOOL) {
    roles.add("live_read");
    if (OPERATOR_RESEARCH_CAPABILITY_KEYS.has(capabilityKey)) {
      roles.add("research");
    }
  }

  return [...roles].slice(0, 8);
}

export const AvantiqoInvocationEpistemicRoleRuntime = Object.freeze({
  contract: CONTRACT,
  operatorLiveReadTool: OPERATOR_LIVE_READ_TOOL,
  researchCapabilityKeys: Object.freeze([...OPERATOR_RESEARCH_CAPABILITY_KEYS]),
  resolve: resolveAvantiqoInvocationEpistemicRoles,
  governance: Object.freeze({
    authorization_effect: "NONE",
    capability_key_exact_match_required: true,
    arbitrary_model_role_claims_ignored: true,
  }),
});
