import { randomBytes } from "crypto";

import { supabaseAdmin } from "@/lib/shared/supabase/admin";

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function normalizeRole(value) {
  return String(value || "").trim().toUpperCase();
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

async function ensureParty({ organizationId, name, email, existingPartyId = null }) {
  if (existingPartyId) {
    const { data, error } = await supabaseAdmin
      .from("parties")
      .select("id,organization_id,display_name,email,status")
      .eq("id", existingPartyId)
      .eq("organization_id", organizationId)
      .maybeSingle();

    if (error) throw error;
    if (data) return data;
  }

  const { data: existingParty, error: existingPartyError } = await supabaseAdmin
    .from("parties")
    .select("id,organization_id,display_name,email,status")
    .eq("organization_id", organizationId)
    .ilike("email", email)
    .limit(1)
    .maybeSingle();

  if (existingPartyError) throw existingPartyError;
  if (existingParty) return existingParty;

  const { data: party, error: partyError } = await supabaseAdmin
    .from("parties")
    .insert({
      organization_id: organizationId,
      party_type: "person",
      display_name: name,
      email,
      status: "active",
    })
    .select("id,organization_id,display_name,email,status")
    .single();

  if (partyError) throw partyError;
  return party;
}

async function ensureEmployeeRelationship({ organizationId, partyId }) {
  const { data: existing, error: existingError } = await supabaseAdmin
    .from("party_relationships")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("party_id", partyId)
    .eq("relationship_type", "employee")
    .eq("status", "active")
    .is("end_date", null)
    .limit(1)
    .maybeSingle();

  if (existingError) throw existingError;
  if (existing) return existing.id;

  const { data, error } = await supabaseAdmin
    .from("party_relationships")
    .insert({
      organization_id: organizationId,
      party_id: partyId,
      relationship_type: "employee",
      status: "active",
    })
    .select("id")
    .single();

  if (error) throw error;
  return data.id;
}

async function ensureMembership({ organizationId, staffAccountId, role }) {
  const { data: existing, error: existingError } = await supabaseAdmin
    .from("organization_users")
    .select("id,role,status")
    .eq("organization_id", organizationId)
    .eq("staff_account_id", staffAccountId)
    .limit(1)
    .maybeSingle();

  if (existingError) throw existingError;

  if (existing) {
    if (existing.status !== "active" || normalizeRole(existing.role) !== role) {
      const { error: updateError } = await supabaseAdmin
        .from("organization_users")
        .update({
          role: role.toLowerCase(),
          status: "active",
        })
        .eq("id", existing.id)
        .eq("organization_id", organizationId);

      if (updateError) throw updateError;
    }

    return existing.id;
  }

  const { data, error } = await supabaseAdmin
    .from("organization_users")
    .insert({
      organization_id: organizationId,
      staff_account_id: staffAccountId,
      role: role.toLowerCase(),
      status: "active",
    })
    .select("id")
    .single();

  if (error) throw error;
  return data.id;
}

async function unlinkAuthentication({ staffId, organizationId, authUserId }) {
  await supabaseAdmin
    .from("staff_accounts")
    .update({ auth_user_id: null })
    .eq("id", staffId)
    .eq("active_organization_id", organizationId)
    .eq("auth_user_id", authUserId);
}

export default async function provisionStaffAccess({
  organizationId,
  name,
  email,
  role,
  position = null,
  redirectTo = null,
}) {
  const normalizedName = String(name || "").trim();
  const normalizedEmail = normalizeEmail(email);
  const normalizedRole = normalizeRole(role);

  if (!organizationId) throw new Error("organizationId required");
  if (!normalizedName) throw new Error("name required");
  if (!normalizedEmail) throw new Error("email required");
  if (!normalizedRole) throw new Error("role required");
  if (!redirectTo) throw new Error("redirectTo required");

  const { data: existingStaff, error: existingStaffError } = await supabaseAdmin
    .from("staff_accounts")
    .select("id,name,email,role,position,department,active,auth_user_id,party_id,active_organization_id")
    .eq("active_organization_id", organizationId)
    .ilike("email", normalizedEmail)
    .limit(1)
    .maybeSingle();

  if (existingStaffError) throw existingStaffError;

  const party = await ensureParty({
    organizationId,
    name: normalizedName,
    email: normalizedEmail,
    existingPartyId: existingStaff?.party_id || null,
  });

  let staff = existingStaff;

  if (!staff) {
    const { data, error } = await supabaseAdmin
      .from("staff_accounts")
      .insert({
        name: normalizedName,
        email: normalizedEmail,
        role: normalizedRole,
        position: position || null,
        active: true,
        active_organization_id: organizationId,
        party_id: party.id,
      })
      .select("id,name,email,role,position,department,active,auth_user_id,party_id,active_organization_id")
      .single();

    if (error) throw error;
    staff = data;
  } else {
    const updates = {};

    if (!staff.party_id) updates.party_id = party.id;
    if (staff.active === false) updates.active = true;
    if (normalizeRole(staff.role) !== normalizedRole) updates.role = normalizedRole;
    if (staff.name !== normalizedName) updates.name = normalizedName;
    if (position !== null && String(staff.position || "") !== String(position || "")) {
      updates.position = position || null;
    }

    if (Object.keys(updates).length) {
      const { data, error } = await supabaseAdmin
        .from("staff_accounts")
        .update(updates)
        .eq("id", staff.id)
        .eq("active_organization_id", organizationId)
        .select("id,name,email,role,position,department,active,auth_user_id,party_id,active_organization_id")
        .single();

      if (error) throw error;
      staff = data;
    }
  }

  await ensureEmployeeRelationship({
    organizationId,
    partyId: party.id,
  });

  await ensureMembership({
    organizationId,
    staffAccountId: staff.id,
    role: normalizedRole,
  });

  if (staff.auth_user_id) {
    return {
      staff,
      party,
      authUserId: staff.auth_user_id,
      inviteSent: false,
      accessEmailSent: false,
      alreadyLinked: true,
    };
  }

  let authUser = await findAuthUserByEmail(normalizedEmail);
  let createdAuthUser = false;

  if (!authUser) {
    const { data, error } = await supabaseAdmin.auth.admin.createUser({
      email: normalizedEmail,
      password: randomBytes(32).toString("base64url"),
      email_confirm: true,
    });

    if (error) throw error;

    authUser = data?.user || null;
    createdAuthUser = true;
  }

  if (!authUser?.id) {
    throw new Error("Authentication user was not created");
  }

  const { data: conflictingStaff, error: conflictError } = await supabaseAdmin
    .from("staff_accounts")
    .select("id,active_organization_id")
    .eq("auth_user_id", authUser.id)
    .eq("active_organization_id", organizationId)
    .neq("id", staff.id)
    .limit(1)
    .maybeSingle();

  if (conflictError) throw conflictError;

  if (conflictingStaff) {
    throw new Error("Authentication user is already linked to another staff account in this organization");
  }

  const { data: linkedStaff, error: linkError } = await supabaseAdmin
    .from("staff_accounts")
    .update({ auth_user_id: authUser.id })
    .eq("id", staff.id)
    .eq("active_organization_id", organizationId)
    .is("auth_user_id", null)
    .select("id,name,email,role,position,department,active,auth_user_id,party_id,active_organization_id")
    .maybeSingle();

  if (linkError || !linkedStaff) {
    if (createdAuthUser) {
      await supabaseAdmin.auth.admin.deleteUser(authUser.id).catch(() => null);
    }

    if (linkError) throw linkError;
    throw new Error("Unable to link authentication user to staff account");
  }

  const { error: resetError } = await supabaseAdmin.auth.resetPasswordForEmail(
    normalizedEmail,
    { redirectTo }
  );

  if (resetError) {
    await unlinkAuthentication({
      staffId: linkedStaff.id,
      organizationId,
      authUserId: authUser.id,
    });

    if (createdAuthUser) {
      await supabaseAdmin.auth.admin.deleteUser(authUser.id).catch(() => null);
    }

    throw resetError;
  }

  return {
    staff: linkedStaff,
    party,
    authUserId: authUser.id,
    inviteSent: true,
    accessEmailSent: true,
    alreadyLinked: false,
  };
}
