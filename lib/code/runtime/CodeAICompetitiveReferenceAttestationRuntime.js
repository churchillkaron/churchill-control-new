import crypto from "node:crypto";

export const CODE_AI_COMPETITIVE_REFERENCE_REPORT_CONTRACT =
  "AVANTIQO_CODE_COMPETITIVE_REFERENCE_REPORT_V1";
export const CODE_AI_COMPETITIVE_REFERENCE_ATTESTATION_CONTRACT =
  "AVANTIQO_CODE_COMPETITIVE_REFERENCE_ATTESTATION_V1";
export const CODE_AI_COMPETITIVE_REFERENCE_RUNNER_CONTRACT =
  "AVANTIQO_CODE_COMPETITIVE_REFERENCE_RUNNER_V1";

const ALGORITHM = "hmac-sha256";
const SECRET_ENV = "AVANTIQO_CODE_COMPETITIVE_REFERENCE_ATTESTATION_SECRET";
const MIN_SECRET_BYTES = 32;
const SHA256 = /^[a-f0-9]{64}$/i;

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
    throw new Error("CODE_AI_COMPETITIVE_REFERENCE_ATTESTATION_SECRET_REQUIRED");
  }
  return secret;
}
function canonical(value) {
  if (value === null || value === undefined) return value ?? null;
  if (Array.isArray(value)) return value.map(canonical);
  if (typeof value !== "object") return value;
  return Object.fromEntries(
    Object.keys(value)
      .filter((key) => key !== "attestation")
      .sort()
      .map((key) => [key, canonical(value[key])]),
  );
}
function payloadJson(report) {
  return JSON.stringify(canonical(object(report)));
}
function digestFor(report, secret) {
  return crypto.createHmac("sha256", secret).update(payloadJson(report), "utf8").digest("hex");
}

export function validateCodeAICompetitiveReferenceReportShape(
  report,
  { suite_contract = null, suite_sha256 = null, required_case_ids = null } = {},
) {
  const source = object(report);
  const provider = text(source.provider || source?.model?.provider, 160);
  const model = text(source.model?.product_model || source.model?.runtime_model || source.model, 240);
  const observations = list(source.observations);
  const generatedAt = Date.parse(text(source.generated_at || source.measured_at, 120));
  const caseIds = observations.map((item) => text(item?.case_id, 160)).filter(Boolean).sort();
  const required = list(required_case_ids).map((item) => text(item, 160)).filter(Boolean).sort();

  if (text(source.contract, 180) !== CODE_AI_COMPETITIVE_REFERENCE_REPORT_CONTRACT) {
    throw new Error("CODE_AI_COMPETITIVE_REFERENCE_REPORT_CONTRACT_INVALID");
  }
  if (text(source.generator_contract, 180) !== CODE_AI_COMPETITIVE_REFERENCE_RUNNER_CONTRACT) {
    throw new Error("CODE_AI_COMPETITIVE_REFERENCE_RUNNER_CONTRACT_INVALID");
  }
  if (text(source.measurement_mode, 120) !== "LIVE_REFERENCE_PROVIDER") {
    throw new Error("CODE_AI_COMPETITIVE_REFERENCE_LIVE_MEASUREMENT_REQUIRED");
  }
  if (source.provider_execution_performed !== true) {
    throw new Error("CODE_AI_COMPETITIVE_REFERENCE_PROVIDER_EXECUTION_REQUIRED");
  }
  if (!provider || provider === "unknown" || !model || model === "unknown") {
    throw new Error("CODE_AI_COMPETITIVE_REFERENCE_PROVIDER_MODEL_REQUIRED");
  }
  if (!Number.isFinite(generatedAt)) {
    throw new Error("CODE_AI_COMPETITIVE_REFERENCE_MEASURED_AT_REQUIRED");
  }
  if (source.customer_private_content_included !== false || source.raw_customer_content_included !== false) {
    throw new Error("CODE_AI_COMPETITIVE_REFERENCE_CUSTOMER_CONTENT_FORBIDDEN");
  }
  if (source.raw_reasoning_persisted !== false) {
    throw new Error("CODE_AI_COMPETITIVE_REFERENCE_RAW_REASONING_FORBIDDEN");
  }
  if (!SHA256.test(text(source.suite_sha256, 80))) {
    throw new Error("CODE_AI_COMPETITIVE_REFERENCE_SUITE_SHA256_REQUIRED");
  }
  if (suite_contract && text(source.suite_contract, 180) !== text(suite_contract, 180)) {
    throw new Error("CODE_AI_COMPETITIVE_REFERENCE_SUITE_CONTRACT_MISMATCH");
  }
  if (suite_sha256 && text(source.suite_sha256, 80).toLowerCase() !== text(suite_sha256, 80).toLowerCase()) {
    throw new Error("CODE_AI_COMPETITIVE_REFERENCE_SUITE_SHA256_MISMATCH");
  }
  if (required.length && (caseIds.length !== required.length || caseIds.some((id, index) => id !== required[index]))) {
    throw new Error("CODE_AI_COMPETITIVE_REFERENCE_CANONICAL_CASE_SET_REQUIRED");
  }
  if (new Set(caseIds).size !== caseIds.length || observations.length !== caseIds.length) {
    throw new Error("CODE_AI_COMPETITIVE_REFERENCE_CASE_IDS_INVALID");
  }
  for (const observation of observations) {
    if (typeof observation?.passed !== "boolean") {
      throw new Error("CODE_AI_COMPETITIVE_REFERENCE_CASE_PASS_STATUS_REQUIRED");
    }
    if (!Number.isFinite(Number(observation?.wall_ms)) || Number(observation.wall_ms) < 0) {
      throw new Error("CODE_AI_COMPETITIVE_REFERENCE_CASE_LATENCY_REQUIRED");
    }
  }
  return {
    provider,
    model,
    generated_at: new Date(generatedAt).toISOString(),
    case_ids: caseIds,
    observation_count: observations.length,
  };
}

export function attestCodeAICompetitiveReferenceReport(report, { env = process.env } = {}) {
  validateCodeAICompetitiveReferenceReportShape(report);
  const source = object(report);
  const digest = digestFor(source, secretFrom(env));
  return {
    ...source,
    attestation: {
      contract: CODE_AI_COMPETITIVE_REFERENCE_ATTESTATION_CONTRACT,
      algorithm: ALGORITHM,
      digest,
      server_only: true,
    },
  };
}

export function verifyCodeAICompetitiveReferenceReport(
  report,
  {
    env = process.env,
    suite_contract = null,
    suite_sha256 = null,
    required_case_ids = null,
  } = {},
) {
  const source = object(report);
  const attestation = object(source.attestation);
  validateCodeAICompetitiveReferenceReportShape(source, {
    suite_contract,
    suite_sha256,
    required_case_ids,
  });
  if (
    text(attestation.contract, 180) !== CODE_AI_COMPETITIVE_REFERENCE_ATTESTATION_CONTRACT ||
    text(attestation.algorithm, 80) !== ALGORITHM ||
    attestation.server_only !== true
  ) {
    throw new Error("CODE_AI_COMPETITIVE_REFERENCE_ATTESTATION_REQUIRED");
  }
  const supplied = text(attestation.digest, 80);
  if (!SHA256.test(supplied)) {
    throw new Error("CODE_AI_COMPETITIVE_REFERENCE_ATTESTATION_INVALID");
  }
  const expected = digestFor(source, secretFrom(env));
  const suppliedBuffer = Buffer.from(supplied, "hex");
  const expectedBuffer = Buffer.from(expected, "hex");
  if (
    suppliedBuffer.length !== expectedBuffer.length ||
    !crypto.timingSafeEqual(suppliedBuffer, expectedBuffer)
  ) {
    throw new Error("CODE_AI_COMPETITIVE_REFERENCE_ATTESTATION_INVALID");
  }
  return true;
}

export const CodeAICompetitiveReferenceAttestationRuntime = Object.freeze({
  report_contract: CODE_AI_COMPETITIVE_REFERENCE_REPORT_CONTRACT,
  attestation_contract: CODE_AI_COMPETITIVE_REFERENCE_ATTESTATION_CONTRACT,
  runner_contract: CODE_AI_COMPETITIVE_REFERENCE_RUNNER_CONTRACT,
  secret_env: SECRET_ENV,
  attest: attestCodeAICompetitiveReferenceReport,
  verify: verifyCodeAICompetitiveReferenceReport,
  validateShape: validateCodeAICompetitiveReferenceReportShape,
});

export default CodeAICompetitiveReferenceAttestationRuntime;
