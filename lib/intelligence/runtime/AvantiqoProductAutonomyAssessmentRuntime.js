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
  "Use one opaque 12-160 character execution_key across Code AI execution, engineering verification, persistence decision, read-authority persistence handoff, separately governed commit when needed, commit verification and bounded post-commit continuation. The key has no authorization effect.";
const REQUIRED_AUTONOMY_KEYS = [
  "platform.organizational_context.read",
  "platform.attention.scan",
  "platform.research.search",
  "platform.research_source.read",
  "platform.research_compare.analyze",
  "platform.operator_mission.execute",
  "platform.product_repository_assessment.read",
  "platform.product_engineering_cycle.execute",
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
    "A live-process Product autonomy assessment is planning context, not current repository authority. Before a Product Engineering Cycle starts source work, platform.product_engineering_cycle.execute must call platform.product_repository_assessment.read against actual current GitHub main and let that fresh repository evidence select or refine the exact objective bound into Code AI.",
    "A previously surfaced post-commit objective is also context, not immutable authority. When the user says next, continue or do it, the new Product Engineering Cycle must re-open actual current main first, preserve any newer concurrent commits, and only then bind the fresh repository-grounded objective into Code AI.",
    "The Code AI handoff is not complete merely because platform.code_ai_autonomous.execute returns. A durable Operator mission must give that action an opaque execution_key and use platform.code_ai_autonomous_status.verify with the exact same key as verify_after.",
    "After engineering verification, platform.product_persistence_decision.assess decides whether the verified result should remain local, is already persisted, or should request separately governed commit confirmation. That read has no authorization effect.",
    "Route persistence handling through platform.product_persistence_handoff.execute. The handoff itself requires Code AI execute authority so STAY_LOCAL and ALREADY_PERSISTED can remain read-only outcomes. It must never grant commit authority.",
    "If Product Intelligence returns REQUEST_COMMIT_CONFIRMATION, the handoff may construct a durable mission containing platform.code_ai_commit.execute. That nested commit step independently requires platform.code.ai.commit and explicit confirmation before any source persistence occurs; mission preflight must fail before side effects when commit authority is absent.",
    "platform.code_ai_commit_status.verify is read-authority verification under platform.code.ai.execute. It may inspect compact server-owned persistence evidence, or perform the bounded attested recovery path after a recorded commit attempt, but it may never authorize or replay a commit.",
    "Engineering verification and GitHub persistence are distinct. A commit write is not trusted merely because the write action returned; registered commit verification remains required before continuation.",
    "If the same execution key is already persisted, do not propose or execute a second commit. The persistence handoff should independently reverify that persisted state, bind only registered verifier scalars into platform.product_autonomy_continuation.assess, and perform exactly one fresh repository-grounded reassessment.",
    "After verified persistence, platform.product_autonomy_continuation.assess must ground itself through platform.product_repository_assessment.read so the next objective comes from a fresh read-only checkout of actual current GitHub main, including its observed HEAD and any concurrent progress.",
    "An ALREADY_PERSISTED continuation may surface exactly one next bounded engineering handoff with automatic_execution_started=false. It must not automatically start platform.product_engineering_cycle.execute, create another commit, deploy, migrate, publish, or recurse.",
    "The repository assessment is source evidence only. It does not prove build, tests, end-to-end behavior, provider health, deployment or certification.",
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
      "Treat this process/catalog assessment as planning context only. Any Product Engineering Cycle must recheck actual current main through platform.product_repository_assessment.read before its engineering objective is bound into Code AI.",
      "If recommending the Code AI handoff, preserve the requirement for a shared execution_key plus platform.code_ai_autonomous_status.verify; never replace it with trust in the write response.",
      "Keep GitHub persistence separate from engineering completion. The persistence decision and handoff have no commit authorization effect. Only the nested platform.code_ai_commit.execute step may write, and it retains its own platform.code.ai.commit permission, explicit confirmation, exact-base protections and registered post-write verifier.",
      "Treat platform.code_ai_commit_status.verify as read-only evidence under platform.code.ai.execute, never as commit authority.",
      "If persistence is already verified for the same execution key, reject any second commit proposal. Reverify, reassess actual current main once, surface one next bounded objective and stop before engineering execution.",
      "After verified persistence, the next objective must be grounded by platform.product_repository_assessment.read against actual checked-out current main. Reject process-only claims of fresh main evidence, automatic recursion, automatic commit, deployment or migration execution.",
      "When that next objective is later accepted, require the new Product Engineering Cycle to recheck current main again before Code AI edits, because main may have advanced after the recommendation was surfaced.",
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
      repository_recheck_required_before_engineering: true,
      repository_recheck_capability_key: "platform.product_repository_assessment.read",
      durable_operator_mission_required: true,
      authorization_effect: "NONE",
      execution_started: false,
    },
    recommended_product_engineering_cycle_handoff: {
      capability_key: "platform.product_engineering_cycle.execute",
      repository_assessment_capability_key: "platform.product_repository_assessment.read",
      repository_ref: "main",
      focus: text(result.parsed?.engineering_objective, 4000) || null,
      focus_is_authority: false,
      current_main_recheck_before_engineering_required: true,
      automatic_execution_started: false,
      authorization_effect: "NONE",
    },
    optional_persistence_handoff: {
      decision_capability_key: "platform.product_persistence_decision.assess",
      capability_key: "platform.product_persistence_handoff.execute",
      handoff_permission: "platform.code.ai.execute",
      nested_commit_capability_key: "platform.code_ai_commit.execute",
      nested_commit_permission: "platform.code.ai.commit",
      verification_capability_key: "platform.code_ai_commit_status.verify",
      verification_permission: "platform.code.ai.execute",
      repository_reassessment_capability_key: "platform.product_repository_assessment.read",
      continuation_capability_key: "platform.product_autonomy_continuation.assess",
      execution_key_contract: CODE_AI_EXECUTION_KEY_HINT,
      separate_commit_permission_required_only_for_write_step: true,
      explicit_confirmation_required_for_commit: true,
      exact_base_commit_required: true,
      already_persisted_second_commit_allowed: false,
      already_persisted_reverification_required: true,
      repository_grounded_post_commit_reassessment_required: true,
      bounded_post_commit_reassessment_count: 1,
      next_engineering_cycle_started_automatically: false,
      next_engineering_cycle_rechecks_current_main: true,
      automatic_recursion_allowed: false,
      authorization_effect: "NONE",
      execution_started: false,
    },
    evidence_limits: [
      "Capability presence is not build evidence.",
      "Capability presence is not end-to-end evidence.",
      "A live process/catalog assessment is planning context, not current repository evidence for source engineering.",
      "A Product Engineering Cycle must recheck actual current main before binding its objective into Code AI, even when the user accepted a previously repository-grounded next objective.",
      "A Code AI write response is not sufficient handoff verification; use the registered engineering status verifier.",
      "A Product Intelligence persistence recommendation or persistence handoff is not commit authorization.",
      "Commit verification is read authority and does not grant commit permission.",
      "Engineering verification is not GitHub persistence evidence; persistence still requires the separately permissioned and explicitly confirmed nested commit when a write is actually needed.",
      "An already-persisted execution must be reverified and must not be committed a second time.",
      "Post-commit continuation must use a fresh repository assessment of actual GitHub main; a live process catalog alone is not fresh repository evidence.",
      "Repository checkout evidence is source evidence, not build, test, end-to-end, provider, deployment or certification evidence.",
      "Post-commit continuation surfaces one bounded next objective but does not automatically start its engineering cycle.",
      "Post-commit continuation is not permission for an unbounded self-modification loop.",
      "This assessment does not prove provider availability or economics certification.",
      "This assessment does not prove production deployment or production certification.",
    ],
  };
}

export default assessAvantiqoProductAutonomy;
