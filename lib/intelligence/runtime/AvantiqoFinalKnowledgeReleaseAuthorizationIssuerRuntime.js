import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { getServerCurrentUser } from "@/lib/auth/getServerCurrentUser";
import {
  createAvantiqoFinalKnowledgeReleaseAuthorizationDraft,
  sealAvantiqoFinalKnowledgeReleaseAuthorization,
} from "./AvantiqoFinalKnowledgeReleaseAuthorizationAuthenticityRuntime.js";
import {
  createAvantiqoFinalPromotionCandidateAuthenticityVerifier,
  verifyAvantiqoFinalPromotionCandidateClaimBinding,
} from "./AvantiqoFinalPromotionCandidateAuthenticityRuntime.js";

export const AVANTIQO_FINAL_KNOWLEDGE_RELEASE_AUTHORIZATION_ISSUER_CONTRACT =
  "AVANTIQO_FINAL_KNOWLEDGE_RELEASE_AUTHORIZATION_ISSUER_V1";

const MEMORY_TABLE = "intelligence_memories";
const FINAL_CANDIDATE_SCOPE = "platform_learning_knowledge_final_promotion_candidates";
const PROVISIONAL_SCOPE = "platform_provisional_knowledge";
const AUTHORIZATION_SCOPE = "platform_learning_knowledge_release_authorizations";
const MANAGER_ROLES = new Set(["OWNER", "SUPER_ADMIN", "MANAGER"]);
const HEX64_RE = /^[a-f0-9]{64}$/i;

function text(value, limit = 12000) {
  return String(value ?? "").trim().slice(0, limit);
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function uuid(value) {
  const normalized = text(value, 80).toLowerCase();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(normalized)
    ? normalized
    : null;
}

function createUserContextClient() {
  const cookieStore = cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll() {},
      },
    },
  );
}

async function assertAuthenticatedManager(organizationId) {
  const user = await getServerCurrentUser();
  const authUserId = uuid(user?.id);
  if (!authUserId) {
    throw new Error(`${AVANTIQO_FINAL_KNOWLEDGE_RELEASE_AUTHORIZATION_ISSUER_CONTRACT}_AUTHENTICATED_USER_REQUIRED`);
  }

  const userClient = createUserContextClient();
  const authority = await userClient.rpc("can_manage_organization", {
    target_organization_id: organizationId,
  });
  if (authority.error) throw authority.error;
  if (authority.data !== true) {
    throw new Error(`${AVANTIQO_FINAL_KNOWLEDGE_RELEASE_AUTHORIZATION_ISSUER_CONTRACT}_ORGANIZATION_MANAGER_AUTHORITY_REQUIRED`);
  }

  const staff = await supabaseAdmin
    .from("staff_accounts")
    .select("id,auth_user_id,role,active")
    .eq("auth_user_id", authUserId)
    .eq("active", true)
    .limit(8);
  if (staff.error) throw staff.error;

  const organizationUsers = await supabaseAdmin
    .from("organization_users")
    .select("staff_account_id,status")
    .eq("organization_id", organizationId)
    .eq("status", "active")
    .limit(100);
  if (organizationUsers.error) throw organizationUsers.error;
  const activeMemberships = new Set((organizationUsers.data || []).map((row) => text(row.staff_account_id, 80)));

  const actor = (staff.data || []).find((row) => {
    const role = text(row.role, 40).toUpperCase();
    return activeMemberships.has(text(row.id, 80)) && MANAGER_ROLES.has(role);
  });
  if (!actor?.id) {
    throw new Error(`${AVANTIQO_FINAL_KNOWLEDGE_RELEASE_AUTHORIZATION_ISSUER_CONTRACT}_AUTHORITY_EVIDENCE_MISMATCH`);
  }

  return {
    auth_user_id: authUserId,
    staff_account_id: text(actor.id, 80),
    role: text(actor.role, 40).toUpperCase(),
    authority_function: "public.can_manage_organization(uuid)",
  };
}

async function loadExactReleaseInputs(organizationId, hypothesisFingerprint) {
  const [candidate, provisional] = await Promise.all([
    supabaseAdmin
      .from(MEMORY_TABLE)
      .select("id,organization_id,memory_scope,memory_key,memory_type,subject,content,importance,confidence,source,active,valid_until,superseded_by,superseded_at,forgotten_at,metadata,updated_at,created_at")
      .eq("organization_id", organizationId)
      .eq("memory_scope", FINAL_CANDIDATE_SCOPE)
      .eq("metadata->>hypothesis_fingerprint", hypothesisFingerprint)
      .eq("active", true)
      .maybeSingle(),
    supabaseAdmin
      .from(MEMORY_TABLE)
      .select("id,organization_id,memory_scope,memory_key,memory_type,subject,content,importance,confidence,source,active,valid_until,superseded_by,superseded_at,forgotten_at,metadata,updated_at,created_at")
      .eq("organization_id", organizationId)
      .eq("memory_scope", PROVISIONAL_SCOPE)
      .eq("metadata->>hypothesis_fingerprint", hypothesisFingerprint)
      .eq("active", true)
      .maybeSingle(),
  ]);
  if (candidate.error) throw candidate.error;
  if (provisional.error) throw provisional.error;
  if (!candidate.data?.id) {
    throw new Error(`${AVANTIQO_FINAL_KNOWLEDGE_RELEASE_AUTHORIZATION_ISSUER_CONTRACT}_FINAL_CANDIDATE_NOT_FOUND`);
  }
  if (!provisional.data?.id) {
    throw new Error(`${AVANTIQO_FINAL_KNOWLEDGE_RELEASE_AUTHORIZATION_ISSUER_CONTRACT}_PROVISIONAL_CLAIM_NOT_FOUND`);
  }
  return { candidate: candidate.data, provisional: provisional.data };
}

export async function issueAvantiqoFinalKnowledgeReleaseAuthorization({
  organization_id,
  hypothesis_fingerprint,
  approval_reason,
  expires_in_minutes = 30,
} = {}) {
  const organizationId = uuid(organization_id);
  const hypothesisFingerprint = text(hypothesis_fingerprint, 64).toLowerCase();
  const approvalReason = text(approval_reason, 800);
  if (!organizationId) {
    throw new Error(`${AVANTIQO_FINAL_KNOWLEDGE_RELEASE_AUTHORIZATION_ISSUER_CONTRACT}_ORGANIZATION_REQUIRED`);
  }
  if (!HEX64_RE.test(hypothesisFingerprint)) {
    throw new Error(`${AVANTIQO_FINAL_KNOWLEDGE_RELEASE_AUTHORIZATION_ISSUER_CONTRACT}_HYPOTHESIS_FINGERPRINT_REQUIRED`);
  }
  if (approvalReason.length < 5) {
    throw new Error(`${AVANTIQO_FINAL_KNOWLEDGE_RELEASE_AUTHORIZATION_ISSUER_CONTRACT}_APPROVAL_REASON_REQUIRED`);
  }

  const actor = await assertAuthenticatedManager(organizationId);
  const { candidate, provisional } = await loadExactReleaseInputs(organizationId, hypothesisFingerprint);
  const candidateVerifier = createAvantiqoFinalPromotionCandidateAuthenticityVerifier();
  if (candidateVerifier.available !== true || !candidateVerifier.verify(candidate)) {
    throw new Error(`${AVANTIQO_FINAL_KNOWLEDGE_RELEASE_AUTHORIZATION_ISSUER_CONTRACT}_AUTHENTIC_FINAL_CANDIDATE_REQUIRED`);
  }
  if (!verifyAvantiqoFinalPromotionCandidateClaimBinding(candidate, provisional)) {
    throw new Error(`${AVANTIQO_FINAL_KNOWLEDGE_RELEASE_AUTHORIZATION_ISSUER_CONTRACT}_EXACT_PROVISIONAL_CLAIM_BINDING_REQUIRED`);
  }

  const issuedAt = new Date();
  const draft = createAvantiqoFinalKnowledgeReleaseAuthorizationDraft({
    organization_id: organizationId,
    candidate,
    provisional,
    approver_id: `staff:${actor.staff_account_id}`,
    approval_reason: approvalReason,
    expires_in_minutes,
    now: issuedAt,
  });
  if (draft.success !== true || !draft.row) {
    throw new Error(`${AVANTIQO_FINAL_KNOWLEDGE_RELEASE_AUTHORIZATION_ISSUER_CONTRACT}_${text(draft.reason, 160) || "DRAFT_FAILED"}`);
  }

  draft.row.metadata = {
    ...object(draft.row.metadata),
    approver_staff_account_id: actor.staff_account_id,
    approver_auth_user_id: actor.auth_user_id,
    approver_role_at_issue: actor.role,
    authority_function: actor.authority_function,
    authority_verified: true,
    authority_verified_at: issuedAt.toISOString(),
    caller_supplied_approver_identity_allowed: false,
  };

  const sealed = sealAvantiqoFinalKnowledgeReleaseAuthorization(draft.row);
  if (sealed.success !== true || !sealed.row) {
    throw new Error(`${AVANTIQO_FINAL_KNOWLEDGE_RELEASE_AUTHORIZATION_ISSUER_CONTRACT}_${text(sealed.reason, 160) || "SIGNING_FAILED"}`);
  }

  const persisted = await supabaseAdmin
    .from(MEMORY_TABLE)
    .insert(sealed.row)
    .select("id,memory_key,valid_until,metadata,updated_at")
    .single();
  if (persisted.error) {
    if (String(persisted.error?.code || "") === "23505") {
      throw new Error(`${AVANTIQO_FINAL_KNOWLEDGE_RELEASE_AUTHORIZATION_ISSUER_CONTRACT}_AUTHORIZATION_ALREADY_EXISTS`);
    }
    throw persisted.error;
  }

  return {
    success: true,
    contract: AVANTIQO_FINAL_KNOWLEDGE_RELEASE_AUTHORIZATION_ISSUER_CONTRACT,
    status: "SIGNED_AUTHORIZATION_ISSUED",
    authorization_memory_key: persisted.data.memory_key,
    expires_at: persisted.data.valid_until,
    approver_staff_account_id: actor.staff_account_id,
    approver_role_at_issue: actor.role,
    authority_verified: true,
    caller_supplied_approver_identity_allowed: false,
    automatic_release: false,
  };
}

export default Object.freeze({
  contract: AVANTIQO_FINAL_KNOWLEDGE_RELEASE_AUTHORIZATION_ISSUER_CONTRACT,
  issue: issueAvantiqoFinalKnowledgeReleaseAuthorization,
});
