import { createHmac, createSecretKey, timingSafeEqual } from "node:crypto";

export const AVANTIQO_BUSINESS_DIAGNOSIS_PROOF_AUTHENTICITY_CONTRACT =
  "AVANTIQO_BUSINESS_DIAGNOSIS_PROOF_AUTHENTICITY_V1";
export const AVANTIQO_BUSINESS_DIAGNOSIS_PROOF_AUTHENTICITY_ALGORITHM =
  "HMAC-SHA256";

const ACTIVE_KEY_ID_ENV = "AVANTIQO_MISSION_OUTCOME_AUTH_ACTIVE_KEY_ID";
const KEYRING_JSON_ENV = "AVANTIQO_MISSION_OUTCOME_AUTH_KEYRING_JSON";
const AUTHENTICITY_REQUIRED_ENV = "AVANTIQO_BUSINESS_DIAGNOSIS_AUTHENTICITY_REQUIRED";
const SCOPE_REQUIRED_ENV = "AVANTIQO_BUSINESS_DIAGNOSIS_SCOPE_REQUIRED";
const KEY_ID_RE = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,79}$/;
const KEY_HEX_RE = /^(?:[A-Fa-f0-9]{64}|[A-Fa-f0-9]{128})$/;
const MAC_HEX_RE = /^[A-Fa-f0-9]{64}$/;
const MAX_KEYS = 16;

function text(value, limit = 12000) {
  return String(value ?? "").trim().slice(0, limit);
}


function authenticityRequired(env = process.env) {
  return text(env?.[AUTHENTICITY_REQUIRED_ENV], 20).toLowerCase() === "true";
}


function scopeRequired(env = process.env) {
  return text(env?.[SCOPE_REQUIRED_ENV], 20).toLowerCase() === "true";
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function parseKeyring({ requireActive = false, env = process.env } = {}) {
  const raw = text(env?.[KEYRING_JSON_ENV], 32000);
  const activeKeyId = text(env?.[ACTIVE_KEY_ID_ENV], 80);
  if (!raw) return { valid: false, reason: "DIAGNOSIS_AUTHENTICITY_KEYRING_REQUIRED", active_key_id: activeKeyId || null, keys: new Map() };
  let parsed;
  try { parsed = JSON.parse(raw); } catch { return { valid: false, reason: "DIAGNOSIS_AUTHENTICITY_KEYRING_JSON_INVALID", active_key_id: activeKeyId || null, keys: new Map() }; }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return { valid: false, reason: "DIAGNOSIS_AUTHENTICITY_KEYRING_OBJECT_REQUIRED", active_key_id: activeKeyId || null, keys: new Map() };
  const entries = Object.entries(parsed);
  if (!entries.length || entries.length > MAX_KEYS) return { valid: false, reason: entries.length ? "DIAGNOSIS_AUTHENTICITY_KEYRING_TOO_LARGE" : "DIAGNOSIS_AUTHENTICITY_KEYRING_EMPTY", active_key_id: activeKeyId || null, keys: new Map() };
  const keys = new Map();
  for (const [rawId, rawSecret] of entries) {
    const id = text(rawId, 80);
    const hex = text(rawSecret, 128).toLowerCase();
    if (!KEY_ID_RE.test(id)) return { valid: false, reason: "DIAGNOSIS_AUTHENTICITY_KEY_ID_INVALID", active_key_id: activeKeyId || null, keys: new Map() };
    if (!KEY_HEX_RE.test(hex)) return { valid: false, reason: "DIAGNOSIS_AUTHENTICITY_KEY_MUST_BE_256_OR_512_BIT_HEX", active_key_id: activeKeyId || null, keys: new Map() };
    keys.set(id, createSecretKey(Buffer.from(hex, "hex")));
  }
  if (requireActive && (!KEY_ID_RE.test(activeKeyId) || !keys.has(activeKeyId))) {
    return { valid: false, reason: !KEY_ID_RE.test(activeKeyId) ? "DIAGNOSIS_AUTHENTICITY_ACTIVE_KEY_ID_REQUIRED" : "DIAGNOSIS_AUTHENTICITY_ACTIVE_KEY_NOT_IN_KEYRING", active_key_id: activeKeyId || null, keys };
  }
  return { valid: true, reason: null, active_key_id: activeKeyId || null, keys };
}

function authenticityPayload(proof = {}) {
  return {
    receipt_contract: text(proof?.receipt_contract, 160) || null,
    receipt_fingerprint: text(proof?.receipt_fingerprint, 128) || null,
    audit_projection_contract: text(proof?.audit_projection_contract, 160) || null,
    audit_projection_fingerprint: text(proof?.audit_projection_fingerprint, 128) || null,
    answer_content_fingerprint: text(proof?.answer_content_fingerprint, 128) || null,
    scope_organization_id: text(proof?.scope_organization_id, 160) || null,
    scope_conversation_id: text(proof?.scope_conversation_id, 160) || null,
    scope_entity_id: text(proof?.scope_entity_id, 160) || null,
  };
}

function mac(key, proof) {
  return createHmac("sha256", key)
    .update(`${AVANTIQO_BUSINESS_DIAGNOSIS_PROOF_AUTHENTICITY_CONTRACT}\u0000diagnosis-proof\u0000`, "utf8")
    .update(stableJson(authenticityPayload(proof)), "utf8")
    .digest("hex");
}

function safeEqualHex(left, right) {
  const a = text(left, 64).toLowerCase();
  const b = text(right, 64).toLowerCase();
  if (!MAC_HEX_RE.test(a) || !MAC_HEX_RE.test(b)) return false;
  const ab = Buffer.from(a, "hex");
  const bb = Buffer.from(b, "hex");
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

export function getBusinessDiagnosisProofAuthenticityStatus({ env = process.env, require_active = false } = {}) {
  const required = authenticityRequired(env);
  const configuration = parseKeyring({ requireActive: require_active === true || required, env });
  return {
    required,
    scope_required: scopeRequired(env),
    ready: !required || configuration.valid,
    available: configuration.valid,
    reason: configuration.reason,
    active_key_id: configuration.active_key_id,
    key_ids: [...configuration.keys.keys()].sort(),
    server_only_keyring_required: true,
    client_exposure_allowed: false,
    database_stored_secret_allowed: false,
    key_rotation_supported: true,
  };
}

export function sealBusinessDiagnosisProofAuthenticity(proof = {}, { env = process.env } = {}) {
  const configuration = parseKeyring({ requireActive: true, env });
  if (!configuration.valid) {
    return { sealed: false, status: "AUTHENTICITY_NOT_AVAILABLE", reason: configuration.reason, proof: { ...proof } };
  }
  const keyId = configuration.active_key_id;
  const sealed = {
    ...proof,
    authenticity_contract: AVANTIQO_BUSINESS_DIAGNOSIS_PROOF_AUTHENTICITY_CONTRACT,
    authenticity_algorithm: AVANTIQO_BUSINESS_DIAGNOSIS_PROOF_AUTHENTICITY_ALGORITHM,
    authenticity_key_id: keyId,
  };
  sealed.authenticity_mac = mac(configuration.keys.get(keyId), sealed);
  return { sealed: true, status: "AUTHENTICITY_SEALED", reason: null, proof: sealed };
}

export function verifyBusinessDiagnosisProofAuthenticity(proof = {}, { env = process.env } = {}) {
  const contract = text(proof?.authenticity_contract, 180);
  const algorithm = text(proof?.authenticity_algorithm, 40);
  const keyId = text(proof?.authenticity_key_id, 80);
  const suppliedMac = text(proof?.authenticity_mac, 64).toLowerCase();
  if (!contract && !algorithm && !keyId && !suppliedMac) {
    return { status: "AUTHENTICITY_NOT_AVAILABLE", verified: false, authenticated: false };
  }
  if (contract !== AVANTIQO_BUSINESS_DIAGNOSIS_PROOF_AUTHENTICITY_CONTRACT || algorithm !== AVANTIQO_BUSINESS_DIAGNOSIS_PROOF_AUTHENTICITY_ALGORITHM) {
    return { status: "AUTHENTICITY_FORMAT_INVALID", verified: false, authenticated: false };
  }
  const configuration = parseKeyring({ requireActive: false, env });
  if (!configuration.valid) return { status: "AUTHENTICITY_KEYRING_UNAVAILABLE", verified: false, authenticated: false, reason: configuration.reason };
  if (!KEY_ID_RE.test(keyId) || !MAC_HEX_RE.test(suppliedMac)) return { status: "AUTHENTICITY_FORMAT_INVALID", verified: false, authenticated: false };
  const key = configuration.keys.get(keyId);
  if (!key) return { status: "AUTHENTICITY_KEY_UNKNOWN", verified: false, authenticated: false, key_id: keyId };
  const expected = mac(key, proof);
  const verified = safeEqualHex(suppliedMac, expected);
  return { status: verified ? "AUTHENTICATED" : "AUTHENTICITY_MISMATCH", verified, authenticated: verified, key_id: keyId };
}


export function businessDiagnosisProofAuthenticityAcceptable(verification = {}, { env = process.env } = {}) {
  if (verification?.status === "AUTHENTICATED") return true;
  if (authenticityRequired(env)) return false;
  return verification?.status === "AUTHENTICITY_NOT_AVAILABLE";
}



export function verifyBusinessDiagnosisProofScope(proof = {}, { organization_id = null, conversation_id = null, entity_id = null } = {}) {
  const storedOrganization = text(proof?.scope_organization_id, 160) || null;
  const storedConversation = text(proof?.scope_conversation_id, 160) || null;
  const storedEntity = text(proof?.scope_entity_id, 160) || null;
  const expectedOrganization = text(organization_id, 160) || null;
  const expectedConversation = text(conversation_id, 160) || null;
  const expectedEntity = text(entity_id, 160) || null;
  if (!storedOrganization && !storedConversation && !storedEntity) {
    return { status: "SCOPE_NOT_BOUND", verified: true, legacy: true };
  }
  if (!storedOrganization || !storedConversation) {
    return { status: "SCOPE_INCOMPLETE", verified: false, legacy: false };
  }
  if (expectedOrganization && storedOrganization !== expectedOrganization) {
    return { status: "SCOPE_ORGANIZATION_MISMATCH", verified: false, legacy: false };
  }
  if (expectedConversation && storedConversation !== expectedConversation) {
    return { status: "SCOPE_CONVERSATION_MISMATCH", verified: false, legacy: false };
  }
  if (expectedEntity && storedEntity && storedEntity !== expectedEntity) {
    return { status: "SCOPE_ENTITY_MISMATCH", verified: false, legacy: false };
  }
  if (expectedEntity && !storedEntity) {
    return { status: "SCOPE_ENTITY_MISSING", verified: false, legacy: false };
  }
  return { status: "SCOPE_VERIFIED", verified: true, legacy: false };
}


export function businessDiagnosisProofScopeAcceptable(verification = {}, { env = process.env } = {}) {
  if (verification?.status === "SCOPE_VERIFIED") return true;
  if (verification?.status === "SCOPE_NOT_BOUND") return !scopeRequired(env);
  return verification?.verified === true && !scopeRequired(env);
}

export function redactBusinessDiagnosisProofForClient(proof = {}) {
  const source = proof && typeof proof === "object" && !Array.isArray(proof) ? proof : {};
  const { authenticity_key_id, authenticity_mac, ...safe } = source;
  return safe;
}

export const BusinessDiagnosisProofAuthenticityRuntime = Object.freeze({
  contract: AVANTIQO_BUSINESS_DIAGNOSIS_PROOF_AUTHENTICITY_CONTRACT,
  algorithm: AVANTIQO_BUSINESS_DIAGNOSIS_PROOF_AUTHENTICITY_ALGORITHM,
  getStatus: getBusinessDiagnosisProofAuthenticityStatus,
  acceptable: businessDiagnosisProofAuthenticityAcceptable,
  redactForClient: redactBusinessDiagnosisProofForClient,
  verifyScope: verifyBusinessDiagnosisProofScope,
  scopeAcceptable: businessDiagnosisProofScopeAcceptable,
  seal: sealBusinessDiagnosisProofAuthenticity,
  verify: verifyBusinessDiagnosisProofAuthenticity,
});
