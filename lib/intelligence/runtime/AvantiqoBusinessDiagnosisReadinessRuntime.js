import { getBusinessDiagnosisProofAuthenticityStatus } from "./AvantiqoBusinessDiagnosisProofAuthenticityRuntime.js";
import {
  AVANTIQO_BUSINESS_DIAGNOSIS_RECEIPT_CONTRACT,
  AVANTIQO_BUSINESS_DIAGNOSIS_AUDIT_PROJECTION_CONTRACT,
} from "./AvantiqoBusinessDiagnosisReceiptRuntime.js";

export const AVANTIQO_BUSINESS_DIAGNOSIS_READINESS_CONTRACT =
  "AVANTIQO_BUSINESS_DIAGNOSIS_READINESS_V1";

export function getBusinessDiagnosisReadiness({ env = process.env } = {}) {
  const authenticity = getBusinessDiagnosisProofAuthenticityStatus({ env });
  const blockers = [];
  if (authenticity.required === true && authenticity.available !== true) {
    blockers.push(authenticity.reason || "DIAGNOSIS_AUTHENTICITY_KEYRING_REQUIRED");
  }
  const ready = blockers.length === 0;
  return {
    contract: AVANTIQO_BUSINESS_DIAGNOSIS_READINESS_CONTRACT,
    ready,
    status: ready
      ? authenticity.available
        ? "READY_AUTHENTICATED"
        : "READY_STRUCTURAL_UNSIGNED"
      : "BLOCKED_AUTHENTICITY_REQUIRED",
    proof: {
      receipt_contract: AVANTIQO_BUSINESS_DIAGNOSIS_RECEIPT_CONTRACT,
      audit_projection_contract: AVANTIQO_BUSINESS_DIAGNOSIS_AUDIT_PROJECTION_CONTRACT,
      authenticity_required: authenticity.required === true,
      authenticity_available: authenticity.available === true,
      authenticity_ready: authenticity.ready === true,
      active_key_id: authenticity.active_key_id || null,
      verification_key_ids: authenticity.key_ids || [],
      server_only_keyring_required: true,
      client_exposure_allowed: false,
      database_stored_secret_allowed: false,
      key_rotation_supported: true,
    },
    blockers,
    authority_effect: "NONE",
  };
}


export function getPublicBusinessDiagnosisReadiness({ env = process.env } = {}) {
  const readiness = getBusinessDiagnosisReadiness({ env });
  return {
    contract: readiness.contract,
    ready: readiness.ready,
    status: readiness.status,
    proof: {
      receipt_contract: readiness.proof.receipt_contract,
      audit_projection_contract: readiness.proof.audit_projection_contract,
      authenticity_required: readiness.proof.authenticity_required,
      authenticity_available: readiness.proof.authenticity_available,
      authenticity_ready: readiness.proof.authenticity_ready,
      key_rotation_supported: readiness.proof.key_rotation_supported,
    },
    blocker_count: readiness.blockers.length,
    authority_effect: "NONE",
  };
}

export function assertBusinessDiagnosisReadiness({ env = process.env } = {}) {
  const readiness = getBusinessDiagnosisReadiness({ env });
  if (readiness.ready) return readiness;
  const error = new Error("Business diagnosis is not ready");
  error.code = "BUSINESS_DIAGNOSIS_NOT_READY";
  error.status = 503;
  error.details = {
    code: error.code,
    readiness_status: readiness.status,
    blockers: readiness.blockers,
    authority_effect: "NONE",
  };
  throw error;
}

export const AvantiqoBusinessDiagnosisReadinessRuntime = Object.freeze({
  contract: AVANTIQO_BUSINESS_DIAGNOSIS_READINESS_CONTRACT,
  get: getBusinessDiagnosisReadiness,
  getPublic: getPublicBusinessDiagnosisReadiness,
  assert: assertBusinessDiagnosisReadiness,
});
