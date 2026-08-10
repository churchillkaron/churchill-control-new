import { randomBytes } from "crypto";

import { supabaseAdmin } from "@/lib/shared/supabase/admin";

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

async function findAuthUserByEmail(email) {
  const normalizedEmail = normalizeEmail(email);
  const perPage = 200;

  for (let page = 1; page <= 50; page += 1) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({
      page,
      perPage,
    });

    if (error) throw error;

    const users = data?.users || [];
    const match = users.find(
      (user) => normalizeEmail(user?.email) === normalizedEmail
    );

    if (match) return match;
    if (users.length < perPage) return null;
  }

  throw new Error("Unable to resolve authentication user safely");
}

async function loadAuthUser(authUserId) {
  if (!authUserId) return null;

  const { data, error } = await supabaseAdmin.auth.admin.getUserById(authUserId);
  if (error) return null;
  return data?.user || null;
}

async function unlinkAuthentication({ staffId, organizationId, authUserId }) {
  await supabaseAdmin
    .from("staff_accounts")
    .update({ auth_user_id: null })
    .eq("id", staffId)
    .eq("active_organization_id", organizationId)
    .eq("auth_user_id", authUserId);
}

export function staffPortalAccessStatus({ staff, authUser }) {
  if (!staff?.auth_user_id) return "SETUP_REQUIRED";
  if (!authUser?.id) return "SETUP_REQUIRED";
  if (authUser.last_sign_in_at) return "ACTIVE";
  return "ACCOUNT_LINKED";
}

export default async function activateStaffPortalAccess({
  staffId,
  organizationId,
  redirectTo,
}) {
  if (!staffId) throw new Error("staffId required");
  if (!organizationId) throw new Error("organizationId required");
  if (!redirectTo) throw new Error("redirectTo required");

  const { data: staff, error: staffError } = await supabaseAdmin
    .from("staff_accounts")
    .select(
      "id,name,email,role,position,department,active,auth_user_id,party_id,active_organization_id"
    )
    .eq("id", staffId)
    .eq("active_organization_id", organizationId)
    .eq("active", true)
    .maybeSingle();

  if (staffError) throw staffError;
  if (!staff) throw new Error("Active staff account not found in this organization");

  const email = normalizeEmail(staff.email);
  if (!email) throw new Error("Staff email is required before portal activation");

  let authUser = await loadAuthUser(staff.auth_user_id);
  let authUserId = authUser?.id || null;
  let createdAuthUser = false;
  let linkedNow = false;

  if (!authUserId) {
    authUser = await findAuthUserByEmail(email);
    authUserId = authUser?.id || null;
  }

  if (!authUserId) {
    const { data, error } = await supabaseAdmin.auth.admin.createUser({
      email,
      password: randomBytes(32).toString("base64url"),
      email_confirm: true,
    });

    if (error) throw error;

    authUser = data?.user || null;
    authUserId = authUser?.id || null;
    createdAuthUser = Boolean(authUserId);
  }

  if (!authUserId) throw new Error("Authentication user could not be resolved");

  const { data: conflict, error: conflictError } = await supabaseAdmin
    .from("staff_accounts")
    .select("id")
    .eq("active_organization_id", organizationId)
    .eq("auth_user_id", authUserId)
    .neq("id", staff.id)
    .limit(1)
    .maybeSingle();

  if (conflictError) throw conflictError;
  if (conflict) {
    throw new Error(
      "Authentication user is already linked to another staff account in this organization"
    );
  }

  if (staff.auth_user_id !== authUserId) {
    const { data: linked, error: linkError } = await supabaseAdmin
      .from("staff_accounts")
      .update({ auth_user_id: authUserId })
      .eq("id", staff.id)
      .eq("active_organization_id", organizationId)
      .select("id,auth_user_id")
      .single();

    if (linkError) {
      if (createdAuthUser) {
        await supabaseAdmin.auth.admin.deleteUser(authUserId).catch(() => null);
      }
      throw linkError;
    }

    staff.auth_user_id = linked.auth_user_id;
    linkedNow = true;
  }

  const { error: resetError } = await supabaseAdmin.auth.resetPasswordForEmail(
    email,
    { redirectTo }
  );

  if (resetError) {
    if (linkedNow) {
      await unlinkAuthentication({
        staffId: staff.id,
        organizationId,
        authUserId,
      });
    }

    if (createdAuthUser) {
      await supabaseAdmin.auth.admin.deleteUser(authUserId).catch(() => null);
    }

    throw resetError;
  }

  authUser = authUser || (await loadAuthUser(authUserId));

  return {
    staffId: staff.id,
    authUserId,
    email,
    status: staffPortalAccessStatus({ staff, authUser }),
    lastSignInAt: authUser?.last_sign_in_at || null,
    emailSent: true,
  };
}
