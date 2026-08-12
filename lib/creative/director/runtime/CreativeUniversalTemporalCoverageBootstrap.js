const CONTRACT = "CREATIVE_CANONICAL_MASTER_PLAN_AUTHORITY_V1";

export const CreativeUniversalTemporalCoverageBootstrap = Object.freeze({
  installed: false,
  retired: true,
  contract: CONTRACT,
  authority: "CREATIVE_MASTER_PLAN_RUNTIME",
  specialist_role: "POST_PLAN_REVIEW_ONLY",
  legacy_override_allowed: false,
  reason:
    "Temporal specialist intelligence may review or refine an already-authoritative Creative Master Plan, but may never replace CreativeMasterPlanRuntime.create or choose a fallback workflow.",
});
