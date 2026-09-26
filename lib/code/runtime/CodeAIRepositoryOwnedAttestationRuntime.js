import crypto from "node:crypto";

export const CODE_AI_REPOSITORY_OWNED_ATTESTATION_CONTRACT =
  "AVANTIQO_CODE_REPOSITORY_OWNED_ATTESTATION_V1";
export const CODE_AI_REPOSITORY_OWNED_RUNNER_CONTRACT =
  "AVANTIQO_CODE_EXECUTABLE_REPOSITORY_LOCAL_RUNNER_V1";

const ALGORITHM = "hmac-sha256";
const SECRET_ENV = "AVANTIQO_CODE_REPOSITORY_OWNED_ATTESTATION_SECRET";
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
    throw new Error("CODE_AI_REPOSITORY_OWNED_ATTESTATION_SECRET_REQUIRED");
  }
  return secret;
}
function canonical(value) {
  if (value === null || value === undefined) return value ?? null;
  if (Array.isArray(value)) return value.map(canonical);
  if (typeof value !== "object") return value;
  return Object.fromEntries(
    Object.keys(value)
      .filter((key) => key !== "repository_owned_attestation")
      .sort()
      .map((key) => [key, canonical(value[key])]),
  );
}
function digestFor(report, secret) {
  return crypto.createHmac("sha256", secret)
    .update(JSON.stringify(canonical(object(report))), "utf8")
    .digest("hex");
}

export function validateCodeAIRepositoryOwnedReportShape(report) {
  const source = object(report);
  if (text(source.contract, 180) !== CODE_AI_REPOSITORY_OWNED_RUNNER_CONTRACT) {
    throw new Error("CODE_AI_REPOSITORY_OWNED_RUNNER_CONTRACT_INVALID");
  }
  if (source.provider_execution_performed !== false || source.local_compute_only !== true) {
    throw new Error("CODE_AI_REPOSITORY_OWNED_LOCAL_COMPUTE_REQUIRED");
  }
  if (source.commit_performed !== false || source.production_deploy_performed !== false) {
    throw new Error("CODE_AI_REPOSITORY_OWNED_MUTATION_AUTHORITY_FORBIDDEN");
  }
  if (!Array.isArray(source.observations) || source.observations.length === 0) {
    throw new Error("CODE_AI_REPOSITORY_OWNED_OBSERVATIONS_REQUIRED");
  }
  return { observation_count: source.observations.length };
}

export function attestCodeAIRepositoryOwnedReport(report, { env = process.env } = {}) {
  validateCodeAIRepositoryOwnedReportShape(report);
  const source = object(report);
  return {
    ...source,
    repository_owned_attestation: {
      contract: CODE_AI_REPOSITORY_OWNED_ATTESTATION_CONTRACT,
      algorithm: ALGORITHM,
      digest: digestFor(source, secretFrom(env)),
      server_only: true,
    },
  };
}
export function verifyCodeAIRepositoryOwnedReport(report, { env = process.env } = {}) {
  const source = object(report);
  const attestation = object(source.repository_owned_attestation);
  validateCodeAIRepositoryOwnedReportShape(source);
  if (
    text(attestation.contract, 180) !== CODE_AI_REPOSITORY_OWNED_ATTESTATION_CONTRACT ||
    text(attestation.algorithm, 80) !== ALGORITHM ||
    attestation.server_only !== true
  ) {
    throw new Error("CODE_AI_REPOSITORY_OWNED_ATTESTATION_REQUIRED");
  }
  const supplied = text(attestation.digest, 80);
  if (!SHA256.test(supplied)) throw new Error("CODE_AI_REPOSITORY_OWNED_ATTESTATION_INVALID");
  const expected = digestFor(source, secretFrom(env));
  const suppliedBuffer = Buffer.from(supplied, "hex");
  const expectedBuffer = Buffer.from(expected, "hex");
  if (
    suppliedBuffer.length !== expectedBuffer.length ||
    !crypto.timingSafeEqual(suppliedBuffer, expectedBuffer)
  ) {
    throw new Error("CODE_AI_REPOSITORY_OWNED_ATTESTATION_INVALID");
  }
  return true;
}
export const CodeAIRepositoryOwnedAttestationRuntime = Object.freeze({
  attestation_contract: CODE_AI_REPOSITORY_OWNED_ATTESTATION_CONTRACT,
  runner_contract: CODE_AI_REPOSITORY_OWNED_RUNNER_CONTRACT,
  secret_env: SECRET_ENV,
  attest: attestCodeAIRepositoryOwnedReport,
  verify: verifyCodeAIRepositoryOwnedReport,
  validateShape: validateCodeAIRepositoryOwnedReportShape,
});

export default CodeAIRepositoryOwnedAttestationRuntime;
