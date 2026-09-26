import crypto from "node:crypto";

export const CODE_AI_COMPETITIVE_FULL_RUN_MANIFEST_CONTRACT =
  "AVANTIQO_CODE_COMPETITIVE_FULL_RUN_MANIFEST_V1";
export const CODE_AI_COMPETITIVE_FULL_RUN_ATTESTATION_CONTRACT =
  "AVANTIQO_CODE_COMPETITIVE_FULL_RUN_ATTESTATION_V1";

const ALGORITHM = "hmac-sha256";
const SECRET_ENV = "AVANTIQO_CODE_COMPETITIVE_FULL_RUN_ATTESTATION_SECRET";
const MIN_SECRET_BYTES = 32;
const SHA256 = /^[a-f0-9]{64}$/i;
const GIT_SHA = /^[a-f0-9]{40}$/i;
const RUN_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DOMAIN = "AVANTIQO_CODE_COMPETITIVE_FULL_RUN_EVIDENCE_V1\n";

function text(value, maximum = 8000) {
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
    throw new Error("CODE_AI_COMPETITIVE_FULL_RUN_ATTESTATION_SECRET_REQUIRED");
  }
  return secret;
}
function canonical(value) {
  if (value === null || value === undefined) return value ?? null;
  if (Array.isArray(value)) return value.map(canonical);
  if (typeof value !== "object") return value;
  return Object.fromEntries(
    Object.keys(value)
      .filter((key) => key !== "full_run_attestation")
      .sort()
      .map((key) => [key, canonical(value[key])]),
  );
}
function payloadJson(manifest) {
  return DOMAIN + JSON.stringify(canonical(object(manifest)));
}
function digestFor(manifest, secret) {
  return crypto.createHmac("sha256", secret).update(payloadJson(manifest), "utf8").digest("hex");
}

export function validateCodeAICompetitiveFullRunManifestShape(manifest) {
  const source = object(manifest);
  const startedAtRaw = String(source.started_at ?? "");
  const completedAtRaw = String(source.completed_at ?? "");
  const startedAt = Date.parse(startedAtRaw);
  const completedAt = Date.parse(completedAtRaw);
  const providers = list(source.providers).map((value) => text(value, 80)).filter(Boolean);
  const models = object(source.models);
  const artifacts = list(source.artifacts);

  if (text(source.contract, 180) !== CODE_AI_COMPETITIVE_FULL_RUN_MANIFEST_CONTRACT) {
    throw new Error("CODE_AI_COMPETITIVE_FULL_RUN_MANIFEST_CONTRACT_INVALID");
  }
  if (!RUN_ID.test(text(source.orchestrator_run_id, 80))) {
    throw new Error("CODE_AI_COMPETITIVE_FULL_RUN_ID_REQUIRED");
  }
  if (!Number.isFinite(startedAt) || !Number.isFinite(completedAt) || completedAt < startedAt) {
    throw new Error("CODE_AI_COMPETITIVE_FULL_RUN_TIME_RANGE_INVALID");
  }
  if (startedAtRaw !== new Date(startedAt).toISOString() || completedAtRaw !== new Date(completedAt).toISOString()) {
    throw new Error("CODE_AI_COMPETITIVE_FULL_RUN_CANONICAL_TIMESTAMPS_REQUIRED");
  }
  if (!GIT_SHA.test(text(source.runner_source_commit, 80))) {
    throw new Error("CODE_AI_COMPETITIVE_FULL_RUN_SOURCE_COMMIT_REQUIRED");
  }
  if (text(source.runner_ref, 80) !== "main" || source.runner_repository_clean !== true || source.source_stable_for_entire_run !== true) {
    throw new Error("CODE_AI_COMPETITIVE_FULL_RUN_CLEAN_STABLE_MAIN_REQUIRED");
  }
  if (!SHA256.test(text(source.configuration_sha256, 80))) {
    throw new Error("CODE_AI_COMPETITIVE_FULL_RUN_CONFIGURATION_SHA_REQUIRED");
  }
  if (providers.length < 2 || new Set(providers).size !== providers.length) {
    throw new Error("CODE_AI_COMPETITIVE_FULL_RUN_PROVIDER_SET_INVALID");
  }
  for (const provider of providers) {
    if (!text(models[provider], 240)) throw new Error("CODE_AI_COMPETITIVE_FULL_RUN_MODEL_BINDING_REQUIRED");
  }
  if (artifacts.length < 5) throw new Error("CODE_AI_COMPETITIVE_FULL_RUN_ARTIFACTS_REQUIRED");
  for (const artifact of artifacts) {
    if (!text(artifact?.path, 4000) || !SHA256.test(text(artifact?.sha256, 80)) || !(Number(artifact?.bytes) > 0)) {
      throw new Error("CODE_AI_COMPETITIVE_FULL_RUN_ARTIFACT_INVALID");
    }
    if (!Number.isFinite(Date.parse(text(artifact?.generated_at, 120)))) {
      throw new Error("CODE_AI_COMPETITIVE_FULL_RUN_ARTIFACT_TIME_REQUIRED");
    }
  }
  if (source.external_provider_execution_performed !== true) {
    throw new Error("CODE_AI_COMPETITIVE_FULL_RUN_REFERENCE_EXECUTION_REQUIRED");
  }
  if (typeof source.competitive_certified !== "boolean") {
    throw new Error("CODE_AI_COMPETITIVE_FULL_RUN_CERTIFICATION_STATUS_REQUIRED");
  }
  if (source.production_deploy_performed !== false) {
    throw new Error("CODE_AI_COMPETITIVE_FULL_RUN_PRODUCTION_DEPLOY_FORBIDDEN");
  }
  return { artifact_count: artifacts.length, provider_count: providers.length };
}

export function attestCodeAICompetitiveFullRunManifest(manifest, { env = process.env } = {}) {
  validateCodeAICompetitiveFullRunManifestShape(manifest);
  const source = object(manifest);
  return {
    ...source,
    full_run_attestation: {
      contract: CODE_AI_COMPETITIVE_FULL_RUN_ATTESTATION_CONTRACT,
      algorithm: ALGORITHM,
      digest: digestFor(source, secretFrom(env)),
      server_only: true,
    },
  };
}

export function verifyCodeAICompetitiveFullRunManifest(manifest, { env = process.env } = {}) {
  const source = object(manifest);
  const attestation = object(source.full_run_attestation);
  validateCodeAICompetitiveFullRunManifestShape(source);
  if (
    text(attestation.contract, 180) !== CODE_AI_COMPETITIVE_FULL_RUN_ATTESTATION_CONTRACT ||
    text(attestation.algorithm, 80) !== ALGORITHM ||
    attestation.server_only !== true
  ) {
    throw new Error("CODE_AI_COMPETITIVE_FULL_RUN_ATTESTATION_REQUIRED");
  }
  const supplied = text(attestation.digest, 80);
  if (!SHA256.test(supplied)) throw new Error("CODE_AI_COMPETITIVE_FULL_RUN_ATTESTATION_INVALID");
  const expected = digestFor(source, secretFrom(env));
  const suppliedBuffer = Buffer.from(supplied, "hex");
  const expectedBuffer = Buffer.from(expected, "hex");
  if (suppliedBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(suppliedBuffer, expectedBuffer)) {
    throw new Error("CODE_AI_COMPETITIVE_FULL_RUN_ATTESTATION_INVALID");
  }
  return true;
}

export const CodeAICompetitiveFullRunAttestationRuntime = Object.freeze({
  manifest_contract: CODE_AI_COMPETITIVE_FULL_RUN_MANIFEST_CONTRACT,
  attestation_contract: CODE_AI_COMPETITIVE_FULL_RUN_ATTESTATION_CONTRACT,
  secret_env: SECRET_ENV,
  attest: attestCodeAICompetitiveFullRunManifest,
  verify: verifyCodeAICompetitiveFullRunManifest,
  validateShape: validateCodeAICompetitiveFullRunManifestShape,
});

export default CodeAICompetitiveFullRunAttestationRuntime;
