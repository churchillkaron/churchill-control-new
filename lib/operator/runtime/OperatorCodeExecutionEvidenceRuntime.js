import {
  operatorCodePersistenceHistoryFromExecution,
} from "../contracts/OperatorCodePersistenceHistory.js";

const CODE_EVIDENCE_CONTRACT =
  "AVANTIQO_OPERATOR_CODE_EXECUTION_EVIDENCE_V1";
const AUTONOMOUS_STATE_CONTRACT =
  "AVANTIQO_CODE_AI_AUTONOMOUS_EXECUTION_STATE_V1";
const COMMIT_STATE_CONTRACT =
  "AVANTIQO_CODE_AI_COMMIT_EXECUTION_STATE_V1";
const OPERATOR_MISSION_CAPABILITY_KEY = "platform.operator_mission.execute";
const CODE_COMMIT_CAPABILITY_KEY = "platform.code_ai_commit.execute";
const CODE_COMMIT_VERIFY_CAPABILITY_KEY =
  "platform.code_ai_commit_status.verify";
const CODE_EVIDENCE_PARENT_CAPABILITIES = new Set([
  "platform.product_engineering_cycle.execute",
  OPERATOR_MISSION_CAPABILITY_KEY,
  "platform.code_ai_autonomous.execute",
  CODE_COMMIT_CAPABILITY_KEY,
  "platform.product_persistence_handoff.execute",
]);

function text(value, limit = 500) {
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

function capabilityEnvelopeResult(value) {
  let current = object(value);
  for (let depth = 0; depth < 4; depth += 1) {
    const nested = object(current.result);
    const looksLikeUbteEnvelope = Boolean(
      Object.keys(nested).length &&
        (current.success === true ||
          text(current.domain, 160) ||
          text(current.capability, 160) ||
          text(current.action, 160)),
    );
    if (!looksLikeUbteEnvelope) break;
    current = nested;
  }
  return current;
}

function boundedStrings(value, limit = 20) {
  if (Array.isArray(value)) {
    return value.map((item) => text(item)).filter(Boolean).slice(0, limit);
  }
  const sample = Array.isArray(value?.sample) ? value.sample : [];
  return sample.map((item) => text(item)).filter(Boolean).slice(0, limit);
}

function walk(value, visitor, depth = 0, seen = new Set()) {
  if (value === null || value === undefined || depth > 10) return null;
  if (typeof value !== "object") return null;
  if (seen.has(value)) return null;
  seen.add(value);

  const found = visitor(value);
  if (found) return found;

  if (Array.isArray(value)) {
    for (const item of value.slice(0, 100)) {
      const nested = walk(item, visitor, depth + 1, seen);
      if (nested) return nested;
    }
    return null;
  }

  for (const candidate of Object.values(value).slice(0, 100)) {
    const nested = walk(candidate, visitor, depth + 1, seen);
    if (nested) return nested;
  }
  return null;
}

function autonomousReceipt(candidate) {
  const source = capabilityEnvelopeResult(candidate);
  if (
    text(source.status, 100) !== "VERIFIED_COMPLETED" ||
    source.verified !== true ||
    !text(source.execution_key, 160)
  ) {
    return null;
  }

  const state = object(source.execution_state);
  if (
    state.contract !== AUTONOMOUS_STATE_CONTRACT ||
    state.attestation_verified !== true ||
    state.result_success !== true ||
    text(state.result_status, 100) !== "completed" ||
    text(state.state_status, 100) !== "completed"
  ) {
    return null;
  }

  const sourceChangeCount = Number(state.source_change_count || 0);
  const criteriaCount = Number(state.product_completion_criteria_count || 0);
  const failureCount = Number(state.failure_count || 0);
  if (sourceChangeCount > 0 && state.verification_passed !== true) return null;
  if (criteriaCount > 0 && state.product_completion_criteria_verified !== true) {
    return null;
  }
  if (failureCount > 0 && state.verification_passed !== true) return null;

  return {
    contract: CODE_EVIDENCE_CONTRACT,
    kind: "autonomous_execution",
    method: "code_autonomous_server_state_readback",
    execution_key: text(source.execution_key, 160),
    verification_status: "VERIFIED_COMPLETED",
    server_state_contract: AUTONOMOUS_STATE_CONTRACT,
    attestation_verified: true,
    mission_id: text(state.mission_id, 200) || null,
    objective: text(state.objective, 1200) || null,
    repository_url: text(state.repository_url, 500) || null,
    ref: text(state.ref, 160) || null,
    base_commit: text(state.base_commit, 160) || null,
    files_changed: boundedStrings(state.files_changed),
    source_change_count: sourceChangeCount,
    verification_passed: state.verification_passed === true,
    product_completion_criteria_count: criteriaCount,
    product_completion_criteria_verified:
      criteriaCount > 0 ? state.product_completion_criteria_verified === true : null,
    failure_count: failureCount,
    business_effect_verified: true,
    authorization_effect: "NONE",
  };
}

function commitReceipt(candidate) {
  const source = capabilityEnvelopeResult(candidate);
  if (
    text(source.status, 100) !== "VERIFIED_COMMITTED" ||
    source.verified !== true ||
    !text(source.execution_key, 160)
  ) {
    return null;
  }
  const commit = object(source.commit);
  const contract = text(commit.contract, 180);
  if (
    commit.success !== true ||
    commit.verified !== true ||
    text(commit.branch, 80) !== "main" ||
    !text(commit.commit_sha, 160) ||
    (contract && contract !== COMMIT_STATE_CONTRACT)
  ) {
    return null;
  }
  const verificationSource = text(source.verification_source, 180);
  if (
    ![
      "SERVER_OWNED_COMMIT_EXECUTION_STATE",
      "GITHUB_RECOVERY_FROM_ATTESTED_ARTIFACT",
    ].includes(verificationSource)
  ) {
    return null;
  }

  const repository = text(commit.repository, 500) || null;
  const baseCommit = text(commit.previous_commit, 160) || null;
  return {
    contract: CODE_EVIDENCE_CONTRACT,
    kind: "commit",
    method: "code_commit_server_readback",
    execution_key: text(source.execution_key, 160),
    verification_status: "VERIFIED_COMMITTED",
    verification_source: verificationSource,
    server_state_contract: contract || null,
    repository,
    repository_url: repository,
    branch: "main",
    base_commit: baseCommit,
    previous_commit: baseCommit,
    commit_sha: text(commit.commit_sha, 160),
    tree_sha: text(commit.tree_sha, 160) || null,
    file_count: Number(commit.file_count || 0),
    business_effect_verified: true,
    authorization_effect: "NONE",
  };
}

export function findOperatorCodeExecutionEvidence(value) {
  return walk(value, (candidate) =>
    autonomousReceipt(candidate) || commitReceipt(candidate),
  );
}

function parentCapabilityKey(execution = {}) {
  const capability = object(execution.capability);
  return text(
    capability.key ||
      capability.capability_key ||
      execution.capability_key,
    300,
  );
}

function missionCommitReceiptMatches(execution, receipt) {
  const mission = capabilityEnvelopeResult(execution?.result);
  const missionState = object(mission.mission_state);
  if (
    receipt?.kind !== "commit" ||
    text(mission.status, 100) !== "completed" ||
    text(mission.mission_mode, 180) !== "durable_registered_sequence" ||
    text(missionState.status, 100) !== "completed"
  ) {
    return false;
  }

  const commitStep = list(missionState.steps).find((step) => {
    const verifyAfter = object(step?.verify_after);
    const payload = object(step?.payload);
    return (
      text(step?.capability_key, 300) === CODE_COMMIT_CAPABILITY_KEY &&
      text(verifyAfter.capability_key, 300) ===
        CODE_COMMIT_VERIFY_CAPABILITY_KEY &&
      text(payload.execution_key, 160) === receipt.execution_key
    );
  });
  if (!commitStep) return false;

  const missionEvents = list(mission.steps);
  const actionEvent = missionEvents.find(
    (event) =>
      text(event?.id, 200) === text(commitStep.id, 200) &&
      text(event?.capability_key, 300) === CODE_COMMIT_CAPABILITY_KEY &&
      text(event?.status, 100) === "action_completed",
  );
  const actionResult = capabilityEnvelopeResult(actionEvent?.result);
  if (
    actionResult.verified !== true ||
    text(actionResult.branch, 80) !== "main" ||
    text(actionResult.execution_key, 160) !== receipt.execution_key ||
    text(actionResult.commit_sha, 160) !== receipt.commit_sha ||
    (receipt.base_commit &&
      text(actionResult.previous_commit, 160) !== receipt.base_commit)
  ) {
    return false;
  }

  const verificationEvent = missionEvents.find((event) => {
    if (
      text(event?.id, 200) !== text(commitStep.id, 200) ||
      text(event?.capability_key, 300) !== CODE_COMMIT_CAPABILITY_KEY ||
      text(event?.status, 100) !== "completed"
    ) {
      return false;
    }
    const verifiedReceipt = commitReceipt(event?.verification);
    return Boolean(
      verifiedReceipt &&
        verifiedReceipt.execution_key === receipt.execution_key &&
        verifiedReceipt.commit_sha === receipt.commit_sha &&
        verifiedReceipt.base_commit === receipt.base_commit,
    );
  });

  return Boolean(verificationEvent);
}

export function withOperatorCodeExecutionEvidence(result = {}) {
  const source = object(result);
  const execution = object(source.execution);
  const capabilityKey = parentCapabilityKey(execution);
  if (!CODE_EVIDENCE_PARENT_CAPABILITIES.has(capabilityKey)) return result;

  const receipt = findOperatorCodeExecutionEvidence({
    execution,
    provider_evidence: object(source.provider_evidence),
  });
  if (!receipt) return result;

  if (
    receipt.kind === "commit" &&
    capabilityKey === OPERATOR_MISSION_CAPABILITY_KEY &&
    !missionCommitReceiptMatches(execution, receipt)
  ) {
    return result;
  }

  const verification = object(execution.post_action_verification);
  const matchedIdentity = `execution_key:${receipt.execution_key}`;
  const evidencedExecution = {
    ...execution,
    business_effect_verified: true,
    code_execution_evidence: receipt,
    post_action_verification: {
      ...verification,
      status: "completed",
      registered: true,
      business_effect_verified: true,
      code_execution_evidence: receipt,
      assertion: {
        ...object(verification.assertion),
        passed: true,
        method: receipt.method,
        reason: null,
        matched_identity: matchedIdentity,
      },
    },
  };
  const persistenceHistory =
    receipt.kind === "commit"
      ? operatorCodePersistenceHistoryFromExecution(evidencedExecution)
      : null;
  const decision = object(source.decision);

  return {
    ...source,
    execution: evidencedExecution,
    decision: persistenceHistory
      ? {
          ...decision,
          project_state: {
            ...object(decision.project_state),
            last_verified_code_persistence: persistenceHistory,
          },
        }
      : source.decision,
    provider_evidence: {
      ...object(source.provider_evidence),
      code_execution_evidence: receipt,
    },
    code_execution_evidence: receipt,
    operator_catalog: {
      ...object(source.operator_catalog),
      code_execution_evidence_contract: CODE_EVIDENCE_CONTRACT,
      code_execution_evidence_verified: true,
      code_execution_evidence_method: receipt.method,
      code_execution_evidence_parent_capability: capabilityKey,
      code_persistence_history_recorded: Boolean(persistenceHistory),
      code_commit_mission_binding_verified:
        receipt.kind === "commit" &&
        capabilityKey === OPERATOR_MISSION_CAPABILITY_KEY
          ? true
          : null,
    },
  };
}

export const OperatorCodeExecutionEvidenceRuntime = Object.freeze({
  contract: CODE_EVIDENCE_CONTRACT,
  find: findOperatorCodeExecutionEvidence,
  apply: withOperatorCodeExecutionEvidence,
});

export default OperatorCodeExecutionEvidenceRuntime;
