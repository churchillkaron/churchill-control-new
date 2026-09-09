export const dynamic = "force-dynamic";

import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { checkFinancePermission } from "@/lib/shared/auth/checkFinancePermission";
import { resolveEntity } from "@/lib/platform/entities/resolveEntity";
import { renderCustomerInvoicePdf } from "@/lib/finance/accounts-receivable/documents/renderCustomerInvoicePdf";

function jsonError(message, status = 400) {
  return Response.json({ success: false, error: message }, { status });
}

export async function GET(request, { params }) {
  try {
    const routeParams = await params;
    const invoiceId = String(routeParams?.invoiceId || "").trim();
    const { searchParams } = new URL(request.url);
    const organizationId =
      searchParams.get("organizationId") || searchParams.get("organization_id");
    const entityId =
      searchParams.get("entityId") || searchParams.get("entity_id") || null;
    const mode = searchParams.get("mode") || "auto";
    if (!invoiceId) return jsonError("invoiceId required");
    const access = await requireOrganizationAccess({ organizationId, request });
    if (!access.success) return jsonError(access.error, access.status);

    await checkFinancePermission({
      organizationId: access.organizationId,
      userId: access.user?.id,
      permissionKey: "finance.receivables.view",
      fullAccess: access.permissions?.includes("*") === true,
    });

    let resolvedEntityId = entityId;
    if (entityId) {
      const entity = await resolveEntity({
        organizationId: access.organizationId,
        entityId,
      });
      if (!entity) return jsonError("Legal entity not found in organisation", 404);
      resolvedEntityId = entity.id;
    }

    const rendered = await renderCustomerInvoicePdf({
      organizationId: access.organizationId,
      entityId: resolvedEntityId,
      invoiceId,
      mode,
    });
    return new Response(rendered.buffer, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${rendered.filename}"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    const message = error?.message || "Customer invoice PDF could not be rendered";
    const status = Number(error?.status) ||
      (/permission denied/i.test(message) ? 403 : /not found/i.test(message) ? 404 : 400);
    return jsonError(message, status);
  }
}
