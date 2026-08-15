export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";

import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { checkFinancePermission } from "@/lib/shared/auth/checkFinancePermission";
import { confirmPOSCashSessionAccounting } from "@/lib/finance/pos-cash-sessions/confirmPOSCashSessionAccounting";

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
    /required|must be|blocked|approved|incomplete|no longer matches|not configured|reconciled|closed/i.test(
      message
    )
  ) {
    return 409;
  }
  return Number(error?.status) || 500;
}

async function accessFor(request, organizationId) {
  const access = await requireOrganizationAccess({
    organizationId,
    request,
  });

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
      { success: false, error: error?.message || "Unable to resolve Finance confirmation authority" },
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

    const result = await confirmPOSCashSessionAccounting({
      organizationId: access.organizationId,
      entityId: required(body.entityId || body.entity_id, "entityId"),
      applicationId: required(
        body.applicationId || body.application_id,
        "applicationId"
      ),
      sessionId: required(body.sessionId || body.session_id, "sessionId"),
      actorStaffId: required(
        access.access?.staffAccountId || access.staff?.id,
        "staff identity"
      ),
      actorUserId: required(access.user?.id, "authenticated user"),
      actorRole: access.role || access.access?.role || access.staff?.role || null,
      notes: body.notes || body.accountingNotes || body.accounting_notes || null,
    });

    return NextResponse.json({
      success: true,
      organization_id: access.organizationId,
      result,
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error?.message || "POS cash-session accounting confirmation failed" },
      { status: statusFor(error) }
    );
  }
}
