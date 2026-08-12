import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { isClockInRole } from "@/lib/people/workforce/passkeyRolloutReadiness";

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function createError(message, code, status = 400) {
  const error = new Error(message);
  error.code = code;
  error.status = status;
  return error;
}

async function findAuthUser({ email = null, userId = null }) {
  const normalizedEmail = normalizeEmail(email);
  const perPage = 200;

  for (let page = 1; page <= 50; page += 1) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({
      page,
      perPage,
    });

    if (error) throw error;

    const users = data?.users || [];
    const match = users.find((user) => {
      if (userId && user?.id === userId) return true;
      return normalizedEmail && normalizeEmail(user?.email) === normalizedEmail;
    });

    if (match) return match;
    if (users.length < perPage) return null;
  }

  throw createError(
    "Unable to resolve the authentication identity safely",
    "PASSKEY_ENROLLMENT_AUTH_LOOKUP_FAILED",
    500
  );
}

async function ensureStaffMembership({ organizationId, staffId }) {
  const { data: membership, error: membershipError } = await supabaseAdmin
    .from("organization_users")
    .select("id,status,staff_account_id")
    .eq("organization_id", organizationId)
    .eq("staff_account_id", staffId)
    .eq("status", "active")
    .limit(1)
    .maybeSingle();

  if (membershipError) throw membershipError;
  if (!membership) {
    throw createError(
      "Active organization membership is required before passkey enrollment",
      "PASSKEY_ENROLLMENT_MEMBERSHIP_REQUIRED",
      404
    );
  }

  const { data: staff, error: staffError } = await supabaseAdmin
    .from("staff_accounts")
    .select("id,name,email,role,active,auth_user_id")
    .eq("id", staffId)
    .eq("active", true)
    .maybeSingle();

  if (staffError) throw staffError;
  if (!staff) {
    throw createError(
      "Active staff account not found",
      "PASSKEY_ENROLLMENT_STAFF_NOT_FOUND",
      404
    );
  }

  if (!isClockInRole(staff.role)) {
    throw createError(
      "Passkey clock-in enrollment is only available to clock-in staff roles",
      "PASSKEY_ENROLLMENT_ROLE_NOT_ELIGIBLE",
      409
    );
  }

  const email = normalizeEmail(staff.email);
  if (!email) {
    throw createError(
      "Add an email address to this staff account before sending passkey enrollment access",
      "PASSKEY_ENROLLMENT_EMAIL_REQUIRED",
      409
    );
  }

  return { staff, email };
}

async function ensureNoOrganizationConflict({
  organizationId,
  staffId,
  authUserId,
}) {
  const { data: conflicts, error } = await supabaseAdmin
    .from("staff_accounts")
    .select("id")
    .eq("auth_user_id", authUserId)
    .neq("id", staffId)
    .limit(100);

  if (error) throw error;
  if (!(conflicts || []).length) return;

  const conflictIds = conflicts.map((row) => row.id).filter(Boolean);
  const { data: memberships, error: membershipError } = await supabaseAdmin
    .from("organization_users")
    .select("staff_account_id")
    .eq("organization_id", organizationId)
    .eq("status", "active")
    .in("staff_account_id", conflictIds)
    .limit(1);

  if (membershipError) throw membershipError;
  if ((memberships || []).length) {
    throw createError(
      "This authentication identity is already linked to another staff account in this organization",
      "PASSKEY_ENROLLMENT_AUTH_CONFLICT",
      409
    );
  }
}

async function linkStaffAuthentication({
  organizationId,
  staffId,
  authUserId,
}) {
  await ensureNoOrganizationConflict({
    organizationId,
    staffId,
    authUserId,
  });

  const { data, error } = await supabaseAdmin
    .from("staff_accounts")
    .update({ auth_user_id: authUserId })
    .eq("id", staffId)
    .eq("active", true)
    .is("auth_user_id", null)
    .select("id,auth_user_id")
    .maybeSingle();

  if (error) throw error;
  if (!data) {
    const { data: current, error: currentError } = await supabaseAdmin
      .from("staff_accounts")
      .select("id,auth_user_id")
      .eq("id", staffId)
      .eq("active", true)
      .maybeSingle();

    if (currentError) throw currentError;
    if (current?.auth_user_id === authUserId) return current;

    throw createError(
      "Staff authentication linkage changed while enrollment access was being prepared",
      "PASSKEY_ENROLLMENT_LINK_CONFLICT",
      409
    );
  }

  return data;
}

async function unlinkNewAuthentication({ staffId, authUserId }) {
  await supabaseAdmin
    .from("staff_accounts")
    .update({ auth_user_id: null })
    .eq("id", staffId)
    .eq("auth_user_id", authUserId);
}

async function sendPasswordlessSignIn({ email, redirectTo }) {
  const { error } = await supabaseAdmin.auth.signInWithOtp({
    email,
    options: {
      shouldCreateUser: false,
      emailRedirectTo: redirectTo,
    },
  });

  if (error) throw error;
}

export default async function provisionPasskeyEnrollmentAccess({
  organizationId,
  staffId,
  redirectTo,
}) {
  if (!organizationId) {
    throw createError(
      "organizationId required",
      "PASSKEY_ENROLLMENT_ORGANIZATION_REQUIRED"
    );
  }
  if (!staffId) {
    throw createError("staffId required", "PASSKEY_ENROLLMENT_STAFF_REQUIRED");
  }
  if (!redirectTo) {
    throw createError(
      "redirectTo required",
      "PASSKEY_ENROLLMENT_REDIRECT_REQUIRED"
    );
  }

  const { staff, email } = await ensureStaffMembership({
    organizationId,
    staffId,
  });

  if (staff.auth_user_id) {
    const linkedAuthUser = await findAuthUser({ userId: staff.auth_user_id });
    if (!linkedAuthUser?.id) {
      throw createError(
        "The linked authentication identity no longer exists",
        "PASSKEY_ENROLLMENT_AUTH_MISSING",
        409
      );
    }

    if (normalizeEmail(linkedAuthUser.email) !== email) {
      throw createError(
        "Staff email does not match the linked authentication identity",
        "PASSKEY_ENROLLMENT_EMAIL_MISMATCH",
        409
      );
    }

    await sendPasswordlessSignIn({ email, redirectTo });

    return {
      staffId: staff.id,
      email,
      authLinked: true,
      accessSent: true,
      mode: "sign_in_link",
      message:
        "Passwordless sign-in link sent. After signing in, the staff member can register and test a passkey from Workforce Profile.",
    };
  }

  const existingAuthUser = await findAuthUser({ email });
  if (existingAuthUser?.id) {
    await linkStaffAuthentication({
      organizationId,
      staffId: staff.id,
      authUserId: existingAuthUser.id,
    });

    try {
      await sendPasswordlessSignIn({ email, redirectTo });
    } catch (error) {
      await unlinkNewAuthentication({
        staffId: staff.id,
        authUserId: existingAuthUser.id,
      });
      throw error;
    }

    return {
      staffId: staff.id,
      email,
      authLinked: true,
      accessSent: true,
      mode: "existing_auth_link",
      message:
        "Existing Supabase Auth identity linked and a passwordless sign-in link sent for passkey enrollment.",
    };
  }

  const { data: inviteData, error: inviteError } =
    await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
      redirectTo,
      data: {
        display_name: staff.name || null,
        workforce_enrollment: true,
      },
    });

  if (inviteError) throw inviteError;

  const invitedUser = inviteData?.user || null;
  if (!invitedUser?.id) {
    throw createError(
      "Supabase did not return the invited authentication user",
      "PASSKEY_ENROLLMENT_INVITE_FAILED",
      500
    );
  }

  try {
    await linkStaffAuthentication({
      organizationId,
      staffId: staff.id,
      authUserId: invitedUser.id,
    });
  } catch (error) {
    await supabaseAdmin.auth.admin.deleteUser(invitedUser.id).catch(() => null);
    throw error;
  }

  return {
    staffId: staff.id,
    email,
    authLinked: true,
    accessSent: true,
    mode: "invite",
    message:
      "Enrollment invitation sent. After accepting it, the staff member can register and test a passkey from Workforce Profile.",
  };
}
