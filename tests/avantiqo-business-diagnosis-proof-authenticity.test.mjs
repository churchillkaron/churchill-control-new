import test from "node:test";
import assert from "node:assert/strict";
import {
  sealBusinessDiagnosisProofAuthenticity,
  verifyBusinessDiagnosisProofAuthenticity,
  getBusinessDiagnosisProofAuthenticityStatus,
  businessDiagnosisProofAuthenticityAcceptable,
  redactBusinessDiagnosisProofForClient,
  bindBusinessDiagnosisScopeChecksum,
  verifyBusinessDiagnosisScopeChecksum,
  verifyBusinessDiagnosisProofScope,
} from "../lib/intelligence/runtime/AvantiqoBusinessDiagnosisProofAuthenticityRuntime.js";

const env = {
  AVANTIQO_MISSION_OUTCOME_AUTH_ACTIVE_KEY_ID: "k1",
  AVANTIQO_MISSION_OUTCOME_AUTH_KEYRING_JSON: JSON.stringify({
    k1: "11".repeat(32),
    old: "22".repeat(32),
  }),
};
const proof = {
  receipt_contract: "AVANTIQO_BUSINESS_DIAGNOSIS_RECEIPT_V2",
  receipt_fingerprint: "a".repeat(64),
  audit_projection_contract: "AVANTIQO_BUSINESS_DIAGNOSIS_AUDIT_PROJECTION_V4",
  audit_projection_fingerprint: "b".repeat(64),
  answer_content_fingerprint: "c".repeat(64),
};

test("diagnosis proof authenticity seals and verifies with server keyring", () => {
  const sealed = sealBusinessDiagnosisProofAuthenticity(proof, { env });
  assert.equal(sealed.sealed, true);
  assert.equal(sealed.proof.authenticity_key_id, "k1");
  assert.equal(sealed.proof.authenticity_mac.length, 64);
  assert.equal(verifyBusinessDiagnosisProofAuthenticity(sealed.proof, { env }).status, "AUTHENTICATED");
});

test("diagnosis proof authenticity detects recomputed structural metadata tampering", () => {
  const sealed = sealBusinessDiagnosisProofAuthenticity(proof, { env }).proof;
  const tampered = { ...sealed, audit_projection_fingerprint: "d".repeat(64) };
  assert.equal(verifyBusinessDiagnosisProofAuthenticity(tampered, { env }).status, "AUTHENTICITY_MISMATCH");
});

test("diagnosis proof authenticity supports retired verification keys", () => {
  const oldEnv = { ...env, AVANTIQO_MISSION_OUTCOME_AUTH_ACTIVE_KEY_ID: "old" };
  const sealed = sealBusinessDiagnosisProofAuthenticity(proof, { env: oldEnv }).proof;
  assert.equal(verifyBusinessDiagnosisProofAuthenticity(sealed, { env }).status, "AUTHENTICATED");
});

test("missing keyring leaves proof unsigned without exposing secrets", () => {
  const sealed = sealBusinessDiagnosisProofAuthenticity(proof, { env: {} });
  assert.equal(sealed.sealed, false);
  assert.equal(sealed.status, "AUTHENTICITY_NOT_AVAILABLE");
  assert.equal(verifyBusinessDiagnosisProofAuthenticity(proof, { env: {} }).status, "AUTHENTICITY_NOT_AVAILABLE");
  const status = getBusinessDiagnosisProofAuthenticityStatus({ env: {} });
  assert.equal(status.available, false);
  assert.equal(status.client_exposure_allowed, false);
  assert.equal(status.database_stored_secret_allowed, false);
});


test("diagnosis authenticity requirement is an explicit readiness gate", () => {
  const optional = getBusinessDiagnosisProofAuthenticityStatus({ env: {} });
  assert.equal(optional.required, false);
  assert.equal(optional.ready, true);
  assert.equal(businessDiagnosisProofAuthenticityAcceptable({ status: "AUTHENTICITY_NOT_AVAILABLE" }, { env: {} }), true);

  const requiredEnv = { AVANTIQO_BUSINESS_DIAGNOSIS_AUTHENTICITY_REQUIRED: "true" };
  const required = getBusinessDiagnosisProofAuthenticityStatus({ env: requiredEnv });
  assert.equal(required.required, true);
  assert.equal(required.ready, false);
  assert.equal(businessDiagnosisProofAuthenticityAcceptable({ status: "AUTHENTICITY_NOT_AVAILABLE" }, { env: requiredEnv }), false);
  assert.equal(businessDiagnosisProofAuthenticityAcceptable({ status: "AUTHENTICATED" }, { env: requiredEnv }), true);
});


test("client proof redaction removes signing key id and MAC but keeps verification status", () => {
  const safe = redactBusinessDiagnosisProofForClient({
    receipt_fingerprint: "a".repeat(64),
    authenticity_key_id: "k1",
    authenticity_mac: "b".repeat(64),
    authenticity_contract: "AVANTIQO_BUSINESS_DIAGNOSIS_PROOF_AUTHENTICITY_V1",
    authenticity_algorithm: "HMAC-SHA256",
    authenticity_status: "AUTHENTICATED",
    authenticity_verified: true,
  });
  assert.equal(Object.prototype.hasOwnProperty.call(safe, "authenticity_key_id"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(safe, "authenticity_mac"), false);
  assert.equal(safe.authenticity_status, "AUTHENTICATED");
  assert.equal(safe.authenticity_verified, true);
  assert.equal(safe.receipt_fingerprint.length, 64);
});


test("client proof redaction removes all persisted scope identifiers", () => {
  const safe = redactBusinessDiagnosisProofForClient({
    scope_organization_id:"org",scope_conversation_id:"conv",scope_entity_id:"entity",scope_period_id:"period",scope_user_turn_id:"turn",
    authenticity_key_id:"k1",authenticity_mac:"a".repeat(64),receipt_fingerprint:"b".repeat(64),
  });
  for(const key of ["scope_organization_id","scope_conversation_id","scope_entity_id","scope_period_id","scope_user_turn_id","authenticity_key_id","authenticity_mac"]){
    assert.equal(Object.prototype.hasOwnProperty.call(safe,key),false);
  }
  assert.equal(safe.receipt_fingerprint.length,64);
});


test("unsigned persisted scope checksum detects partial scope tampering", () => {
  const scoped=bindBusinessDiagnosisScopeChecksum({scope_organization_id:"org-a",scope_conversation_id:"conv-a",scope_entity_id:"entity-a",scope_period_id:"2026-09",scope_user_turn_id:"u1"});
  assert.equal(verifyBusinessDiagnosisScopeChecksum(scoped).status,"SCOPE_CHECKSUM_VERIFIED");
  assert.equal(verifyBusinessDiagnosisProofScope(scoped,{organization_id:"org-a",conversation_id:"conv-a",entity_id:"entity-a",period_id:"2026-09"}).status,"SCOPE_VERIFIED");
  const tampered={...scoped,scope_conversation_id:"conv-b"};
  assert.equal(verifyBusinessDiagnosisScopeChecksum(tampered).status,"SCOPE_CHECKSUM_MISMATCH");
  assert.equal(verifyBusinessDiagnosisProofScope(tampered,{organization_id:"org-b",conversation_id:"conv-b",entity_id:"entity-a",period_id:"2026-09"}).status,"SCOPE_CHECKSUM_MISMATCH");
});

test("legacy scoped proof without checksum remains compatibility-verifiable", () => {
  const legacy={scope_organization_id:"org-a",scope_conversation_id:"conv-a",scope_entity_id:"entity-a"};
  const checksum=verifyBusinessDiagnosisScopeChecksum(legacy);
  assert.equal(checksum.status,"SCOPE_CHECKSUM_NOT_AVAILABLE");
  assert.equal(checksum.verified,true);
  assert.equal(verifyBusinessDiagnosisProofScope(legacy,{organization_id:"org-a",conversation_id:"conv-a",entity_id:"entity-a"}).status,"SCOPE_VERIFIED");
});

test("client proof redaction removes scope checksum metadata", () => {
  const safe=redactBusinessDiagnosisProofForClient({scope_checksum_contract:"AVANTIQO_BUSINESS_DIAGNOSIS_SCOPE_CHECKSUM_V1",scope_checksum:"a".repeat(64),receipt_fingerprint:"b".repeat(64)});
  assert.equal(Object.prototype.hasOwnProperty.call(safe,"scope_checksum_contract"),false);
  assert.equal(Object.prototype.hasOwnProperty.call(safe,"scope_checksum"),false);
});
