export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";

import {
  resolveOperationsRequestContext,
  searchParamsToObject,
} from "@/lib/operations/api/resolveOperationsRequestContext";
import { OPERATIONS_ACTIONS } from "@/lib/operations/security/OperationsAuthorizationPolicy";
import {
  assignOperationsRole,
  listOperationsRoles,
  listUserOperationsRoleAssignments,
  revokeOperationsRole,
} from "@/lib/operations/security/OperationsPermissionRepository";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

async function requireOrganizationUser(organizationId, userId) {
  const { data: staff, error: staffError } = await supabaseAdmin
    .from("staff_accounts")
    .select("id, auth_user_id, name, email, role, position, department, party_id")
    .eq("auth_user_id", userId)
    .maybeSingle();

  if (staffError) throw staffError;
  if (!staff) throw new Error("Operations role target user not found");

  const { data: membership, error: membershipError } = await supabaseAdmin
    .from("organization_users")
    .select("id, organization_id, staff_account_id, role, status")
    .eq("organization_id", organizationId)
    .eq("staff_account_id", staff.id)
    .maybeSingle();

  if (membershipError) throw membershipError;
  if (!membership) throw new Error("Operations role target must belong to the organisation");

  return { staff, membership };
}

async function listOrganizationMembers(organizationId) {
  const { data: memberships, error: membershipError } = await supabaseAdmin
    .from("organization_users")
    .select("id, staff_account_id, role, status")
    .eq("organization_id", organizationId)
    .limit(2000);

  if (membershipError) throw membershipError;

  const staffIds = (memberships || []).map((row) => row.staff_account_id).filter(Boolean);
  if (!staffIds.length) return [];

  const { data: staffRows, error: staffError } = await supabaseAdmin
    .from("staff_accounts")
    .select("id, auth_user_id, name, email, role, position, department, party_id")
    .in("id", staffIds);

  if (staffError) throw staffError;

  const partyIds = (staffRows || []).map((row) => row.party_id).filter(Boolean);
  let parties = [];

  if (partyIds.length) {
    const { data, error } = await supabaseAdmin
      .from("parties")
      .select("id, display_name")
      .in("id", partyIds);
    if (error) throw error;
    parties = data || [];
  }

  const membershipByStaffId = new Map(
    (memberships || []).map((row) => [String(row.staff_account_id), row]),
  );
  const partyNameById = new Map(
    parties.map((party) => [String(party.id), party.display_name]),
  );

  return (staffRows || [])
    .filter((staff) => staff.auth_user_id)
    .map((staff) => {
      const membership = membershipByStaffId.get(String(staff.id)) || null;
      return {
        user_id: staff.auth_user_id,
        staff_account_id: staff.id,
        party_id: staff.party_id || null,
        name: partyNameById.get(String(staff.party_id)) || staff.name || staff.email || "Unknown user",
        email: staff.email || null,
        position: staff.position || null,
        department: staff.department || null,
        organization_role: membership?.role || null,
        membership_status: membership?.status || null,
      };
    })
    .sort((a, b) => String(a.name).localeCompare(String(b.name), "en-GB"));
}

async function assertNotLastAdministrator({ organizationId, userId, roleCode }) {
  if (roleCode !== "OPERATIONS_ADMIN") return;

  const roles = await listOperationsRoles(organizationId);
  const adminRole = roles.find((role) => role.role_code === "OPERATIONS_ADMIN");
  if (!adminRole) return;

  const { data, error } = await supabaseAdmin
    .from("user_operations_roles")
    .select("user_id")
    .eq("organization_id", organizationId)
    .eq("role_id", adminRole.id)
    .is("revoked_at", null);

  if (error) throw error;

  const administrators = [...new Set((data || []).map((row) => row.user_id).filter(Boolean))];
  if (administrators.length === 1 && administrators[0] === userId) {
    throw new Error("The final Operations Administrator role cannot be revoked");
  }
}

function errorResponse(error, status = 500) {
  const message = error?.message || "Operations role administration failed.";
  const inferredStatus = /required|not found|must belong|final Operations Administrator/i.test(message)
    ? 400
    : status;
  return NextResponse.json({ ok: false, error: message }, { status: inferredStatus });
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const input = searchParamsToObject(searchParams);
  const resolved = await resolveOperationsRequestContext({
    request,
    input,
    action: OPERATIONS_ACTIONS.ADMINISTER,
  });

  if (!resolved.success) {
    return NextResponse.json(
      {
        ok: false,
        error: resolved.error,
        required_permissions: resolved.required_permissions || [],
      },
      { status: resolved.status || 400 },
    );
  }

  try {
    const userId = searchParams.get("user_id") || null;
    const [roles, assignments, users] = await Promise.all([
      listOperationsRoles(resolved.context.organization_id),
      listUserOperationsRoleAssignments({
        organizationId: resolved.context.organization_id,
        userId,
      }),
      listOrganizationMembers(resolved.context.organization_id),
    ]);

    return NextResponse.json({
      ok: true,
      roles,
      assignments,
      users,
      count: assignments.length,
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request) {
  const body = await request.json().catch(() => ({}));
  const resolved = await resolveOperationsRequestContext({
    request,
    input: body,
    action: OPERATIONS_ACTIONS.ADMINISTER,
  });

  if (!resolved.success) {
    return NextResponse.json(
      {
        ok: false,
        error: resolved.error,
        required_permissions: resolved.required_permissions || [],
      },
      { status: resolved.status || 400 },
    );
  }

  try {
    if (!body.user_id) throw new Error("user_id required");
    if (!body.role_code) throw new Error("role_code required");

    await requireOrganizationUser(resolved.context.organization_id, body.user_id);
    const assignment = await assignOperationsRole({
      organizationId: resolved.context.organization_id,
      userId: body.user_id,
      roleCode: String(body.role_code).trim().toUpperCase(),
      assignedBy: resolved.context.actor_id,
    });

    return NextResponse.json({ ok: true, assignment }, { status: 200 });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(request) {
  const body = await request.json().catch(() => ({}));
  const resolved = await resolveOperationsRequestContext({
    request,
    input: body,
    action: OPERATIONS_ACTIONS.ADMINISTER,
  });

  if (!resolved.success) {
    return NextResponse.json(
      {
        ok: false,
        error: resolved.error,
        required_permissions: resolved.required_permissions || [],
      },
      { status: resolved.status || 400 },
    );
  }

  try {
    if (!body.user_id) throw new Error("user_id required");
    if (!body.role_code) throw new Error("role_code required");

    const roleCode = String(body.role_code).trim().toUpperCase();
    await requireOrganizationUser(resolved.context.organization_id, body.user_id);
    await assertNotLastAdministrator({
      organizationId: resolved.context.organization_id,
      userId: body.user_id,
      roleCode,
    });

    const revoked = await revokeOperationsRole({
      organizationId: resolved.context.organization_id,
      userId: body.user_id,
      roleCode,
    });

    return NextResponse.json({ ok: true, revoked }, { status: 200 });
  } catch (error) {
    return errorResponse(error);
  }
}
