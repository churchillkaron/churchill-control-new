import assert from "node:assert/strict";
import {
  evaluateRecommendationRefinementCapabilityForActor,
  filterRecommendationRefinementCapabilitiesForActor,
} from "../lib/operator/runtime/OperatorRecommendationRefinementCapabilityPolicy.js";

const capability = {
  key: "finance.customer_invoice.write",
  mode: "write",
  operator_enabled: true,
  requires_confirmation: true,
  permissions: ["finance.receivables.manage"],
  context_scope: "organization",
};

const allowed = evaluateRecommendationRefinementCapabilityForActor({
  capability,
  permissions: ["finance.receivables.manage"],
  role: "MEMBER",
  context: { organizationId: "org-1" },
});
assert.equal(allowed.allowed, true);
assert.equal(allowed.reason, null);
assert.equal(allowed.current_actor_revalidated, true);
assert.equal(allowed.authorization_effect, "NONE");
assert.equal(allowed.execution_authorized, false);
assert.equal(allowed.recommendation_binding_created, false);
assert.equal(allowed.pending_execution_created, false);
assert.equal(allowed.autonomous_run_created, false);

const wildcard = evaluateRecommendationRefinementCapabilityForActor({
  capability,
  permissions: ["finance.*"],
  role: "MEMBER",
  context: {},
});
assert.equal(wildcard.allowed, true);

const revoked = evaluateRecommendationRefinementCapabilityForActor({
  capability,
  permissions: ["finance.reporting.read"],
  role: "MEMBER",
  context: {},
});
assert.equal(revoked.allowed, false);
assert.equal(revoked.reason, "CURRENT_ACTOR_PERMISSION_DENIED");
assert.equal(revoked.current_actor_revalidated, false);
assert.equal(revoked.execution_authorized, false);

const fullAccess = evaluateRecommendationRefinementCapabilityForActor({
  capability,
  permissions: [],
  role: "OWNER",
  context: {},
});
assert.equal(fullAccess.allowed, true);
assert.equal(fullAccess.full_access_role, true);

const entityScoped = evaluateRecommendationRefinementCapabilityForActor({
  capability: { ...capability, context_scope: "entity" },
  permissions: ["finance.receivables.manage"],
  role: "MEMBER",
  context: {},
});
assert.equal(entityScoped.allowed, false);
assert.equal(entityScoped.reason, "ENTITY_CONTEXT_REQUIRED");

const entityAllowed = evaluateRecommendationRefinementCapabilityForActor({
  capability: { ...capability, context_scope: "entity" },
  permissions: ["finance.receivables.manage"],
  role: "MEMBER",
  context: { entityId: "entity-1" },
});
assert.equal(entityAllowed.allowed, true);

const disabled = evaluateRecommendationRefinementCapabilityForActor({
  capability: { ...capability, operator_enabled: false },
  permissions: ["finance.receivables.manage"],
  role: "MEMBER",
  context: {},
});
assert.equal(disabled.allowed, false);
assert.equal(disabled.reason, "CAPABILITY_OPERATOR_DISABLED");

const read = evaluateRecommendationRefinementCapabilityForActor({
  capability: { ...capability, mode: "read" },
  permissions: ["finance.receivables.manage"],
  role: "MEMBER",
  context: {},
});
assert.equal(read.allowed, false);
assert.equal(read.reason, "CAPABILITY_NOT_MUTATING_ACTION");

const noPermissionContract = evaluateRecommendationRefinementCapabilityForActor({
  capability: { ...capability, permissions: [] },
  permissions: [],
  role: "MEMBER",
  context: {},
});
assert.equal(noPermissionContract.allowed, false);
assert.equal(noPermissionContract.reason, "MUTATING_CAPABILITY_PERMISSION_CONTRACT_MISSING");

const unguided = evaluateRecommendationRefinementCapabilityForActor({
  capability: {
    ...capability,
    auto_execute: false,
    requires_confirmation: false,
  },
  permissions: ["finance.receivables.manage"],
  role: "MEMBER",
  context: {},
});
assert.equal(unguided.allowed, false);
assert.equal(unguided.reason, "CAPABILITY_NOT_GOVERNED_FOR_OPERATOR_ACTION");

const filtered = filterRecommendationRefinementCapabilitiesForActor({
  capabilities: [
    capability,
    { ...capability, key: "finance.denied.write", permissions: ["finance.admin"] },
    { ...capability, key: "finance.disabled.write", operator_enabled: false },
  ],
  permissions: ["finance.receivables.manage"],
  role: "MEMBER",
  context: {},
});
assert.deepEqual(filtered.map((item) => item.key), [capability.key]);

console.log("OPERATOR_RECOMMENDATION_REFINEMENT_CAPABILITY_POLICY_AUDIT=PASS");
console.log("OPERATOR_RECOMMENDATION_REFINEMENT_CAPABILITY_POLICY_PERMISSIONS=CURRENT_REVALIDATED");
console.log("OPERATOR_RECOMMENDATION_REFINEMENT_CAPABILITY_POLICY_ROLE=FULL_ACCESS_EXPLICIT_ONLY");
console.log("OPERATOR_RECOMMENDATION_REFINEMENT_CAPABILITY_POLICY_ENTITY_CONTEXT=REQUIRED_WHEN_SCOPED");
console.log("OPERATOR_RECOMMENDATION_REFINEMENT_CAPABILITY_POLICY_DISABLED=REJECTED");
console.log("OPERATOR_RECOMMENDATION_REFINEMENT_CAPABILITY_POLICY_GOVERNANCE=CONFIRM_OR_AUTO_REQUIRED");
console.log("OPERATOR_RECOMMENDATION_REFINEMENT_CAPABILITY_POLICY_AUTHORIZATION=NONE");
console.log("OPERATOR_RECOMMENDATION_REFINEMENT_CAPABILITY_POLICY_EXECUTION=NONE");
