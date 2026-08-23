import crypto from "node:crypto";

const CONTRACT = "AVANTIQO_CODE_MISSION_ATTESTATION_V1";
const ALGORITHM = "hmac-sha256";
const SECRET_ENV = "AVANTIQO_CODE_MISSION_ATTESTATION_SECRET";
const MIN_SECRET_BYTES = 32;

function text(value) {
  return String(value ?? "").trim();
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function secretFrom(env) {
  const secret = String(env?.[SECRET_ENV] ?? "");
  if (Buffer.byteLength(secret, "utf8") < MIN_SECRET_BYTES) {
    throw new Error("AVANTIQO_CODE_MISSION_ATTESTATION_SECRET_REQUIRED");
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

function digestFor(state, secret) {
  const payload = JSON.stringify(canonical(object(state)));
  return crypto.createHmac("sha256", secret).update(payload, "utf8").digest("hex");
}

export function attestCodeMissionState(state, { env = process.env } = {}) {
  const secret = secretFrom(env);
  const source = object(state);
  const digest = digestFor(source, secret);
  return {
    ...source,
    attestation: {
      contract: CONTRACT,
      algorithm: ALGORITHM,
      digest,
    },
  };
}

export function verifyCodeMissionStateAttestation(state, { env = process.env } = {}) {
  const source = object(state);
  const attestation = object(source.attestation);
  if (text(attestation.contract) !== CONTRACT || text(attestation.algorithm) !== ALGORITHM) {
    throw new Error("CODE_AI_MISSION_ATTESTATION_REQUIRED");
  }
  const supplied = text(attestation.digest);
  if (!/^[a-f0-9]{64}$/i.test(supplied)) throw new Error("CODE_AI_MISSION_ATTESTATION_INVALID");
  const expected = digestFor(source, secretFrom(env));
  const suppliedBuffer = Buffer.from(supplied, "hex");
  const expectedBuffer = Buffer.from(expected, "hex");
  if (
    suppliedBuffer.length !== expectedBuffer.length ||
    !crypto.timingSafeEqual(suppliedBuffer, expectedBuffer)
  ) {
    throw new Error("CODE_AI_MISSION_ATTESTATION_INVALID");
  }
  return true;
}

export const CodeMissionAttestationRuntime = Object.freeze({
  contract: CONTRACT,
  attest: attestCodeMissionState,
  verify: verifyCodeMissionStateAttestation,
});
