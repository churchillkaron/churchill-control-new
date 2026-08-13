import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/shared/auth";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import receivePurchaseOrder from "@/lib/inventory/procurement/receiving/receivePurchaseOrder";

export async function GET(req) {
  try {
    await requireAuth();

    const { searchParams } = new URL(req.url);
    const organizationId =
      searchParams.get("organizationId") ||
      searchParams.get("organization_id");
    const entityId =
      searchParams.get("entityId") ||
      searchParams.get("entity_id") ||
      null;

    const access = await requireOrganizationAccess({
      organizationId,
      request: req,
    });

    if (!access.success) {
      return NextResponse.json(
        { success: false, error: access.error },
        { status: access.status },
      );
    }

    let query = supabaseAdmin
      .from("goods_receipts")
      .select(`
        *,
        purchase_orders (
          po_number
        )
      `)
      .eq("organization_id", access.organizationId);

    if (entityId) {
      query = query.eq("entity_id", entityId);
    }

    const { data, error } = await query.order("created_at", {
      ascending: false,
    });

    if (error) throw error;

    return NextResponse.json({
      success: true,
      receipts: data || [],
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 },
    );
  }
}

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

    return NextResponse.json(result, {
      status: result.success ? 200 : 400,
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 },
    );
  }
}
