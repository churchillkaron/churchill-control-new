import {
  AvantiqoStructuredIntelligenceSupervisorRuntime,
} from "@/lib/intelligence/runtime/AvantiqoStructuredIntelligenceSupervisorRuntime";
import {
  AVANTIQO_PRODUCT_CONSTITUTION,
} from "@/lib/intelligence/runtime/AvantiqoProductConstitution";
import {
  operatorRegistryCreateCoverage,
} from "@/lib/platform/registry/OperatorRegistryDomainRuntimes";
import {
  operatorRegistryCreateCoverageSummary,
} from "@/lib/platform/registry/OperatorRegistryCreateCoverage";

export const AVANTIQO_PRODUCT_AUTONOMY_ASSESSMENT_CONTRACT =
  "AVANTIQO_PRODUCT_AUTONOMY_ASSESSMENT_V1";

const CODE_AI_EXECUTION_KEY_HINT =
  "Use one opaque 12-160 character execution_key across Code AI execution, engineering verification, persistence decision, confirmation-ready persistence handoff, governed commit, commit verification and bounded post-commit continuation. The key has no authorization effect.";
const REQUIRED_AUTONOMY_KEYS = [
  "platform.organizational_context.read",
  "platform.attention.scan",
  "platform.research.search",
  "platform.research_source.read",
  "platform.research_compare.analyze",
  "platform.operator_mission.execute",
  "platform.code_ai_autonomous.execute",
  "platform.code_ai_autonomous_status.verify",
  "platform.product_persistence_decision.assess",
  "platform.product_persistence_handoff.execute",
  "platform.code_ai_commit.execute",
  "platform.code_ai_commit_status.verify",
  "platform.product_autonomy_continuation.assess",
];

function text(value, limit = 12000) {
  return String(value ?? "").trim().slice(0, limit);
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function capabilitySnapshot(capabilities) {
  const byDomain = {};
  const byMode = {};
  for (const capability of capabilities) {
    byDomain[capability.domain] = (byDomain[capability.domain] || 0) + 1;
    byMode[capability.mode] = (byMode[capability.mode] || 0) + 1;
  }
  const keys = new Set(capabilities.map((capability) => capability.key));
  return {
    total: capabilities.length,
    by_domain: byDomain,
    by_mode: byMode,
    required_autonomy_capabilities: REQUIRED_AUTONOMY_KEYS.map((key) => ({
      key,
      available: keys.has(key),
    })),
  };
}

function unavailableCreates(coverage) {
  return coverage
    .filter((item) => item.classification === "unavailable")
    .map((item) => ({
      domain: item.domain,
      workspace_id: item.workspace_id,
      label: item.label,
    }));
}

function assessmentSystem() {
  return [
    "You are Avantiqo's owned Product Owner and Architecture Intelligence.",
    "Assess the supplied live capability/registry snapshot against the permanent Product Constitution.",
    "This is an assessment, not certification. The runtime snapshot cannot prove source quality, build success, database migrations, provider health, end-to-end behavior, GitHub persistence or production deployment unless those are explicitly present as verified evidence.",
    "Do not mark Avantiqo finished merely because capabilities exist in the catalog.",
    "Prioritize gaps that prevent the platform from understanding, deciding, executing, verifying, researching, repairing or continuing autonomously.",
    "Separate deterministic observed gaps from engineering areas that Code AI must inspect in the repository.",
    "Generate one bounded engineering_objective suitable for Avantiqo Code AI. It must tell Code AI to inspect current main, preserve the constitution, verify locally, repair failures, and stop only when the objective's evidence-based completion criteria are met.",
    "The Code AI handoff is not complete merely because platform.code_ai_autonomous.execute returns. A durable Operator mission must give that action an opaque execution_key and use platform.code_ai_autonomous_status.verify with the exact same key as verify_after.",
    "After engineering verification, platform.product_persistence_decision.assess decides whether the verified result should remain local or request separately governed commit confirmation. That read has no authorization effect.",
    "When Product Intelligence recommends persistence, route through platform.product_persistence_handoff.execute rather than treating the raw commit capability as the Product Owner handoff. The persistence handoff rechecks verified evidence and may automatically prepare a durable mission, but the nested platform.code_ai_commit.execute step must still pause for its own explicit confirmation and commit permission before any source persistence occurs.",
    "Engineering verification and GitHub persistence are distinct. platform.code_ai_commit_status.verify must independently verify the persisted main-branch result before continuation.",
    "After a verified main commit, platform.product_autonomy_continuation.assess may perform exactly one fresh Product Intelligence reassessment and prepare one next bounded engineering objective. It must never recurse automatically, commit automatically, deploy production or apply migrations.",
    "Do not authorize commits, production deployments, destructive database operations or governance bypasses. You may describe separately governed handoffs without granting them.",
    "Return exactly one JSON object with keys: status, executive_summary, observed_gaps, inspection_required, priorities, engineering_objective, completion_criteria, evidence_limits.",
  ].join("\n");
}

export async function assessAvantiqoProductAutonomy({
  context = {},
  payload = {},
} = {}) {
  const organizationId = text(context.organizationId || context.organization_id, 160);
  if (!organizationId) {
    throw new Error("PRODUCT_AUTONOMY_ASSESSMENT_ORGANIZATION_REQUIRED");
  }

  const { listOperatorCapabilities } = await import(
    "@/lib/operator/runtime/OperatorCapabilityCatalog"
  );
  const capabilities = await listOperatorCapabilities();
  const coverage = operatorRegistryCreateCoverage();
  const snapshot = {
    generated_at: new Date().toISOString(),
    capability_catalog: capabilitySnapshot(capabilities),
    registry_create_coverage: operatorRegistryCreateCoverageSummary(coverage),
    unavailable_registry_creates: unavailableCreates(coverage).slice(0, 100),
    requested_focus: text(payload.focus, 2000) || null,
  };

  const result = await AvantiqoStructuredIntelligenceSupervisorRuntime.run({
    organization_id: organizationId,
    party_id: text(context?.metadata?.partyId || context.partyId, 160) || null,
    entity_id: text(context.entityId || context.entity_id, 160) || null,
    system: assessmentSystem(),
    messages: [{
      role: "user",
      content: JSON.stringify({
        contract: AVANTIQO_PRODUCT_AUTONOMY_ASSESSMENT_CONTRACT,
        constitution: AVANTIQO_PRODUCT_CONSTITUTION,
        snapshot,
      }),
    }],
    tools: [],
    authorization: { allow_mutating_tools: false },
    metadata: {
      module: "INTELLIGENCE",
      operation: "PRODUCT_AUTONOMY_ASSESSMENT",
      product_autonomy_contract: AVANTIQO_PRODUCT_AUTONOMY_ASSESSMENT_CONTRACT,
      assessment_only: true,
      raw_reasoning_persisted: false,
    },
    mode: "deep",
    critique_instructions: [
      "Remove any completion claim not supported by the supplied snapshot.",
      "Check that the engineering objective is bounded, architecture-preserving and locally verifiable.",
      "Keep missing runtime evidence explicitly missing rather than guessing.",
      "If recommending the Code AI handoff, preserve the requirement for a shared execution_key plus platform.code_ai_autonomous_status.verify; never replace it with trust in the write response.",
      "Keep GitHub persistence separate from engineering completion. Never imply that the persistence decision or persistence handoff grants commit authority. The handoff may only prepare a mission whose nested commit step retains its own permission, explicit confirmation and registered post-write verifier.",
      "After verified persistence, continuation may prepare exactly one next bounded cycle from a fresh assessment. Reject automatic recursion, automatic commit, deployment or migration execution.",
    ].join(" "),
    max_output_tokens: 2000,
  });

  return {
    contract: AVANTIQO_PRODUCT_AUTONOMY_ASSESSMENT_CONTRACT,
    status: "ASSESSMENT_ONLY_NOT_CERTIFICATION",
    constitution_contract: AVANTIQO_PRODUCT_CONSTITUTION.contract,
    snapshot,
    assessment: object(result.parsed),
    recommended_code_ai_handoff: {
      capability_key: "platform.code_ai_autonomous.execute",
      objective: text(result.parsed?.engineering_objective, 4000) || null,
      verification_capability_key: "platform.code_ai_autonomous_status.verify",
      persistence_decision_capability_key: "platform.product_persistence_decision.assess",
      persistence_handoff_capability_key: "platform.product_persistence_handoff.execute",
      execution_key_contract: CODE_AI_EXECUTION_KEY_HINT,
      durable_operator_mission_required: true,
      authorization_effect: "NONE",
      execution_started: false,
    },
    optional_persistence_handoff: {
      decision_capability_key: "platform.product_persistence_decision.assess",
      capability_key: "platform.product_persistence_handoff.execute",
      nested_commit_capability_key: "platform.code_ai_commit.execute",
      verification_capability_key: "platform.code_ai_commit_status.verify",
      continuation_capability_key: "platform.product_autonomy_continuation.assess",
      execution_key_contract: CODE_AI_EXECUTION_KEY_HINT,
      separate_commit_permission_required: true,
      explicit_confirmation_required: true,
      exact_base_commit_required: true,
      bounded_post_commit_reassessment_count: 1,
      automatic_recursion_allowed: false,
      authorization_effect: "NONE",
      execution_started: false,
    },
    evidence_limits: [
      "Capability presence is not build evidence.",
      "Capability presence is not end-to-end evidence.",
      "A Code AI write response is not sufficient handoff verification; use the registered engineering status verifier.",
      "A Product Intelligence persistence recommendation or persistence handoff is not commit authorization.",
      "Engineering verification is not GitHub persistence evidence; persistence still requires the separately permissioned and explicitly confirmed nested commit plus registered commit status verifier.",
      "Post-commit continuation is one fresh assessment, not permission for an unbounded self-modification loop.",
      "This assessment does not prove provider availability or economics certification.",
      "This assessment does not prove production deployment or production certification.",
    ],
  };
}

export default assessAvantiqoProductAutonomy;
