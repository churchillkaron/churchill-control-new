import crypto from "node:crypto";

import {
  verifyCodeAICompetitiveFullRunManifest,
} from "./CodeAICompetitiveFullRunAttestationRuntime.js";

import { supabaseAdmin } from "../../shared/supabase/admin.js";
import {
  resolveAvantiqoLearningOrganization,
} from "../../intelligence/runtime/AvantiqoLearningOrganizationRuntime.js";

export const CODE_AI_COMPETITIVE_BENCHMARK_EVIDENCE_CONTRACT =
  "AVANTIQO_CODE_COMPETITIVE_BENCHMARK_EVIDENCE_V1";
export const CODE_AI_COMPETITIVE_BENCHMARK_REPORT_CONTRACT =
  "AVANTIQO_CODE_COMPETITIVE_BENCHMARK_V1";
export const CODE_AI_COMPETITIVE_IMPROVEMENT_BACKLOG_CONTRACT =
  "AVANTIQO_CODE_COMPETITIVE_IMPROVEMENT_BACKLOG_V1";

const MEMORY_TABLE = "intelligence_memories";
const MEMORY_SCOPE = "platform_code_competitive_benchmark_evidence";
const MEMORY_SOURCE = "code_ai_competitive_benchmark_evidence_runtime";
const MAX_REPORT_AGE_DAYS = 30;
const MAX_EVIDENCE_HISTORY = 24;
const SHA256 = /^[a-f0-9]{64}$/i;
const GIT_SHA = /^[a-f0-9]{40}$/i;
const RUN_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const HISTORY_ATTESTATION_CONTRACT_V1 = "AVANTIQO_CODE_COMPETITIVE_HISTORY_ATTESTATION_V1";
const HISTORY_ATTESTATION_CONTRACT = "AVANTIQO_CODE_COMPETITIVE_HISTORY_ATTESTATION_V2";
const HISTORY_ATTESTATION_ALGORITHM = "hmac-sha256";
const HISTORY_ATTESTATION_SECRET_ENV = "AVANTIQO_CODE_COMPETITIVE_FULL_RUN_ATTESTATION_SECRET";
const HISTORY_ATTESTATION_KEY_ID_ENV = "AVANTIQO_CODE_COMPETITIVE_HISTORY_ATTESTATION_KEY_ID";
const HISTORY_ATTESTATION_KEYRING_ENV = "AVANTIQO_CODE_COMPETITIVE_HISTORY_ATTESTATION_KEYRING";
const HISTORY_ATTESTATION_DOMAIN_V1 = "AVANTIQO_CODE_COMPETITIVE_HISTORY_EVIDENCE_V1\n";
const HISTORY_ATTESTATION_DOMAIN = "AVANTIQO_CODE_COMPETITIVE_HISTORY_EVIDENCE_V2\n";
const HISTORY_ATTESTATION_LEGACY_KEY_ID = "legacy-unversioned";
const HISTORY_ATTESTATION_DEFAULT_KEY_ID = "default";
const HISTORY_KEY_ID = /^[A-Za-z0-9._-]{1,80}$/;
const MIN_HISTORY_ATTESTATION_SECRET_BYTES = 32;

function text(value, maximum = 4000) {
  return String(value ?? "").trim().slice(0, maximum);
}
function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}
function list(value) {
  return Array.isArray(value) ? value : [];
}
function finite(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}
function reportAgeDays(value, nowMs = Date.now()) {
  const time = Date.parse(text(value, 120));
  if (!Number.isFinite(time) || !Number.isFinite(Number(nowMs))) return null;
  return Number(((Number(nowMs) - time) / 86400000).toFixed(2));
}
function canonical(value) {
  if (value === null || value === undefined) return value ?? null;
  if (Array.isArray(value)) return value.map(canonical);
  if (typeof value !== "object") return value;
  return Object.fromEntries(
    Object.keys(value).sort().map((key) => [key, canonical(value[key])]),
  );
}
function fingerprint(value) {
  return crypto.createHash("sha256").update(JSON.stringify(canonical(value)), "utf8").digest("hex");
}
function validHistorySecret(value) {
  const secret = String(value ?? "");
  return Buffer.byteLength(secret, "utf8") >= MIN_HISTORY_ATTESTATION_SECRET_BYTES ? secret : null;
}
function historyAttestationKeyring(env = process.env, { required = true } = {}) {
  const raw = text(env?.[HISTORY_ATTESTATION_KEYRING_ENV], 20000);
  let parsed = {};
  if (raw) {
    try { parsed = JSON.parse(raw); } catch {
      if (required) throw new Error("CODE_AI_COMPETITIVE_HISTORY_ATTESTATION_KEYRING_INVALID_JSON");
      return { keys: {}, active_key_id: null, active_secret: null, invalid: true };
    }
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      if (required) throw new Error("CODE_AI_COMPETITIVE_HISTORY_ATTESTATION_KEYRING_INVALID");
      return { keys: {}, active_key_id: null, active_secret: null, invalid: true };
    }
  }
  const keys = {};
  for (const [candidateId, candidateSecret] of Object.entries(parsed)) {
    const keyId = text(candidateId, 80);
    const secret = validHistorySecret(candidateSecret);
    if (!HISTORY_KEY_ID.test(keyId) || !secret) {
      if (required) throw new Error("CODE_AI_COMPETITIVE_HISTORY_ATTESTATION_KEY_INVALID");
      continue;
    }
    keys[keyId] = secret;
  }
  const fallback = validHistorySecret(env?.[HISTORY_ATTESTATION_SECRET_ENV]);
  if (fallback && !keys[HISTORY_ATTESTATION_DEFAULT_KEY_ID]) {
    keys[HISTORY_ATTESTATION_DEFAULT_KEY_ID] = fallback;
  }
  const activeKeyId = text(env?.[HISTORY_ATTESTATION_KEY_ID_ENV], 80) || HISTORY_ATTESTATION_DEFAULT_KEY_ID;
  const activeSecret = HISTORY_KEY_ID.test(activeKeyId) ? keys[activeKeyId] || null : null;
  if (required && !activeSecret) throw new Error("CODE_AI_COMPETITIVE_HISTORY_ATTESTATION_ACTIVE_KEY_REQUIRED");
  return { keys, active_key_id: activeKeyId, active_secret: activeSecret, invalid: false };
}
function historyAttestationPayload(value, { contract = HISTORY_ATTESTATION_CONTRACT, key_id = null } = {}) {
  const source = object(value);
  const core = { ...source };
  delete core.history_attestation;
  delete core.history_integrity_sha256;
  if (contract === HISTORY_ATTESTATION_CONTRACT_V1) {
    return HISTORY_ATTESTATION_DOMAIN_V1 + JSON.stringify(canonical(core));
  }
  return `${HISTORY_ATTESTATION_DOMAIN}key_id:${text(key_id, 80)}\n${JSON.stringify(canonical(core))}`;
}
function historyAttestationDigest(value, secret, options = {}) {
  return crypto.createHmac("sha256", secret).update(historyAttestationPayload(value, options), "utf8").digest("hex");
}
function resolveHistoryVerificationKey(attestation, env = process.env) {
  const contract = text(attestation?.contract, 180);
  const keyring = historyAttestationKeyring(env, { required: false });
  if (keyring.invalid) return { secret: null, key_id: null, reason: "ATTESTATION_KEYRING_INVALID" };
  if (contract === HISTORY_ATTESTATION_CONTRACT_V1) {
    const secret = keyring.keys[HISTORY_ATTESTATION_LEGACY_KEY_ID] || keyring.keys[HISTORY_ATTESTATION_DEFAULT_KEY_ID] || null;
    return {
      secret,
      key_id: HISTORY_ATTESTATION_LEGACY_KEY_ID,
      reason: secret ? null : "ATTESTATION_SECRET_UNAVAILABLE",
      legacy_v1: true,
    };
  }
  if (contract !== HISTORY_ATTESTATION_CONTRACT) return { secret: null, key_id: null, reason: "ATTESTATION_REQUIRED" };
  const keyId = text(attestation?.key_id, 80);
  if (!HISTORY_KEY_ID.test(keyId)) return { secret: null, key_id: keyId || null, reason: "ATTESTATION_KEY_ID_REQUIRED" };
  const secret = keyring.keys[keyId] || null;
  const reason = secret
    ? null
    : keyId === HISTORY_ATTESTATION_DEFAULT_KEY_ID && Object.keys(keyring.keys).length === 0
      ? "ATTESTATION_SECRET_UNAVAILABLE"
      : "ATTESTATION_KEY_UNKNOWN";
  return { secret, key_id: keyId, reason, legacy_v1: false };
}

function safeGates(value) {
  const source = object(value);
  return Object.fromEntries(
    Object.entries(source)
      .slice(0, 24)
      .map(([key, candidate]) => [text(key, 120), candidate === true]),
  );
}
function projectedComparison(value = {}) {
  const source = object(value);
  const reference = object(source.reference);
  const lossCaseIds = list(source.cases)
    .filter((item) => text(item?.outcome, 40) === "LOSS")
    .map((item) => text(item?.case_id, 160))
    .filter(Boolean)
    .slice(0, 80);
  return {
    reference: {
      provider: text(reference.provider, 120) || "unknown",
      model: text(reference.model, 200) || "unknown",
    },
    measured_at: text(source.measured_at, 120) || null,
    case_count: Number(source.case_count || 0),
    wins: Number(source.wins || 0),
    losses: Number(source.losses || 0),
    ties: Number(source.ties || 0),
    win_rate: finite(source.win_rate),
    owned_pass_rate: finite(source.owned_pass_rate),
    reference_pass_rate: finite(source.reference_pass_rate),
    p95_latency_ratio: finite(source.p95_latency_ratio),
    cost_ratio: finite(source.cost_ratio),
    reference_age_days: finite(source.reference_age_days),
    gates: safeGates(source.gates),
    passed: source.passed === true,
    loss_case_ids: lossCaseIds,
  };
}
function projectedBacklog(value = {}, { source_report_sha256 = null } = {}) {
  if (text(value?.contract, 180) !== CODE_AI_COMPETITIVE_IMPROVEMENT_BACKLOG_CONTRACT) {
    return [];
  }
  const expectedReportSha = text(source_report_sha256, 80).toLowerCase();
  if (expectedReportSha) {
    if (!SHA256.test(expectedReportSha)) throw new Error("CODE_AI_COMPETITIVE_SOURCE_REPORT_SHA_INVALID");
    if (text(value?.source_report_sha256, 80).toLowerCase() !== expectedReportSha) {
      throw new Error("CODE_AI_COMPETITIVE_BACKLOG_SOURCE_REPORT_MISMATCH");
    }
  }
  return list(value.items).slice(0, 40).map((item) => ({
    case_id: text(item?.case_id, 160) || null,
    category: text(item?.category, 160) || null,
    title: text(item?.title, 600) || null,
    required_evidence: list(item?.required_evidence)
      .map((entry) => text(entry, 600))
      .filter(Boolean)
      .slice(0, 12),
    losses: Number(item?.losses || 0),
    references: list(item?.references)
      .map((entry) => text(entry, 240))
      .filter(Boolean)
      .slice(0, 12),
  })).filter((item) => item.case_id);
}
function resolveFullRunBinding({
  report,
  full_run_manifest = null,
  source_report_sha256 = null,
  full_run_manifest_sha256 = null,
  env = process.env,
} = {}) {
  if (!full_run_manifest) {
    return {
      bound: false,
      source_report_sha256: null,
      full_run_manifest_sha256: null,
      full_run_attestation_contract: null,
      full_run_attestation_digest: null,
      orchestrator_run_id: null,
      configuration_sha256: null,
      runner_source_commit: null,
    };
  }
  const source = object(report);
  const manifest = object(full_run_manifest);
  verifyCodeAICompetitiveFullRunManifest(manifest, { env });
  const reportSha = text(source_report_sha256, 80).toLowerCase();
  const manifestSha = text(full_run_manifest_sha256, 80).toLowerCase();
  if (!SHA256.test(reportSha)) throw new Error("CODE_AI_COMPETITIVE_SOURCE_REPORT_SHA_REQUIRED");
  if (!SHA256.test(manifestSha)) throw new Error("CODE_AI_COMPETITIVE_FULL_RUN_MANIFEST_SHA_REQUIRED");
  const artifact = list(manifest.artifacts).find((item) => text(item?.stage, 120) === "COMPETITIVE_CERTIFICATION");
  if (!artifact || text(artifact?.sha256, 80).toLowerCase() !== reportSha) {
    throw new Error("CODE_AI_COMPETITIVE_FULL_RUN_REPORT_SHA_MISMATCH");
  }
  if (text(artifact?.contract, 180) !== text(source.contract, 180)) {
    throw new Error("CODE_AI_COMPETITIVE_FULL_RUN_REPORT_CONTRACT_MISMATCH");
  }
  if (text(artifact?.generated_at, 120) !== text(source.generated_at, 120)) {
    throw new Error("CODE_AI_COMPETITIVE_FULL_RUN_REPORT_TIME_MISMATCH");
  }
  if (manifest.competitive_certified !== (source.competitive_certified === true)) {
    throw new Error("CODE_AI_COMPETITIVE_FULL_RUN_CERTIFICATION_MISMATCH");
  }
  const attestation = object(manifest.full_run_attestation);
  const orchestratorRunId = text(manifest.orchestrator_run_id, 80);
  const configurationSha = text(manifest.configuration_sha256, 80).toLowerCase();
  const runnerCommit = text(manifest.runner_source_commit, 80).toLowerCase();
  if (!RUN_ID.test(orchestratorRunId) || !SHA256.test(configurationSha) || !GIT_SHA.test(runnerCommit)) {
    throw new Error("CODE_AI_COMPETITIVE_FULL_RUN_PROVENANCE_INVALID");
  }
  return {
    bound: true,
    source_report_sha256: reportSha,
    full_run_manifest_sha256: manifestSha,
    full_run_attestation_contract: text(attestation.contract, 180) || null,
    full_run_attestation_digest: text(attestation.digest, 80).toLowerCase() || null,
    orchestrator_run_id: orchestratorRunId,
    configuration_sha256: configurationSha,
    runner_source_commit: runnerCommit,
  };
}

export function refreshCodeAICompetitiveBenchmarkEvidenceFreshness(
  value = {},
  { now_ms = Date.now() } = {},
) {
  const source = object(value);
  if (text(source.contract, 180) !== CODE_AI_COMPETITIVE_BENCHMARK_EVIDENCE_CONTRACT) {
    throw new Error("CODE_AI_COMPETITIVE_BENCHMARK_EVIDENCE_CONTRACT_INVALID");
  }
  const reportAge = reportAgeDays(source.generated_at, now_ms);
  const comparisons = list(source.comparisons).slice(0, 12).map((item) => {
    const referenceAge = reportAgeDays(item?.measured_at, now_ms);
    const referenceCurrent =
      item?.gates?.reference_fresh === true &&
      referenceAge !== null &&
      referenceAge >= 0 &&
      referenceAge <= MAX_REPORT_AGE_DAYS;
    return {
      ...object(item),
      reference_dynamic_age_days: referenceAge,
      reference_current: referenceCurrent,
    };
  });
  const fullRunBound =
    source.full_run_manifest_bound === true &&
    source.history_integrity_valid !== false &&
    SHA256.test(text(source.source_report_sha256, 80)) &&
    SHA256.test(text(source.full_run_manifest_sha256, 80)) &&
    SHA256.test(text(source.full_run_attestation_digest, 80)) &&
    RUN_ID.test(text(source.orchestrator_run_id, 80)) &&
    GIT_SHA.test(text(source.source_repository_commit_provenance, 80));
  const competitiveCertified =
    source.competitive_certified === true &&
    fullRunBound &&
    comparisons.length >= 2 &&
    comparisons.every((item) => item.passed === true);
  const evidenceCurrent =
    fullRunBound &&
    reportAge !== null &&
    reportAge >= 0 &&
    reportAge <= MAX_REPORT_AGE_DAYS &&
    comparisons.length >= 2 &&
    comparisons.every((item) => item.reference_current === true);
  return {
    ...source,
    report_age_days: reportAge,
    evidence_current: evidenceCurrent,
    competitive_certified: competitiveCertified,
    superiority_claim_allowed: competitiveCertified && evidenceCurrent,
    comparisons,
    freshness_recomputed_at_read: true,
    authorization_effect: "NONE",
  };
}

export function projectCodeAICompetitiveBenchmarkEvidence({
  report,
  backlog = null,
  full_run_manifest = null,
  source_report_sha256 = null,
  full_run_manifest_sha256 = null,
  env = process.env,
} = {}) {
  const source = object(report);
  if (text(source.contract, 180) !== CODE_AI_COMPETITIVE_BENCHMARK_REPORT_CONTRACT) {
    throw new Error("CODE_AI_COMPETITIVE_BENCHMARK_REPORT_CONTRACT_INVALID");
  }
  const fullRunBinding = resolveFullRunBinding({
    report: source,
    full_run_manifest,
    source_report_sha256,
    full_run_manifest_sha256,
    env,
  });
  const comparisons = list(source.comparisons).map(projectedComparison).slice(0, 12);
  const ageDays = reportAgeDays(source.generated_at);
  const certified =
    fullRunBinding.bound &&
    source.competitive_certified === true &&
    source.superiority_claim_allowed === true &&
    comparisons.length >= 2 &&
    comparisons.every((item) => item.passed === true);
  const evidenceCurrent =
    fullRunBinding.bound &&
    ageDays !== null &&
    ageDays >= 0 &&
    ageDays <= MAX_REPORT_AGE_DAYS &&
    comparisons.every((item) => item.gates.reference_fresh === true);
  const projected = {
    contract: CODE_AI_COMPETITIVE_BENCHMARK_EVIDENCE_CONTRACT,
    source_report_contract: CODE_AI_COMPETITIVE_BENCHMARK_REPORT_CONTRACT,
    generated_at: text(source.generated_at, 120) || null,
    report_age_days: ageDays,
    maximum_report_age_days: MAX_REPORT_AGE_DAYS,
    evidence_current: evidenceCurrent,
    competitive_certified: certified,
    superiority_claim_allowed: certified && evidenceCurrent,
    suite_contract: text(source.suite_contract, 180) || null,
    suite_case_count: Number(source.suite_case_count || 0),
    comparisons,
    improvement_backlog: projectedBacklog(backlog || {}, {
      source_report_sha256: fullRunBinding.bound ? fullRunBinding.source_report_sha256 : null,
    }),
    full_run_manifest_bound: fullRunBinding.bound,
    source_report_sha256: fullRunBinding.source_report_sha256,
    full_run_manifest_sha256: fullRunBinding.full_run_manifest_sha256,
    full_run_attestation_contract: fullRunBinding.full_run_attestation_contract,
    full_run_attestation_digest: fullRunBinding.full_run_attestation_digest,
    orchestrator_run_id: fullRunBinding.orchestrator_run_id,
    configuration_sha256: fullRunBinding.configuration_sha256,
    runtime_provider_effect: "NONE",
    external_reference_execution_performed_by_persistence: false,
    source_repository_commit_provenance: fullRunBinding.runner_source_commit || "UNBOUND_SOURCE_REPORT",
    customer_private_content_included: false,
    raw_customer_content_included: false,
    raw_reasoning_included: false,
    automatic_source_mutation_authority: false,
    commit_authority: false,
    production_deploy_authority: false,
    provider_routing_authority: false,
    model_promotion_authority: false,
    authorization_effect: "NONE",
  };
  const refreshed = refreshCodeAICompetitiveBenchmarkEvidenceFreshness(projected);
  return { ...refreshed, evidence_fingerprint: fingerprint(refreshed) };
}

export function validateCodeAICompetitiveBenchmarkStorageCommit(evidence, storage_repository_commit) {
  const source = object(evidence);
  const storageCommit = text(storage_repository_commit, 80).toLowerCase();
  if (source.full_run_manifest_bound !== true) return GIT_SHA.test(storageCommit) ? storageCommit : null;
  if (!GIT_SHA.test(storageCommit)) {
    throw new Error("CODE_AI_COMPETITIVE_BENCHMARK_STORAGE_COMMIT_REQUIRED");
  }
  if (storageCommit !== text(source.source_repository_commit_provenance, 80).toLowerCase()) {
    throw new Error("CODE_AI_COMPETITIVE_BENCHMARK_STORAGE_SOURCE_COMMIT_MISMATCH");
  }
  return storageCommit;
}

export function codeAICompetitiveBenchmarkMemoryKey(evidence) {
  const fingerprintValue = text(evidence?.evidence_fingerprint, 80).toLowerCase();
  if (!SHA256.test(fingerprintValue)) {
    throw new Error("CODE_AI_COMPETITIVE_BENCHMARK_MEMORY_KEY_FINGERPRINT_REQUIRED");
  }
  return `code_ai_competitive_benchmark_evidence:v1:${fingerprintValue.slice(0, 40)}`;
}

export function sealCodeAICompetitiveBenchmarkStoredEvidence(
  evidence,
  { storage_repository_commit = null, persisted_at = null, memory_key = null, env = process.env } = {},
) {
  const source = object(evidence);
  const storageCommit = validateCodeAICompetitiveBenchmarkStorageCommit(source, storage_repository_commit);
  const expectedMemoryKey = codeAICompetitiveBenchmarkMemoryKey(source);
  const suppliedMemoryKey = text(memory_key, 240) || expectedMemoryKey;
  if (suppliedMemoryKey !== expectedMemoryKey) {
    throw new Error("CODE_AI_COMPETITIVE_BENCHMARK_MEMORY_KEY_MISMATCH");
  }
  const core = {
    ...source,
    history_integrity_valid: true,
    storage_repository_commit: storageCommit,
    history_memory_key: expectedMemoryKey,
    persisted_at: text(persisted_at, 120) || null,
    ordinary_memory_recall: false,
  };
  const keyring = historyAttestationKeyring(env);
  const keyId = keyring.active_key_id;
  const secret = keyring.active_secret;
  return {
    ...core,
    history_integrity_sha256: fingerprint(core),
    history_attestation: {
      contract: HISTORY_ATTESTATION_CONTRACT,
      algorithm: HISTORY_ATTESTATION_ALGORITHM,
      key_id: keyId,
      digest: historyAttestationDigest(core, secret, { contract: HISTORY_ATTESTATION_CONTRACT, key_id: keyId }),
      server_only: true,
    },
  };
}

export function verifyCodeAICompetitiveBenchmarkStoredEvidenceIntegrity(
  metadata,
  { env = process.env } = {},
) {
  const source = object(metadata);
  const attestation = object(source.history_attestation);
  const suppliedDigest = text(attestation.digest, 80).toLowerCase();
  const legacyUnsealed = !suppliedDigest && !text(source.history_integrity_sha256, 80);
  const contract = text(attestation.contract, 180);
  const key = resolveHistoryVerificationKey(attestation, env);
  const contractAllowed = contract === HISTORY_ATTESTATION_CONTRACT || contract === HISTORY_ATTESTATION_CONTRACT_V1;
  if (
    !contractAllowed ||
    text(attestation.algorithm, 80) !== HISTORY_ATTESTATION_ALGORITHM ||
    attestation.server_only !== true ||
    !SHA256.test(suppliedDigest) ||
    !key.secret
  ) {
    return {
      valid: false,
      legacy_unsealed: legacyUnsealed,
      legacy_v1: key.legacy_v1 === true,
      secret_available: Boolean(key.secret),
      key_id: key.key_id || null,
      reason: key.reason || "ATTESTATION_REQUIRED",
      supplied_digest: suppliedDigest || null,
    };
  }
  const expectedDigest = historyAttestationDigest(source, key.secret, {
    contract,
    key_id: key.legacy_v1 ? null : key.key_id,
  });
  const suppliedBuffer = Buffer.from(suppliedDigest, "hex");
  const expectedBuffer = Buffer.from(expectedDigest, "hex");
  const hmacValid =
    suppliedBuffer.length === expectedBuffer.length &&
    crypto.timingSafeEqual(suppliedBuffer, expectedBuffer);
  const suppliedFingerprint = text(source.history_integrity_sha256, 80).toLowerCase();
  const fingerprintCore = { ...source };
  delete fingerprintCore.history_attestation;
  delete fingerprintCore.history_integrity_sha256;
  const expectedFingerprint = fingerprint(fingerprintCore);
  const fingerprintValid = SHA256.test(suppliedFingerprint) && suppliedFingerprint === expectedFingerprint;
  const storageValid =
    !source.full_run_manifest_bound ||
    (GIT_SHA.test(text(source.storage_repository_commit, 80)) &&
      text(source.storage_repository_commit, 80).toLowerCase() ===
        text(source.source_repository_commit_provenance, 80).toLowerCase());
  return {
    valid: hmacValid && fingerprintValid && storageValid,
    legacy_unsealed: false,
    legacy_v1: key.legacy_v1 === true,
    secret_available: true,
    key_id: key.key_id || null,
    hmac_valid: hmacValid,
    fingerprint_valid: fingerprintValid,
    storage_commit_valid: storageValid,
    supplied_digest: suppliedDigest,
  };
}


export function verifyCodeAICompetitiveBenchmarkStoredEvidenceRecord(
  metadata,
  { row_updated_at = null, row_memory_key = null, env = process.env } = {},
) {
  const integrity = verifyCodeAICompetitiveBenchmarkStoredEvidenceIntegrity(metadata, { env });
  const persistedAtRaw = text(metadata?.persisted_at, 120);
  const rowUpdatedAtRaw = text(row_updated_at, 120);
  const persistedAt = Date.parse(persistedAtRaw);
  const rowUpdatedAt = Date.parse(rowUpdatedAtRaw);
  const rowTimestampValid =
    Number.isFinite(persistedAt) &&
    Number.isFinite(rowUpdatedAt) &&
    persistedAt === rowUpdatedAt;
  const sealedMemoryKey = text(metadata?.history_memory_key, 240);
  const rowMemoryKey = text(row_memory_key, 240);
  const rowMemoryKeyValid = Boolean(sealedMemoryKey) && sealedMemoryKey === rowMemoryKey;
  const reason = !integrity.valid
    ? integrity.reason || "HISTORY_INTEGRITY_INVALID"
    : !rowTimestampValid
      ? "HISTORY_ROW_TIMESTAMP_MISMATCH"
      : !rowMemoryKeyValid
        ? "HISTORY_ROW_MEMORY_KEY_MISMATCH"
        : null;
  return {
    ...integrity,
    valid: integrity.valid && rowTimestampValid && rowMemoryKeyValid,
    row_timestamp_valid: rowTimestampValid,
    row_memory_key_valid: rowMemoryKeyValid,
    sealed_memory_key: sealedMemoryKey || null,
    row_memory_key: rowMemoryKey || null,
    persisted_at: persistedAtRaw || null,
    row_updated_at: rowUpdatedAtRaw || null,
    replay_resistant: true,
    reason,
  };
}

export function quarantineInvalidCodeAICompetitiveBenchmarkStoredEvidence(metadata, integrity = {}) {
  const source = object(metadata);
  if (integrity?.valid === true) return source;
  return {
    ...source,
    competitive_certified: false,
    superiority_claim_allowed: false,
    evidence_current: false,
    history_integrity_valid: false,
    comparisons: [],
    improvement_backlog: [],
    quarantine_reason: text(integrity?.reason, 160) ||
      (integrity?.legacy_unsealed === true ? "LEGACY_UNSEALED_HISTORY" : "HISTORY_INTEGRITY_INVALID"),
    decision_support_allowed: false,
  };
}

async function learningOrganizationId() {
  const resolved = await resolveAvantiqoLearningOrganization();
  if (!resolved?.organization_id) {
    throw new Error("CODE_AI_COMPETITIVE_BENCHMARK_LEARNING_ORGANIZATION_REQUIRED");
  }
  return resolved.organization_id;
}

async function trimCompetitiveBenchmarkEvidenceHistory(organizationId) {
  const overflow = await supabaseAdmin
    .from(MEMORY_TABLE)
    .select("id")
    .eq("organization_id", organizationId)
    .eq("memory_scope", MEMORY_SCOPE)
    .eq("source", MEMORY_SOURCE)
    .order("updated_at", { ascending: false })
    .range(MAX_EVIDENCE_HISTORY, MAX_EVIDENCE_HISTORY + 99);
  if (overflow.error) throw overflow.error;

  const ids = (overflow.data || []).map((row) => row.id).filter(Boolean);
  if (!ids.length) return 0;

  const deleted = await supabaseAdmin
    .from(MEMORY_TABLE)
    .delete()
    .eq("organization_id", organizationId)
    .eq("memory_scope", MEMORY_SCOPE)
    .in("id", ids)
    .select("id");
  if (deleted.error) throw deleted.error;
  return (deleted.data || []).length;
}

export async function persistCodeAICompetitiveBenchmarkEvidence({
  report,
  backlog = null,
  full_run_manifest = null,
  source_report_sha256 = null,
  full_run_manifest_sha256 = null,
  storage_repository_commit = null,
  env = process.env,
} = {}) {
  const evidence = projectCodeAICompetitiveBenchmarkEvidence({
    report,
    backlog,
    full_run_manifest,
    source_report_sha256,
    full_run_manifest_sha256,
    env,
  });
  const organizationId = await learningOrganizationId();
  const memoryKey = codeAICompetitiveBenchmarkMemoryKey(evidence);
  const now = new Date().toISOString();
  const sealedMetadata = sealCodeAICompetitiveBenchmarkStoredEvidence(evidence, {
    storage_repository_commit,
    persisted_at: now,
    memory_key: memoryKey,
    env,
  });
  const persisted = await supabaseAdmin
    .from(MEMORY_TABLE)
    .upsert({
      organization_id: organizationId,
      party_id: null,
      entity_id: null,
      conversation_id: null,
      source_turn_id: null,
      memory_scope: MEMORY_SCOPE,
      memory_key: memoryKey,
      memory_type: "fact",
      subject: "Avantiqo Code Competitive Benchmark Evidence",
      content: evidence.competitive_certified
        ? `Competitive Code benchmark certified against ${evidence.comparisons.length} fresh reference systems.`
        : `Competitive Code benchmark not certified; ${evidence.improvement_backlog.length} evidence-backed improvement cases available.`,
      importance: 0.08,
      confidence: evidence.evidence_current ? 1 : 0.7,
      source: MEMORY_SOURCE,
      active: true,
      metadata: sealedMetadata,
      updated_at: now,
    }, { onConflict: "organization_id,memory_scope,memory_key" })
    .select("id,updated_at")
    .maybeSingle();
  if (persisted.error) throw persisted.error;
  if (!persisted.data?.id) throw new Error("CODE_AI_COMPETITIVE_BENCHMARK_EVIDENCE_PERSIST_FAILED");
  await trimCompetitiveBenchmarkEvidenceHistory(organizationId);
  return {
    persisted: true,
    row_id: persisted.data.id,
    updated_at: persisted.data.updated_at || now,
    evidence,
    authorization_effect: "NONE",
  };
}

export async function loadLatestCodeAICompetitiveBenchmarkEvidence() {
  const organizationId = await learningOrganizationId();
  const loaded = await supabaseAdmin
    .from(MEMORY_TABLE)
    .select("id,memory_key,metadata,updated_at")
    .eq("organization_id", organizationId)
    .eq("memory_scope", MEMORY_SCOPE)
    .eq("active", true)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (loaded.error) throw loaded.error;
  if (!loaded.data?.id) return { found: false, evidence: null };
  const metadata = object(loaded.data.metadata);
  if (text(metadata.contract, 180) !== CODE_AI_COMPETITIVE_BENCHMARK_EVIDENCE_CONTRACT) {
    throw new Error("CODE_AI_COMPETITIVE_BENCHMARK_EVIDENCE_CONTRACT_INVALID");
  }
  const integrity = verifyCodeAICompetitiveBenchmarkStoredEvidenceRecord(metadata, {
    row_updated_at: loaded.data.updated_at,
    row_memory_key: loaded.data.memory_key,
  });
  const safeMetadata = quarantineInvalidCodeAICompetitiveBenchmarkStoredEvidence(metadata, integrity);
  return {
    found: true,
    row_id: loaded.data.id,
    updated_at: loaded.data.updated_at || null,
    evidence: refreshCodeAICompetitiveBenchmarkEvidenceFreshness(safeMetadata),
    history_integrity: integrity,
    authorization_effect: "NONE",
  };
}

export const CodeAICompetitiveBenchmarkEvidenceRuntime = Object.freeze({
  contract: CODE_AI_COMPETITIVE_BENCHMARK_EVIDENCE_CONTRACT,
  report_contract: CODE_AI_COMPETITIVE_BENCHMARK_REPORT_CONTRACT,
  persist: persistCodeAICompetitiveBenchmarkEvidence,
  loadLatest: loadLatestCodeAICompetitiveBenchmarkEvidence,
  project: projectCodeAICompetitiveBenchmarkEvidence,
  refreshFreshness: refreshCodeAICompetitiveBenchmarkEvidenceFreshness,
  sealStoredEvidence: sealCodeAICompetitiveBenchmarkStoredEvidence,
  verifyStoredEvidenceIntegrity: verifyCodeAICompetitiveBenchmarkStoredEvidenceIntegrity,
  verifyStoredEvidenceRecord: verifyCodeAICompetitiveBenchmarkStoredEvidenceRecord,
  quarantineInvalidStoredEvidence: quarantineInvalidCodeAICompetitiveBenchmarkStoredEvidence,
  validateStorageCommit: validateCodeAICompetitiveBenchmarkStorageCommit,
  memoryKey: codeAICompetitiveBenchmarkMemoryKey,
  history_attestation_key_rotation_supported: true,
  history_attestation_unknown_key_fails_closed: true,
  history_replay_resistance_enforced: true,
  history_row_identity_binding_enforced: true,
  provider_routing_authority: false,
  production_deploy_authority: false,
});

export default CodeAICompetitiveBenchmarkEvidenceRuntime;
