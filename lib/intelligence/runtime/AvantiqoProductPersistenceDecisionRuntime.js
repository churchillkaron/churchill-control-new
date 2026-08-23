import {
  AvantiqoStructuredIntelligenceSupervisorRuntime,
} from "@/lib/intelligence/runtime/AvantiqoStructuredIntelligenceSupervisorRuntime";
import {
  AVANTIQO_PRODUCT_CONSTITUTION,
} from "@/lib/intelligence/runtime/AvantiqoProductConstitution";
import {
  loadCodeAIAutonomousExecutionState,
  verifyCompletedCodeAIAutonomousExecution,
} from "@/lib/code/runtime/CodeAIAutonomousExecutionStateRuntime";
import {
  loadCodeAICommitExecutionState,
} from "@/lib/code/runtime/CodeAICommitExecutionStateRuntime";

export const AVANTIQO_PRODUCT_PERSISTENCE_DECISION_CONTRACT =
  "AVANTIQO_PRODUCT_PERSISTENCE_DECISION_V1";

const DEPLOY_MARKER = "[deploy-production-final]";
const DECISIONS = new Set([
  "STAY_LOCAL",
  "REQUEST_COMMIT_CONFIRMATION",
  "ALREADY_PERSISTED",
]);

function text(value, limit = 4000) {
  return String(value ?? "").trim().slice(0, limit);
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

function confidence(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  return Math.max(0, Math.min(1, number));
}

function safeCommitMessage(value, fallback) {
  const source = text(value, 200)
    .replaceAll(DEPLOY_MARKER, "")
    .replace(/\s+/g, " ")
    .trim();
  if (source) return source.slice(0, 200);
  return text(fallback, 200) || "Persist verified Avantiqo engineering changes";
}

function fallbackCommitMessage(state) {
  const objective = text(state.objective, 120);
  if (!objective) return "Persist verified Avantiqo engineering changes";
  return `Implement verified Avantiqo objective: ${objective}`.slice(0, 200);
}

function deterministicDecision(state) {
  if (Number(state.source_change_count || 0) <= 0) {
    return {
      decision: "STAY_LOCAL",
      rationale:
        "The verified engineering run produced no persistent source changes, so there is nothing to commit.",
      reason_code: "NO_SOURCE_CHANGES",
    };
  }
  if (text(state.ref, 160) !== "main") {
    return {
      decision: "STAY_LOCAL",
      rationale:
        "The verified engineering run is not based on main. Product persistence remains main-only and requires a fresh main-based engineering cycle.",
      reason_code: "NON_MAIN_REF",
    };
  }
  if (state.patch_present !== true) {
    return {
      decision: "STAY_LOCAL",
      rationale:
        "The verified execution record reports source changes but no persistable patch artifact. Persistence must fail closed until a complete artifact exists.",
      reason_code: "PERSISTABLE_PATCH_MISSING",
    };
  }
  if (Number(state.blocker_count || 0) > 0) {
    return {
      decision: "STAY_LOCAL",
      rationale:
        "The engineering evidence still contains blockers. Verified local evidence must be repaired before persistence is proposed.",
      reason_code: "BLOCKERS_REMAIN",
    };
  }
  return null;
}

function decisionSystem() {
  return [
    "You are Avantiqo's owned Product Owner deciding whether a completed, independently verified local Code AI engineering result should remain local or be proposed for separately governed persistence to GitHub main.",
    "The supplied engineering evidence is server-owned and already passed the registered engineering verifier. Treat it as evidence, not as authorization.",
    "Choose REQUEST_COMMIT_CONFIRMATION only when the verified source changes represent a durable, bounded, completed product improvement that should become part of current main.",
    "Choose STAY_LOCAL when the work is exploratory, temporary, benchmark-only, incomplete in product meaning, intentionally local, or otherwise should not become durable source yet.",
    "A persistence recommendation never authorizes or performs a commit. platform.code_ai_commit.execute remains a separate permissioned write with explicit confirmation and post-write verification.",
    "Never recommend production deployment, database migration execution, publication, force push, secret persistence, or governance bypass.",
    `Never place the privileged production marker ${DEPLOY_MARKER} in a commit message.`,
    "If persistence is recommended, produce a concise commit_message describing only the verified engineering change and say whether Avantiqo should run exactly one fresh Product Intelligence assessment against the newly verified main afterward.",
    "Return exactly one JSON object with keys: decision, rationale, confidence, commit_message, continue_after_verified_commit, evidence_limits.",
  ].join("\n");
}

function evidenceSnapshot(state) {
  return {
    contract: state.contract,
    result_status: state.result_status,
    state_status: state.state_status,
    objective: text(state.objective, 4000) || null,
    summary: text(state.summary, 2000) || null,
    repository_url: text(state.repository_url, 500) || null,
    ref: text(state.ref, 160) || null,
    base_commit: text(state.base_commit, 160) || null,
    files_changed: list(state.files_changed).slice(0, 100),
    source_change_count: Number(state.source_change_count || 0),
    patch_present: state.patch_present === true,
    verification_passed: state.verification_passed === true,
    failure_count: Number(state.failure_count || 0),
    blocker_count: Number(state.blocker_count || 0),
    attestation_verified: state.attestation_verified === true,
  };
}

function resultEnvelope({ executionKey, state, decision, alreadyPersisted = false }) {
  const normalizedDecision = DECISIONS.has(decision.decision)
    ? decision.decision
    : "STAY_LOCAL";
  const requestCommit = normalizedDecision === "REQUEST_COMMIT_CONFIRMATION";
  const persisted = normalizedDecision === "ALREADY_PERSISTED" || alreadyPersisted;
  const shouldContinue = persisted
    ? true
    : requestCommit && decision.continue_after_verified_commit !== false;

  return {
    contract: AVANTIQO_PRODUCT_PERSISTENCE_DECISION_CONTRACT,
    status: "PERSISTENCE_DECISION_COMPLETE",
    execution_key: executionKey,
    decision: normalizedDecision,
    rationale: text(decision.rationale, 3000) || null,
    reason_code: text(decision.reason_code, 120) || null,
    confidence: confidence(decision.confidence),
    engineering_evidence: evidenceSnapshot(state),
    persistence: {
      commit_recommended: requestCommit,
      commit_message: requestCommit
        ? safeCommitMessage(decision.commit_message, fallbackCommitMessage(state))
        : null,
      confirmation_required: requestCommit,
      separate_commit_permission_required: requestCommit,
      verification_capability_key: requestCommit
        ? "platform.code_ai_commit_status.verify"
        : null,
      authorization_effect: "NONE",
      commit_executed: false,
      already_persisted: persisted,
    },
    continuation: {
      after_verified_commit: shouldContinue,
      strategy: shouldContinue ? "REASSESS_CURRENT_MAIN" : "STOP_AFTER_CURRENT_CYCLE",
      bounded_next_cycle_count: shouldContinue ? 1 : 0,
      production_deployment_allowed: false,
      database_migration_execution_allowed: false,
    },
    evidence_limits: list(decision.evidence_limits)
      .map((item) => text(item, 500))
      .filter(Boolean)
      .slice(0, 12),
  };
}

export async function decideAvantiqoProductPersistence({
  context = {},
  executionKey,
} = {}) {
  const organizationId = text(context.organizationId || context.organization_id, 160);
  if (!organizationId) {
    throw new Error("PRODUCT_PERSISTENCE_DECISION_ORGANIZATION_REQUIRED");
  }
  const key = text(executionKey, 160);
  if (!key) throw new Error("PRODUCT_PERSISTENCE_DECISION_EXECUTION_KEY_REQUIRED");

  const loaded = await loadCodeAIAutonomousExecutionState({
    context,
    executionKey: key,
  });
  if (!loaded.found || !loaded.execution_state) {
    throw new Error("PRODUCT_PERSISTENCE_DECISION_ENGINEERING_STATE_NOT_FOUND");
  }
  const state = object(loaded.execution_state);
  verifyCompletedCodeAIAutonomousExecution(state);

  const existingCommit = await loadCodeAICommitExecutionState({
    context,
    executionKey: key,
  });
  if (existingCommit.found && existingCommit.commit?.verified === true) {
    return resultEnvelope({
      executionKey: key,
      state,
      alreadyPersisted: true,
      decision: {
        decision: "ALREADY_PERSISTED",
        rationale:
          "The same opaque execution key already has verified GitHub main persistence evidence. A duplicate commit must not be proposed.",
        reason_code: "VERIFIED_COMMIT_ALREADY_EXISTS",
        confidence: 1,
        continue_after_verified_commit: true,
        evidence_limits: [
          "Verified persistence does not prove production deployment.",
          "The next product objective must be selected from a fresh assessment of current main.",
        ],
      },
    });
  }

  const deterministic = deterministicDecision(state);
  if (deterministic) {
    return resultEnvelope({
      executionKey: key,
      state,
      decision: {
        ...deterministic,
        confidence: 1,
        commit_message: null,
        continue_after_verified_commit: false,
        evidence_limits: [
          "No commit has been authorized or executed.",
          "This decision does not prove production deployment or production certification.",
        ],
      },
    });
  }

  const evidence = evidenceSnapshot(state);
  const intelligence = await AvantiqoStructuredIntelligenceSupervisorRuntime.run({
    organization_id: organizationId,
    party_id: text(context?.metadata?.partyId || context.partyId, 160) || null,
    entity_id: text(context.entityId || context.entity_id, 160) || null,
    system: decisionSystem(),
    messages: [{
      role: "user",
      content: JSON.stringify({
        contract: AVANTIQO_PRODUCT_PERSISTENCE_DECISION_CONTRACT,
        constitution: AVANTIQO_PRODUCT_CONSTITUTION,
        engineering_evidence: evidence,
      }),
    }],
    tools: [],
    authorization: { allow_mutating_tools: false },
    metadata: {
      module: "INTELLIGENCE",
      operation: "PRODUCT_PERSISTENCE_DECISION",
      product_persistence_decision_contract:
        AVANTIQO_PRODUCT_PERSISTENCE_DECISION_CONTRACT,
      decision_only: true,
      authorization_effect: "NONE",
      raw_reasoning_persisted: false,
    },
    mode: "deep",
    critique_instructions: [
      "Reject any persistence recommendation that is not supported by the supplied verified engineering evidence.",
      "Keep persistence separate from authorization: this decision may request confirmation but may not grant permission or execute a commit.",
      "Prefer STAY_LOCAL when product durability or completion is uncertain.",
      `Remove ${DEPLOY_MARKER} and any production-deployment implication from the commit message.`,
      "If continuing after a future verified commit, allow only one fresh reassessment cycle; do not create an unbounded self-modification loop.",
    ].join(" "),
    max_output_tokens: 1200,
  });

  const parsed = object(intelligence.parsed);
  const normalized = {
    decision: DECISIONS.has(text(parsed.decision, 80))
      ? text(parsed.decision, 80)
      : "STAY_LOCAL",
    rationale: text(parsed.rationale, 3000) ||
      "Product Intelligence did not produce a valid persistence rationale; persistence fails closed.",
    reason_code: "OWNED_PRODUCT_INTELLIGENCE_DECISION",
    confidence: confidence(parsed.confidence),
    commit_message: parsed.commit_message,
    continue_after_verified_commit: parsed.continue_after_verified_commit === true,
    evidence_limits: list(parsed.evidence_limits),
  };

  if (normalized.decision === "ALREADY_PERSISTED") {
    normalized.decision = "STAY_LOCAL";
    normalized.rationale =
      "Product Intelligence cannot declare persistence without server-owned commit evidence; the unsupported persistence claim was rejected.";
    normalized.reason_code = "UNSUPPORTED_ALREADY_PERSISTED_CLAIM_REJECTED";
    normalized.commit_message = null;
    normalized.continue_after_verified_commit = false;
  }

  return resultEnvelope({
    executionKey: key,
    state,
    decision: normalized,
  });
}

export default decideAvantiqoProductPersistence;
