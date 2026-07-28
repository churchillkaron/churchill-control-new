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
    .select("id, auth_user_id, name, email, party_id")
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

function errorResponse(error, status = 500) {
  const message = error?.message || "Operations role administration failed.";
  const inferredStatus = /required|not found|must belong/i.test(message) ? 400 : status;
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
    const [roles, assignments] = await Promise.all([
      listOperationsRoles(resolved.context.organization_id),
      listUserOperationsRoleAssignments({
        organizationId: resolved.context.organization_id,
        userId,
      }),
    ]);

    return NextResponse.json({
      ok: true,
      roles,
      assignments,
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

    await requireOrganizationUser(resolved.context.organization_id, body.user_id);
    const revoked = await revokeOperationsRole({
      organizationId: resolved.context.organization_id,
      userId: body.user_id,
      roleCode: String(body.role_code).trim().toUpperCase(),
    });

    return NextResponse.json({ ok: true, revoked }, { status: 200 });
  } catch (error) {
    return errorResponse(error);
  }
}
