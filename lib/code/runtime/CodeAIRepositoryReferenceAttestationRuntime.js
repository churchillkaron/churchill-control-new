import crypto from "node:crypto";

export const CODE_AI_REPOSITORY_REFERENCE_ATTESTATION_CONTRACT =
  "AVANTIQO_CODE_REPOSITORY_REFERENCE_ATTESTATION_V1";
export const CODE_AI_REPOSITORY_REFERENCE_RUNNER_CONTRACT =
  "AVANTIQO_CODE_EXECUTABLE_REPOSITORY_REFERENCE_RUNNER_V1";

const ALGORITHM = "hmac-sha256";
const SECRET_ENV = "AVANTIQO_CODE_REPOSITORY_REFERENCE_ATTESTATION_SECRET";
const MIN_SECRET_BYTES = 32;
const SHA256 = /^[a-f0-9]{64}$/i;

function text(value, maximum = 4000) {
  return String(value ?? "").trim().slice(0, maximum);
}
function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}
function secretFrom(env) {
  const secret = String(env?.[SECRET_ENV] ?? "");
  if (Buffer.byteLength(secret, "utf8") < MIN_SECRET_BYTES) {
    throw new Error("CODE_AI_REPOSITORY_REFERENCE_ATTESTATION_SECRET_REQUIRED");
  }
  return secret;
}
function canonical(value) {
  if (value === null || value === undefined) return value ?? null;
  if (Array.isArray(value)) return value.map(canonical);
  if (typeof value !== "object") return value;
  return Object.fromEntries(
    Object.keys(value)
      .filter((key) => key !== "repository_reference_attestation")
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

export function validateCodeAIRepositoryReferenceReportShape(report) {
  const source = object(report);
  const provider = text(source.provider || source?.model?.provider, 160);
  const model = text(source?.model?.product_model || source.model, 240);
  if (text(source.contract, 180) !== CODE_AI_REPOSITORY_REFERENCE_RUNNER_CONTRACT) {
    throw new Error("CODE_AI_REPOSITORY_REFERENCE_RUNNER_CONTRACT_INVALID");
  }
  if (source.provider_execution_performed !== true || !provider || !model) {
    throw new Error("CODE_AI_REPOSITORY_REFERENCE_PROVIDER_EXECUTION_REQUIRED");
  }
  if (source.benchmark_only !== true || source.runtime_provider_effect !== "NONE") {
    throw new Error("CODE_AI_REPOSITORY_REFERENCE_BENCHMARK_ONLY_REQUIRED");
  }
  if (source.raw_provider_output_persisted !== false || source.production_deploy_performed !== false) {
    throw new Error("CODE_AI_REPOSITORY_REFERENCE_PERSISTENCE_OR_DEPLOY_FORBIDDEN");
  }
  if (!Array.isArray(source.observations) || source.observations.length === 0) {
    throw new Error("CODE_AI_REPOSITORY_REFERENCE_OBSERVATIONS_REQUIRED");
  }
  return { provider, model, observation_count: source.observations.length };
}

export function attestCodeAIRepositoryReferenceReport(report, { env = process.env } = {}) {
  validateCodeAIRepositoryReferenceReportShape(report);
  const source = object(report);
  return {
    ...source,
    repository_reference_attestation: {
      contract: CODE_AI_REPOSITORY_REFERENCE_ATTESTATION_CONTRACT,
      algorithm: ALGORITHM,
      digest: digestFor(source, secretFrom(env)),
      server_only: true,
    },
  };
}
export function verifyCodeAIRepositoryReferenceReport(report, { env = process.env } = {}) {
  const source = object(report);
  const attestation = object(source.repository_reference_attestation);
  validateCodeAIRepositoryReferenceReportShape(source);
  if (
    text(attestation.contract, 180) !== CODE_AI_REPOSITORY_REFERENCE_ATTESTATION_CONTRACT ||
    text(attestation.algorithm, 80) !== ALGORITHM ||
    attestation.server_only !== true
  ) {
    throw new Error("CODE_AI_REPOSITORY_REFERENCE_ATTESTATION_REQUIRED");
  }
  const supplied = text(attestation.digest, 80);
  if (!SHA256.test(supplied)) throw new Error("CODE_AI_REPOSITORY_REFERENCE_ATTESTATION_INVALID");
  const expected = digestFor(source, secretFrom(env));
  const suppliedBuffer = Buffer.from(supplied, "hex");
  const expectedBuffer = Buffer.from(expected, "hex");
  if (
    suppliedBuffer.length !== expectedBuffer.length ||
    !crypto.timingSafeEqual(suppliedBuffer, expectedBuffer)
  ) {
    throw new Error("CODE_AI_REPOSITORY_REFERENCE_ATTESTATION_INVALID");
  }
  return true;
}
export const CodeAIRepositoryReferenceAttestationRuntime = Object.freeze({
  attestation_contract: CODE_AI_REPOSITORY_REFERENCE_ATTESTATION_CONTRACT,
  runner_contract: CODE_AI_REPOSITORY_REFERENCE_RUNNER_CONTRACT,
  secret_env: SECRET_ENV,
  attest: attestCodeAIRepositoryReferenceReport,
  verify: verifyCodeAIRepositoryReferenceReport,
  validateShape: validateCodeAIRepositoryReferenceReportShape,
});

export default CodeAIRepositoryReferenceAttestationRuntime;
