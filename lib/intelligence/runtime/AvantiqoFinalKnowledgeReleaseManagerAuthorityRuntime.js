import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { getServerCurrentUser } from "@/lib/auth/getServerCurrentUser";

export const AVANTIQO_FINAL_KNOWLEDGE_RELEASE_MANAGER_AUTHORITY_CONTRACT =
  "AVANTIQO_FINAL_KNOWLEDGE_RELEASE_MANAGER_AUTHORITY_V1";

const MANAGER_ROLES = new Set(["OWNER", "SUPER_ADMIN", "MANAGER"]);

function text(value, limit = 12000) {
  return String(value ?? "").trim().slice(0, limit);
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

export async function assertAvantiqoFinalKnowledgeReleaseManagerAuthority(organizationIdInput) {
  const organizationId = uuid(organizationIdInput);
  if (!organizationId) {
    throw new Error(`${AVANTIQO_FINAL_KNOWLEDGE_RELEASE_MANAGER_AUTHORITY_CONTRACT}_ORGANIZATION_REQUIRED`);
  }

  const user = await getServerCurrentUser();
  const authUserId = uuid(user?.id);
  if (!authUserId) {
    throw new Error(`${AVANTIQO_FINAL_KNOWLEDGE_RELEASE_MANAGER_AUTHORITY_CONTRACT}_AUTHENTICATED_USER_REQUIRED`);
  }

  const userClient = createUserContextClient();
  const authority = await userClient.rpc("can_manage_organization", {
    target_organization_id: organizationId,
  });
  if (authority.error) throw authority.error;
  if (authority.data !== true) {
    throw new Error(`${AVANTIQO_FINAL_KNOWLEDGE_RELEASE_MANAGER_AUTHORITY_CONTRACT}_ORGANIZATION_MANAGER_AUTHORITY_REQUIRED`);
  }

  const staff = await supabaseAdmin
    .from("staff_accounts")
    .select("id,auth_user_id,role,active")
    .eq("auth_user_id", authUserId)
    .eq("active", true)
    .limit(8);
  if (staff.error) throw staff.error;

  const staffRows = staff.data || [];
  const staffIds = staffRows
    .map((row) => text(row.id, 80))
    .filter(Boolean);
  if (staffIds.length === 0) {
    throw new Error(`${AVANTIQO_FINAL_KNOWLEDGE_RELEASE_MANAGER_AUTHORITY_CONTRACT}_AUTHORITY_EVIDENCE_MISMATCH`);
  }

  const organizationUsers = await supabaseAdmin
    .from("organization_users")
    .select("staff_account_id,status")
    .eq("organization_id", organizationId)
    .eq("status", "active")
    .in("staff_account_id", staffIds);
  if (organizationUsers.error) throw organizationUsers.error;

  const activeMemberships = new Set(
    (organizationUsers.data || []).map((row) => text(row.staff_account_id, 80)),
  );
  const actor = staffRows.find((row) => {
    const role = text(row.role, 40).toUpperCase();
    return activeMemberships.has(text(row.id, 80)) && MANAGER_ROLES.has(role);
  });
  if (!actor?.id) {
    throw new Error(`${AVANTIQO_FINAL_KNOWLEDGE_RELEASE_MANAGER_AUTHORITY_CONTRACT}_AUTHORITY_EVIDENCE_MISMATCH`);
  }

  return {
    contract: AVANTIQO_FINAL_KNOWLEDGE_RELEASE_MANAGER_AUTHORITY_CONTRACT,
    organization_id: organizationId,
    auth_user_id: authUserId,
    staff_account_id: text(actor.id, 80),
    role: text(actor.role, 40).toUpperCase(),
    authority_function: "public.can_manage_organization(uuid)",
    authority_verified: true,
    authenticated_user_verified: true,
    staff_account_active_verified: true,
    organization_membership_active_verified: true,
    manager_role_verified: true,
    caller_supplied_identity_allowed: false,
  };
}

export default Object.freeze({
  contract: AVANTIQO_FINAL_KNOWLEDGE_RELEASE_MANAGER_AUTHORITY_CONTRACT,
  assert: assertAvantiqoFinalKnowledgeReleaseManagerAuthority,
});
