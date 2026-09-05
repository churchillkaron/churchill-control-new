import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import {
  getAvantiqoFinalKnowledgeReleaseAuthorizationStatus,
} from "./AvantiqoFinalKnowledgeReleaseAuthorizationAuthenticityRuntime.js";
import {
  getAvantiqoFinalKnowledgeReleaseReceiptStatus,
} from "./AvantiqoFinalKnowledgeReleaseReceiptAuthenticityRuntime.js";
import {
  getAvantiqoFinalPromotionCandidateAuthenticityStatus,
} from "./AvantiqoFinalPromotionCandidateAuthenticityRuntime.js";
import {
  getAvantiqoReleasedKnowledgeAuthenticityStatus,
} from "./AvantiqoReleasedKnowledgeAuthenticityRuntime.js";

export const AVANTIQO_FINAL_KNOWLEDGE_RELEASE_ACTIVATION_READINESS_CONTRACT =
  "AVANTIQO_FINAL_KNOWLEDGE_RELEASE_ACTIVATION_READINESS_V1";
export const AVANTIQO_FINAL_KNOWLEDGE_RELEASE_DATABASE_READINESS_CONTRACT =
  "AVANTIQO_FINAL_KNOWLEDGE_RELEASE_DATABASE_READINESS_V1";

const DATABASE_READINESS_RPC = "avantiqo_final_knowledge_release_activation_readiness";

function text(value, limit = 12000) {
  return String(value ?? "").trim().slice(0, limit);
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function databaseMigrationMissing(error) {
  const code = text(error?.code, 80).toUpperCase();
  const message = text(error?.message || error, 2000);
  return Boolean(
    code === "PGRST202" || code === "42883" ||
    /could not find the function|function .* does not exist|schema cache/i.test(message)
  );
}

async function probeDatabaseReadiness() {
  const result = await supabaseAdmin.rpc(DATABASE_READINESS_RPC);
  if (result.error) {
    return {
      success: true,
      available: false,
      ready: false,
      contract: AVANTIQO_FINAL_KNOWLEDGE_RELEASE_DATABASE_READINESS_CONTRACT,
      reason: databaseMigrationMissing(result.error)
        ? "ATOMIC_RELEASE_DATABASE_MIGRATION_REQUIRED"
        : "DATABASE_READINESS_PROBE_FAILED",
    };
  }
  const data = object(result.data);
  return {
    success: true,
    available: true,
    ready: data.ready === true &&
      text(data.contract, 180) === AVANTIQO_FINAL_KNOWLEDGE_RELEASE_DATABASE_READINESS_CONTRACT,
    contract: text(data.contract, 180) || AVANTIQO_FINAL_KNOWLEDGE_RELEASE_DATABASE_READINESS_CONTRACT,
    reason: data.ready === true ? null : "DATABASE_RELEASE_BOUNDARY_NOT_READY",
    atomic_release_rpc_present: data.atomic_release_rpc_present === true,
    atomic_release_security_invoker: data.atomic_release_security_invoker === true,
    service_role_execute: data.service_role_execute === true,
    anon_execute: data.anon_execute === true,
    authenticated_execute: data.authenticated_execute === true,
    receipt_mutation_guard_present: data.receipt_mutation_guard_present === true,
    receipt_guard_security_invoker: data.receipt_guard_security_invoker === true,
    receipt_immutable_trigger_present: data.receipt_immutable_trigger_present === true,
    intelligence_memories_rls: data.intelligence_memories_rls === true,
  };
}

export function evaluateAvantiqoFinalKnowledgeReleaseActivationReadiness({
  database = {},
  candidate_authenticity = {},
  released_knowledge_authenticity = {},
  authorization_authenticity = {},
  receipt_authenticity = {},
} = {}) {
  const blockers = [];
  const databaseReady = database?.ready === true;
  const candidateReady = candidate_authenticity?.available === true;
  const releasedKnowledgeReady = released_knowledge_authenticity?.available === true;
  const authorizationReady = authorization_authenticity?.verification_available === true &&
    authorization_authenticity?.signing_available === true;
  const receiptReady = receipt_authenticity?.verification_available === true &&
    receipt_authenticity?.signing_available === true;

  if (!databaseReady) blockers.push(database?.reason || "DATABASE_RELEASE_BOUNDARY_NOT_READY");
  if (!candidateReady) blockers.push(candidate_authenticity?.reason || "FINAL_PROMOTION_CANDIDATE_AUTHENTICITY_NOT_READY");
  if (!releasedKnowledgeReady) blockers.push(released_knowledge_authenticity?.reason || "RELEASED_KNOWLEDGE_AUTHENTICITY_NOT_READY");
  if (!authorizationReady) blockers.push(
    authorization_authenticity?.signing_reason ||
    authorization_authenticity?.verification_reason ||
    "RELEASE_AUTHORIZATION_SIGNER_NOT_READY",
  );
  if (!receiptReady) blockers.push(
    receipt_authenticity?.signing_reason ||
    receipt_authenticity?.verification_reason ||
    "RELEASE_RECEIPT_SIGNER_NOT_READY",
  );

  const uniqueBlockers = [...new Set(blockers.map((value) => text(value, 180)).filter(Boolean))];
  const ready = uniqueBlockers.length === 0;
  return {
    success: true,
    contract: AVANTIQO_FINAL_KNOWLEDGE_RELEASE_ACTIVATION_READINESS_CONTRACT,
    status: ready ? "FINAL_KNOWLEDGE_RELEASE_ACTIVATION_READY" : "FINAL_KNOWLEDGE_RELEASE_ACTIVATION_BLOCKED",
    ready,
    production_activation_blocked: !ready,
    blockers: uniqueBlockers,
    database: {
      ready: databaseReady,
      contract: database?.contract || AVANTIQO_FINAL_KNOWLEDGE_RELEASE_DATABASE_READINESS_CONTRACT,
      atomic_release_rpc_present: database?.atomic_release_rpc_present === true,
      atomic_release_security_invoker: database?.atomic_release_security_invoker === true,
      service_role_execute: database?.service_role_execute === true,
      anon_execute: database?.anon_execute === true,
      authenticated_execute: database?.authenticated_execute === true,
      receipt_mutation_guard_present: database?.receipt_mutation_guard_present === true,
      receipt_guard_security_invoker: database?.receipt_guard_security_invoker === true,
      receipt_immutable_trigger_present: database?.receipt_immutable_trigger_present === true,
      intelligence_memories_rls: database?.intelligence_memories_rls === true,
    },
    cryptography: {
      final_promotion_candidate_authenticity_ready: candidateReady,
      released_knowledge_authenticity_ready: releasedKnowledgeReady,
      release_authorization_verification_ready: authorization_authenticity?.verification_available === true,
      release_authorization_signing_ready: authorization_authenticity?.signing_available === true,
      immutable_receipt_verification_ready: receipt_authenticity?.verification_available === true,
      immutable_receipt_signing_ready: receipt_authenticity?.signing_available === true,
    },
    governance: {
      fail_closed: true,
      secret_values_returned: false,
      authenticated_manager_preflight_required_at_route: true,
      automatic_migration_allowed: false,
      automatic_key_generation_allowed: false,
      automatic_final_release_allowed: false,
    },
  };
}

export async function getAvantiqoFinalKnowledgeReleaseActivationReadiness() {
  const [database] = await Promise.all([probeDatabaseReadiness()]);
  const candidateAuthenticity = getAvantiqoFinalPromotionCandidateAuthenticityStatus({ require_active: true });
  const releasedKnowledgeAuthenticity = getAvantiqoReleasedKnowledgeAuthenticityStatus({ require_active: true });
  const authorizationAuthenticity = getAvantiqoFinalKnowledgeReleaseAuthorizationStatus();
  const receiptAuthenticity = getAvantiqoFinalKnowledgeReleaseReceiptStatus();
  return evaluateAvantiqoFinalKnowledgeReleaseActivationReadiness({
    database,
    candidate_authenticity: candidateAuthenticity,
    released_knowledge_authenticity: releasedKnowledgeAuthenticity,
    authorization_authenticity: authorizationAuthenticity,
    receipt_authenticity: receiptAuthenticity,
  });
}

export default Object.freeze({
  contract: AVANTIQO_FINAL_KNOWLEDGE_RELEASE_ACTIVATION_READINESS_CONTRACT,
  database_contract: AVANTIQO_FINAL_KNOWLEDGE_RELEASE_DATABASE_READINESS_CONTRACT,
  evaluate: evaluateAvantiqoFinalKnowledgeReleaseActivationReadiness,
  get: getAvantiqoFinalKnowledgeReleaseActivationReadiness,
});
