import crypto from "node:crypto";

export const CODE_AI_COMPETITIVE_OWNED_ATTESTATION_CONTRACT =
  "AVANTIQO_CODE_COMPETITIVE_OWNED_ATTESTATION_V1";

const ALGORITHM = "hmac-sha256";
const SECRET_ENV = "AVANTIQO_CODE_COMPETITIVE_OWNED_ATTESTATION_SECRET";
const MIN_SECRET_BYTES = 32;
const SHA256 = /^[a-f0-9]{64}$/i;
const GIT_SHA = /^[a-f0-9]{40}$/i;
const DOMAIN = "AVANTIQO_CODE_COMPETITIVE_OWNED_EVIDENCE_V1\n";

function text(value, maximum = 4000) {
  return String(value ?? "").trim().slice(0, maximum);
}
function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}
function list(value) {
  return Array.isArray(value) ? value : [];
}
function secretFrom(env) {
  const secret = String(env?.[SECRET_ENV] ?? "");
  if (Buffer.byteLength(secret, "utf8") < MIN_SECRET_BYTES) {
    throw new Error("CODE_AI_COMPETITIVE_OWNED_ATTESTATION_SECRET_REQUIRED");
  }
  return secret;
}
function canonical(value) {
  if (value === null || value === undefined) return value ?? null;
  if (Array.isArray(value)) return value.map(canonical);
  if (typeof value !== "object") return value;
  return Object.fromEntries(
    Object.keys(value)
      .filter((key) => key !== "owned_attestation")
      .sort()
      .map((key) => [key, canonical(value[key])]),
  );
}
function payloadJson(report) {
  return DOMAIN + JSON.stringify(canonical(object(report)));
}
function digestFor(report, secret) {
  return crypto.createHmac("sha256", secret).update(payloadJson(report), "utf8").digest("hex");
}

export function validateCodeAICompetitiveOwnedReportShape(
  report,
  {
    suite_contract = null,
    suite_sha256 = null,
    prompt_contract = null,
    prompt_contract_sha256 = null,
    required_case_ids = null,
  } = {},
) {
  const source = object(report);
  const observations = list(source.observations);
  const generatedAt = Date.parse(text(source.generated_at, 120));
  const caseIds = observations.map((item) => text(item?.case_id, 160)).filter(Boolean).sort();
  const required = list(required_case_ids).map((item) => text(item, 160)).filter(Boolean).sort();

  if (!Number.isFinite(generatedAt)) throw new Error("CODE_AI_COMPETITIVE_OWNED_MEASURED_AT_REQUIRED");
  if (text(source.measurement_mode, 120) !== "LIVE_OWNED_LOCAL_NODE") {
    throw new Error("CODE_AI_COMPETITIVE_OWNED_LIVE_MEASUREMENT_REQUIRED");
  }
  if (!GIT_SHA.test(text(source.runner_source_commit, 80))) {
    throw new Error("CODE_AI_COMPETITIVE_OWNED_RUNNER_SOURCE_COMMIT_REQUIRED");
  }
  if (text(source.runner_ref, 80) !== "main" || source.runner_repository_clean !== true) {
    throw new Error("CODE_AI_COMPETITIVE_OWNED_CURRENT_CLEAN_MAIN_REQUIRED");
  }
  if (source.local_owned_only !== true || source.external_provider_execution_performed !== false || source.external_fallback_allowed !== false) {
    throw new Error("CODE_AI_COMPETITIVE_OWNED_LOCAL_ONLY_REQUIRED");
  }
  if (source.raw_model_output_persisted !== false || source.raw_reasoning_persisted !== false) {
    throw new Error("CODE_AI_COMPETITIVE_OWNED_RAW_OUTPUT_FORBIDDEN");
  }
  if (!SHA256.test(text(source.suite_sha256, 80)) || !SHA256.test(text(source.prompt_contract_sha256, 80))) {
    throw new Error("CODE_AI_COMPETITIVE_OWNED_CANONICAL_HASHES_REQUIRED");
  }
  if (suite_contract && text(source.suite_contract, 180) !== text(suite_contract, 180)) {
    throw new Error("CODE_AI_COMPETITIVE_OWNED_SUITE_CONTRACT_MISMATCH");
  }
  if (suite_sha256 && text(source.suite_sha256, 80).toLowerCase() !== text(suite_sha256, 80).toLowerCase()) {
    throw new Error("CODE_AI_COMPETITIVE_OWNED_SUITE_SHA256_MISMATCH");
  }
  if (prompt_contract && text(source.prompt_contract, 180) !== text(prompt_contract, 180)) {
    throw new Error("CODE_AI_COMPETITIVE_OWNED_PROMPT_CONTRACT_MISMATCH");
  }
  if (prompt_contract_sha256 && text(source.prompt_contract_sha256, 80).toLowerCase() !== text(prompt_contract_sha256, 80).toLowerCase()) {
    throw new Error("CODE_AI_COMPETITIVE_OWNED_PROMPT_SHA256_MISMATCH");
  }
  if (required.length && (caseIds.length !== required.length || caseIds.some((id, index) => id !== required[index]))) {
    throw new Error("CODE_AI_COMPETITIVE_OWNED_CANONICAL_CASE_SET_REQUIRED");
  }
  if (new Set(caseIds).size !== caseIds.length || observations.length !== caseIds.length || observations.length < 20) {
    throw new Error("CODE_AI_COMPETITIVE_OWNED_CASE_IDS_INVALID");
  }
  let recomputedCostTotal = 0;
  let recomputedCostCount = 0;
  for (const observation of observations) {
    if (typeof observation?.passed !== "boolean") {
      throw new Error("CODE_AI_COMPETITIVE_OWNED_CASE_PASS_STATUS_REQUIRED");
    }
    if (!Number.isFinite(Number(observation?.wall_ms)) || Number(observation.wall_ms) < 0) {
      throw new Error("CODE_AI_COMPETITIVE_OWNED_CASE_LATENCY_REQUIRED");
    }
    if (text(observation?.latency_measurement_source, 120) !== "RUNNER_MONOTONIC_CLOCK_V1") {
      throw new Error("CODE_AI_COMPETITIVE_OWNED_RUNNER_LATENCY_MEASUREMENT_REQUIRED");
    }
    if (observation?.passed === true) {
      const elapsedMs = Number(observation?.inference_elapsed_ms);
      const computeRate = Number(observation?.owned_compute_usd_per_hour);
      const supplierCost = Number(observation?.supplier_cost_usd);
      if (
        !Number.isFinite(elapsedMs) || elapsedMs < 0 ||
        !Number.isFinite(computeRate) || computeRate <= 0 ||
        !Number.isFinite(supplierCost) || supplierCost < 0 ||
        text(observation?.owned_compute_rate_source, 160) !== "OPERATOR_APPROVED_LOCAL_COMPUTE_RATE_V1" ||
        text(observation?.cost_measurement_source, 180) !== "RUNNER_RECOMPUTED_FROM_WORKER_ELAPSED_V1"
      ) {
        throw new Error("CODE_AI_COMPETITIVE_OWNED_COST_PROVENANCE_REQUIRED");
      }
      const expectedCost = Number(((elapsedMs / 3_600_000) * computeRate).toFixed(8));
      if (Math.abs(supplierCost - expectedCost) > 1e-8) {
        throw new Error("CODE_AI_COMPETITIVE_OWNED_COST_RECOMPUTATION_MISMATCH");
      }
      recomputedCostTotal += expectedCost;
      recomputedCostCount += 1;
    }
  }
  if (source?.summary?.passed === true) {
    const economics = object(source.economics);
    const total = Number(economics.estimated_supplier_cost_usd);
    if (
      recomputedCostCount !== observations.length ||
      !Number.isFinite(total) || total < 0 ||
      text(economics.cost_measurement_source, 180) !== "RUNNER_RECOMPUTED_FROM_WORKER_ELAPSED_V1" ||
      text(economics.owned_compute_rate_source, 160) !== "OPERATOR_APPROVED_LOCAL_COMPUTE_RATE_V1"
    ) {
      throw new Error("CODE_AI_COMPETITIVE_OWNED_ECONOMICS_REQUIRED");
    }
    const expectedTotal = Number(recomputedCostTotal.toFixed(8));
    if (Math.abs(total - expectedTotal) > 1e-8) {
      throw new Error("CODE_AI_COMPETITIVE_OWNED_ECONOMICS_RECOMPUTATION_MISMATCH");
    }
  }
  return {
    generated_at: new Date(generatedAt).toISOString(),
    case_ids: caseIds,
    observation_count: observations.length,
  };
}

export function attestCodeAICompetitiveOwnedReport(report, { env = process.env } = {}) {
  validateCodeAICompetitiveOwnedReportShape(report);
  const source = object(report);
  return {
    ...source,
    owned_attestation: {
      contract: CODE_AI_COMPETITIVE_OWNED_ATTESTATION_CONTRACT,
      algorithm: ALGORITHM,
      digest: digestFor(source, secretFrom(env)),
      server_only: true,
      domain: "OWNED_COMPETITIVE_EVIDENCE",
    },
  };
}

export function verifyCodeAICompetitiveOwnedReport(
  report,
  {
    env = process.env,
    suite_contract = null,
    suite_sha256 = null,
    prompt_contract = null,
    prompt_contract_sha256 = null,
    required_case_ids = null,
  } = {},
) {
  const source = object(report);
  validateCodeAICompetitiveOwnedReportShape(source, {
    suite_contract,
    suite_sha256,
    prompt_contract,
    prompt_contract_sha256,
    required_case_ids,
  });
  const attestation = object(source.owned_attestation);
  if (
    text(attestation.contract, 180) !== CODE_AI_COMPETITIVE_OWNED_ATTESTATION_CONTRACT ||
    text(attestation.algorithm, 80) !== ALGORITHM ||
    text(attestation.domain, 120) !== "OWNED_COMPETITIVE_EVIDENCE" ||
    attestation.server_only !== true
  ) {
    throw new Error("CODE_AI_COMPETITIVE_OWNED_ATTESTATION_REQUIRED");
  }
  const supplied = text(attestation.digest, 80);
  if (!SHA256.test(supplied)) throw new Error("CODE_AI_COMPETITIVE_OWNED_ATTESTATION_INVALID");
  const expected = digestFor(source, secretFrom(env));
  const suppliedBuffer = Buffer.from(supplied, "hex");
  const expectedBuffer = Buffer.from(expected, "hex");
  if (suppliedBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(suppliedBuffer, expectedBuffer)) {
    throw new Error("CODE_AI_COMPETITIVE_OWNED_ATTESTATION_INVALID");
  }
  return true;
}

export const CodeAICompetitiveOwnedAttestationRuntime = Object.freeze({
  contract: CODE_AI_COMPETITIVE_OWNED_ATTESTATION_CONTRACT,
  secret_env: SECRET_ENV,
  attest: attestCodeAICompetitiveOwnedReport,
  verify: verifyCodeAICompetitiveOwnedReport,
  validateShape: validateCodeAICompetitiveOwnedReportShape,
});

export default CodeAICompetitiveOwnedAttestationRuntime;
