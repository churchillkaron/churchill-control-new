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
import {
  loadCodeAICommitArtifact,
} from "@/lib/code/runtime/CodeAICommitArtifactRuntime";
import {
  recoverVerifiedCodeMissionCommit,
} from "@/lib/code/runtime/CodeGitHubCommitRuntime";

export const AVANTIQO_PRODUCT_PERSISTENCE_DECISION_CONTRACT =
  "AVANTIQO_PRODUCT_PERSISTENCE_DECISION_V1";

const DEPLOY_MARKER = "[deploy-production-final]";
const RECOVERY_NOT_FOUND = "CODE_AI_GITHUB_RECOVERY_VERIFIED_COMMIT_NOT_FOUND";
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
    "When Product completion criteria are present, judge durability against the exact verified criteria and their bounded referenced-operation evidence. Do not replace the Product definition of done with a generic completed-status judgment.",
    "A criterion-to-operation mapping proves only that the registered Code runtime observed those operations and accepted the mapping. It does not independently prove production behavior, deployment, migration, provider quality, or facts outside the supplied operation projection.",
    "Choose REQUEST_COMMIT_CONFIRMATION only when the verified source changes represent a durable, bounded, completed product improvement that should become part of current main and the supplied completion-criteria evidence supports that conclusion.",
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
    product_completion_criteria_required:
      state.product_completion_criteria_required === true,
    product_completion_criteria: list(state.product_completion_criteria)
      .map((criterion) => text(criterion, 700))
      .filter(Boolean)
      .slice(0, 6),
    product_completion_criteria_count:
      Number(state.product_completion_criteria_count || 0),
    product_completion_criteria_evidence_count:
      Number(state.product_completion_criteria_evidence_count || 0),
    product_completion_criteria_verified:
      state.product_completion_criteria_verified === true,
    product_completion_criteria_evidence:
      list(state.product_completion_criteria_evidence)
        .slice(0, 6)
        .map((item) => ({
          criterion: text(item?.criterion, 700) || null,
          evidence_operation_ids: list(item?.evidence_operation_ids)
            .map((operationId) => text(operationId, 200))
            .filter(Boolean)
            .slice(0, 12),
        })),
    product_completion_criteria_referenced_operations:
      list(state.product_completion_criteria_referenced_operations)
        .slice(0, 24)
        .map((operation) => ({
          operation_id: text(operation?.operation_id, 200) || null,
          action: text(operation?.action, 80) || null,
          description: text(operation?.description, 1200) || null,
          status: text(operation?.status, 100) || null,
          verification_passed:
            typeof operation?.verification_passed === "boolean"
              ? operation.verification_passed
              : null,
          command: text(operation?.command, 200) || null,
          args: list(operation?.args)
            .map((arg) => text(arg, 200))
            .filter(Boolean)
            .slice(0, 20),
          exit_code: Number.isFinite(Number(operation?.exit_code))
            ? Number(operation.exit_code)
            : null,
          changed_files: list(operation?.changed_files)
            .map((filePath) => text(filePath, 500))
            .filter(Boolean)
            .slice(0, 20),
        })),
    product_completion_criteria_referenced_operation_count:
      Number(state.product_completion_criteria_referenced_operation_count || 0),
    product_completion_criteria_authorization_effect: "NONE",
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
      verification_source: text(decision.verification_source, 160) || null,
      verified_commit_sha: text(decision.verified_commit_sha, 160) || null,
      expected_base_commit: text(decision.expected_base_commit, 160) || null,
      current_main_head: text(decision.current_main_head, 160) || null,
      stale_base_replan_required: decision.stale_base_replan_required === true,
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

async function recoveredPersistenceEvidence({ context, executionKey }) {
  const artifact = await loadCodeAICommitArtifact({
    context,
    executionKey,
  });
  if (
    !artifact.found ||
    !artifact.mission_state ||
    artifact.commit_attempted !== true
  ) {
    return {
      recovered: null,
      stale_base: null,
    };
  }

  try {
    const recovered = await recoverVerifiedCodeMissionCommit({
      mission_state: artifact.mission_state,
    });
    return {
      recovered: recovered?.verified === true ? recovered : null,
      stale_base: null,
    };
  } catch (error) {
    if (text(error?.message, 240) !== RECOVERY_NOT_FOUND) throw error;
    const expectedBase =
      text(error?.expected_base_commit, 160) ||
      text(artifact.mission_state?.base_commit, 160) ||
      null;
    const currentMainHead = text(error?.current_main_head, 160) || null;
    const mainAdvanced =
      error?.main_advanced_from_expected_base === true ||
      Boolean(expectedBase && currentMainHead && expectedBase !== currentMainHead);
    return {
      recovered: null,
      stale_base: mainAdvanced
        ? {
            expected_base_commit: expectedBase,
            current_main_head: currentMainHead,
            recovery_history_limit: Number(error?.recovery_history_limit || 0) || null,
            commit_attempted: true,
          }
        : null,
    };
  }
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
        verification_source: "SERVER_OWNED_COMMIT_EXECUTION_STATE",
        verified_commit_sha: existingCommit.commit.commit_sha,
        continue_after_verified_commit: true,
        evidence_limits: [
          "Verified persistence does not prove production deployment.",
          "The next product objective must be selected from a fresh assessment of current main.",
        ],
      },
    });
  }

  const recovery = await recoveredPersistenceEvidence({
    context,
    executionKey: key,
  });
  const recoveredCommit = recovery.recovered;
  if (recoveredCommit?.verified === true) {
    return resultEnvelope({
      executionKey: key,
      state,
      alreadyPersisted: true,
      decision: {
        decision: "ALREADY_PERSISTED",
        rationale:
          "The normal server commit-state record is unavailable, but a server-owned commit-attempt marker exists and the retained attested Code AI artifact independently matches a verified GitHub main commit reachable from current main. The same source persistence must not be proposed again.",
        reason_code: "VERIFIED_COMMIT_RECOVERED_FROM_ATTESTED_ARTIFACT",
        confidence: 1,
        verification_source: "GITHUB_RECOVERY_FROM_ATTESTED_ARTIFACT",
        verified_commit_sha: recoveredCommit.commit_sha,
        expected_base_commit: recoveredCommit.previous_commit,
        current_main_head: recoveredCommit.current_main_head,
        continue_after_verified_commit: true,
        evidence_limits: [
          "Recovered GitHub persistence evidence prevents duplicate commit proposals but does not repair the missing server commit-state record.",
          "GitHub recovery is attempted only after a server-owned commit-attempt marker exists.",
          "Verified persistence does not prove production deployment.",
          "The next product objective must be selected from a fresh repository-grounded assessment of current main.",
        ],
      },
    });
  }

  if (recovery.stale_base) {
    return resultEnvelope({
      executionKey: key,
      state,
      decision: {
        decision: "STAY_LOCAL",
        rationale:
          "A prior commit attempt is recorded, exact recovery found no matching verified commit, and GitHub main has advanced beyond the attested engineering base. This artifact is stale for persistence and must not be retried against newer main. Start a fresh repository-grounded Product Engineering Cycle from current main and re-verify the objective there.",
        reason_code: "STALE_BASE_REPLAN_REQUIRED",
        confidence: 1,
        commit_message: null,
        continue_after_verified_commit: false,
        expected_base_commit: recovery.stale_base.expected_base_commit,
        current_main_head: recovery.stale_base.current_main_head,
        stale_base_replan_required: true,
        evidence_limits: [
          "The retained artifact remains historical verified engineering evidence only; it is not valid commit authority for the newer main head.",
          "No duplicate or rebased commit is attempted automatically.",
          "A fresh Product Engineering Cycle must re-open current main, preserve concurrent changes, and produce new verification evidence before persistence can be considered again.",
          "This decision does not prove production deployment or production certification.",
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
      completion_criteria_evidence_considered:
        evidence.product_completion_criteria_required === true,
      completion_criteria_authorization_effect: "NONE",
      authorization_effect: "NONE",
      raw_reasoning_persisted: false,
    },
    mode: "deep",
    critique_instructions: [
      "Reject any persistence recommendation that is not supported by the supplied verified engineering evidence.",
      "When Product completion criteria are present, require the persistence rationale to be consistent with the exact criteria and their referenced-operation evidence; generic completion status is not enough.",
      "Do not infer runtime or production behavior beyond the bounded operation projection supplied for each criterion.",
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
      "Product Intelligence cannot declare persistence without deterministic registered commit verification evidence; the unsupported persistence claim was rejected.";
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
