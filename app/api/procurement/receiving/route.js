import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/shared/auth";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import receivePurchaseOrder from "@/lib/inventory/procurement/receiving/receivePurchaseOrder";

export async function POST(req) {
  try {
    await requireAuth();
    const body = await req.json();

    const access = await requireOrganizationAccess({
      organizationId: body.organizationId || body.organization_id,
      request: req,
    });

    if (!access.success) {
      return NextResponse.json(
        { success: false, error: access.error },
        { status: access.status },
      );
    }

    const actorId = access.access?.staffAccountId || null;
    const receivedBy =
      access.staff?.display_name ||
      access.staff?.name ||
      access.user?.email ||
      "WAREHOUSE";

    const result = await receivePurchaseOrder({
      organization_id: access.organizationId,
      entity_id: body.entity_id || body.entityId || null,
      purchase_order_id: body.purchase_order_id || body.purchaseOrderId,
      received_by: receivedBy,
      actor_id: actorId,
    });

    return NextResponse.json(result, { status: result.success ? 200 : 400 });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 },
    );
  }
}
