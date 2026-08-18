export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { checkFinancePermission } from "@/lib/shared/auth/checkFinancePermission";
import { createInvoiceFromCompletedService } from "@/lib/service-management/runtime/ServiceBillingHandoffRuntime";

function statusFor(error) {
  if (error?.status) return error.status;
  const message = String(error?.message || "").toLowerCase();
  if (message.includes("permission denied")) return 403;
  if (message.includes("required") || message.includes("invalid")) return 400;
  if (message.includes("not ready") || message.includes("only per-visit")) return 409;
  return 500;
}

export async function POST(request, { params }) {
  try {
    const body = await request.json().catch(() => ({}));
    const organizationId = body.organizationId || body.organization_id;
    const access = await requireOrganizationAccess({
      organizationId,
      request,
    });

    if (!access.success) {
      return NextResponse.json(
        { success: false, error: access.error },
        { status: access.status || 403 },
      );
    }

    const actorId = String(access.user?.id || "").trim();
    if (!actorId) {
      return NextResponse.json(
        { success: false, error: "authenticated user required" },
        { status: 401 },
      );
    }

    await checkFinancePermission({
      organizationId: access.organizationId,
      userId: actorId,
      permissionKey: "finance.receivables.manage",
      fullAccess: access.permissions?.includes("*") === true,
    });

    const result = await createInvoiceFromCompletedService({
      organizationId: access.organizationId,
      occurrenceId: params.occurrenceId,
      actorId,
    });

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error?.message || "Service invoice handoff failed.",
      },
      { status: statusFor(error) },
    );
  }
}
