export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { checkFinancePermission } from "@/lib/shared/auth/checkFinancePermission";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

function required(value, field) {
  const normalized = String(value || "").trim();
  if (!normalized) throw new Error(`${field} required`);
  return normalized;
}

function permissionDenied(error) {
  return /permission denied/i.test(String(error?.message || error || ""));
}

function statusFor(error) {
  if (permissionDenied(error)) return 403;
  const message = String(error?.message || "");
  if (/not found/i.test(message)) return 404;
  if (
    /required|must be|blocked|already|unavailable|insufficient|outside|inactive|not mapped|mismatch|only submitted/i.test(
      message
    )
  ) {
    return 409;
  }
  return Number(error?.status) || 500;
}

async function accessFor(request, organizationId) {
  const access = await requireOrganizationAccess({ organizationId, request });
  if (!access.success) {
    return {
      response: NextResponse.json(
        { success: false, error: access.error },
        { status: access.status || 403 }
      ),
    };
  }
  return { access };
}

async function canConfirm(access) {
  try {
    await checkFinancePermission({
      organizationId: access.organizationId,
      userId: access.user?.id,
      permissionKey: "finance.close.execute",
      fullAccess: access.permissions?.includes("*") === true,
    });
    return true;
  } catch (error) {
    if (permissionDenied(error)) return false;
    throw error;
  }
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const organizationId = required(
      searchParams.get("organizationId") || searchParams.get("organization_id"),
      "organizationId"
    );
    const { access, response } = await accessFor(request, organizationId);
    if (response) return response;

    return NextResponse.json({
      success: true,
      organization_id: access.organizationId,
      can_confirm: await canConfirm(access),
      required_permission: "finance.close.execute",
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error?.message || "Unable to resolve bank deposit Finance authority",
      },
      { status: statusFor(error) }
    );
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    const organizationId = required(
      body.organizationId || body.organization_id,
      "organizationId"
    );
    const { access, response } = await accessFor(request, organizationId);
    if (response) return response;

    await checkFinancePermission({
      organizationId: access.organizationId,
      userId: access.user?.id,
      permissionKey: "finance.close.execute",
      fullAccess: access.permissions?.includes("*") === true,
    });

    const actorStaffId = required(
      access.access?.staffAccountId || access.staff?.id,
      "staff identity"
    );

    const result = await supabaseAdmin.rpc("operations_confirm_bank_deposit_atomic", {
      p_organization_id: access.organizationId,
      p_entity_id: required(body.entityId || body.entity_id, "entityId"),
      p_deposit_id: required(body.depositId || body.deposit_id, "depositId"),
      p_actor_id: actorStaffId,
      p_confirmation_reference: required(
        body.confirmationReference || body.confirmation_reference,
        "confirmationReference"
      ),
      p_idempotency_key: String(
        body.idempotencyKey ||
          body.idempotency_key ||
          request.headers.get("idempotency-key") ||
          `finance-bank-deposit:${crypto.randomUUID()}`
      ),
    });

    if (result.error) throw result.error;

    return NextResponse.json({
      success: true,
      organization_id: access.organizationId,
      result: result.data,
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error?.message || "Bank deposit Finance confirmation failed",
      },
      { status: statusFor(error) }
    );
  }
}
