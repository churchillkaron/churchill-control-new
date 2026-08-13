export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { checkFinancePermission } from "@/lib/shared/auth/checkFinancePermission";
import { resolveEntity } from "@/lib/platform/entities/resolveEntity";
import { listReconciliationCommand } from "@/lib/finance/reconciliation/runtime/ReconciliationApplicationService";

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const access = await requireOrganizationAccess({
      organizationId:
        searchParams.get("organizationId") ||
        searchParams.get("organization_id"),
      request,
    });

    if (!access.success) {
      return NextResponse.json({ success: false, error: access.error }, { status: access.status });
    }

    await checkFinancePermission({
      organizationId: access.organizationId,
      userId: access.user?.id,
      permissionKey: "finance.banking.view",
      fullAccess: access.permissions?.includes("*") === true,
    });

    const requestedEntityId =
      searchParams.get("entityId") || searchParams.get("entity_id");
    const entity = requestedEntityId
      ? await resolveEntity({
          organizationId: access.organizationId,
          entityId: requestedEntityId,
        })
      : null;

    if (requestedEntityId && !entity) {
      return NextResponse.json(
        { success: false, error: "Legal entity not found in organisation" },
        { status: 404 }
      );
    }

    const result = await listReconciliationCommand({
      organization_id: access.organizationId,
      entity_id: entity?.id || null,
    });

    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    const message = error.message || "Reconciliation load failed";
    const status = String(message).toLowerCase().includes("permission denied")
      ? 403
      : Number(error.status) || 500;
    return NextResponse.json({ success: false, error: message }, { status });
  }
}
