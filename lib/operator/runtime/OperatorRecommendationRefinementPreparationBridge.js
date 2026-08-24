import {
  planRecommendationRefinementMaterialization,
} from "./OperatorRecommendationRefinementMaterializationPlanner.js";
import {
  buildRecommendationRefinementClarification,
} from "./OperatorRecommendationRefinementClarification.js";
import {
  createRecommendationRefinementInputState,
} from "./OperatorRecommendationRefinementInputState.js";
import {
  resolveRecommendationRefinementCapability,
} from "./OperatorRecommendationRefinementCapabilityResolver.js";

function text(value, limit = 4000) {
  return String(value ?? "").trim().slice(0, limit);
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

export function prepareSelectedRefinementForGovernedBinding({
  proposal = null,
  capabilities = [],
  context = {},
  permissions = [],
  role = null,
} = {}) {
  const actorCapabilities = list(capabilities).filter((capability) =>
    capability?.operator_enabled !== false,
  );

  const resolution = resolveRecommendationRefinementCapability({
    proposal,
    capabilities: actorCapabilities,
  });

  const plan = planRecommendationRefinementMaterialization({
    proposal,
    capabilities: actorCapabilities,
  });

  const clarification = buildRecommendationRefinementClarification({
    plan,
  });

  const inputState = plan.requires_clarification && plan.capability
    ? createRecommendationRefinementInputState({
        proposal,
        plan,
      })
    : null;

  return {
    stage: plan.ready
      ? "READY_FOR_GOVERNED_BINDING"
      : clarification.reason === "CAPABILITY_NOT_STRONGLY_RESOLVED"
        ? "CAPABILITY_CLARIFICATION_REQUIRED"
        : "INPUT_CLARIFICATION_REQUIRED",
    capability: resolution.capability,
    plan,
    clarification,
    input_state: inputState,
    context: object(context),
    role: text(role, 120) || null,
    permission_count: list(permissions).length,
    authorization_effect: "NONE",
    execution_authorized: false,
    pending_execution_created: false,
    autonomous_run_created: false,
    old_payload_reused: false,
  };
}

export default prepareSelectedRefinementForGovernedBinding;
