const CODE_EVIDENCE_CONTRACT =
  "AVANTIQO_OPERATOR_CODE_EXECUTION_EVIDENCE_V1";
const HISTORY_CONTRACT =
  "AVANTIQO_OPERATOR_CODE_PERSISTENCE_HISTORY_V1";
const ALLOWED_VERIFICATION_SOURCES = new Set([
  "SERVER_OWNED_COMMIT_EXECUTION_STATE",
  "GITHUB_RECOVERY_FROM_ATTESTED_ARTIFACT",
]);

function text(value, limit = 800) {
  return String(value ?? "").trim().slice(0, limit);
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function normalizedHistory(value) {
  const candidate = object(value);
  const verificationSource = text(candidate.verification_source, 180);
  if (
    text(candidate.contract, 180) !== HISTORY_CONTRACT ||
    candidate.verified !== true ||
    candidate.business_effect_verified !== true ||
    text(candidate.authorization_effect, 40) !== "NONE" ||
    text(candidate.branch, 40) !== "main" ||
    !text(candidate.execution_key, 180) ||
    !text(candidate.commit_sha, 180) ||
    (verificationSource && !ALLOWED_VERIFICATION_SOURCES.has(verificationSource))
  ) {
    return null;
  }

  return {
    contract: HISTORY_CONTRACT,
    verified: true,
    business_effect_verified: true,
    authorization_effect: "NONE",
    execution_key: text(candidate.execution_key, 180),
    repository: text(candidate.repository, 500) || null,
    repository_url:
      text(candidate.repository_url || candidate.repository, 500) || null,
    branch: "main",
    base_commit: text(candidate.base_commit, 180) || null,
    commit_sha: text(candidate.commit_sha, 180),
    tree_sha: text(candidate.tree_sha, 180) || null,
    verification_source: verificationSource || null,
  };
}

function historyFromReceipt(value) {
  const receipt = object(value);
  const verificationSource = text(receipt.verification_source, 180);
  if (
    text(receipt.contract, 180) !== CODE_EVIDENCE_CONTRACT ||
    text(receipt.kind, 80) !== "commit" ||
    text(receipt.verification_status, 120) !== "VERIFIED_COMMITTED" ||
    receipt.business_effect_verified !== true ||
    text(receipt.authorization_effect, 40) !== "NONE" ||
    text(receipt.branch, 40) !== "main" ||
    !text(receipt.execution_key, 180) ||
    !text(receipt.commit_sha, 180) ||
    !ALLOWED_VERIFICATION_SOURCES.has(verificationSource)
  ) {
    return null;
  }

  return normalizedHistory({
    contract: HISTORY_CONTRACT,
    verified: true,
    business_effect_verified: true,
    authorization_effect: "NONE",
    execution_key: receipt.execution_key,
    repository: receipt.repository,
    repository_url: receipt.repository_url,
    branch: "main",
    base_commit: receipt.base_commit,
    commit_sha: receipt.commit_sha,
    tree_sha: receipt.tree_sha,
    verification_source: verificationSource,
  });
}

export function operatorCodePersistenceHistoryFromExecution(execution = {}) {
  const current = object(execution);
  const direct = historyFromReceipt(current.code_execution_evidence);
  if (direct) return direct;
  return historyFromReceipt(
    object(current.post_action_verification).code_execution_evidence,
  );
}

export function normalizeOperatorCodePersistenceHistory(value) {
  return normalizedHistory(value);
}

export function nextOperatorCodePersistenceHistory({
  previousHistory = null,
  execution = null,
  reset = false,
} = {}) {
  const current = operatorCodePersistenceHistoryFromExecution(execution);
  if (current) return current;
  if (reset === true) return null;
  return normalizeOperatorCodePersistenceHistory(previousHistory);
}

export function operatorCodePersistenceHistoryText(value) {
  const history = normalizeOperatorCodePersistenceHistory(value);
  if (!history) return null;

  const proof = [
    `Code ${history.execution_key}`,
    history.repository_url || history.repository,
    history.base_commit ? `base ${history.base_commit.slice(0, 12)}` : null,
    `commit ${history.commit_sha.slice(0, 12)}`,
  ]
    .filter(Boolean)
    .join(" · ");

  return `Last verified Code persistence: ${proof}. This is historical verification evidence only; it does not authorize another action.`;
}

export const OperatorCodePersistenceHistory = Object.freeze({
  contract: HISTORY_CONTRACT,
  authorization_effect: "NONE",
  normalize: normalizeOperatorCodePersistenceHistory,
  from_execution: operatorCodePersistenceHistoryFromExecution,
  next: nextOperatorCodePersistenceHistory,
  render: operatorCodePersistenceHistoryText,
});

export default OperatorCodePersistenceHistory;
