import {
  NextResponse,
} from "next/server";

import {
  supabaseAdmin,
} from "@/lib/shared/supabase/admin";

import {
  requireOrganizationAccess,
} from "@/lib/platform/security/requireOrganizationAccess";

async function attachSupplierResponses(orders, organizationId) {
  const rows = Array.isArray(orders) ? orders : [];
  const purchaseOrderIds = rows.map((row) => row.id).filter(Boolean);
  if (!purchaseOrderIds.length) return rows;

  const { data: responses, error } = await supabaseAdmin
    .from("supplier_purchase_order_responses")
    .select("id,purchase_order_id,response_status,supplier_note,promised_delivery_date,dispatched_at,dispatch_reference,acknowledged_at,declined_at,updated_at")
    .eq("organization_id", organizationId)
    .in("purchase_order_id", purchaseOrderIds)
    .order("updated_at", { ascending: false });
  if (error) throw error;

  const responseByPurchaseOrderId = new Map();
  for (const response of responses || []) {
    const key = String(response.purchase_order_id);
    if (!responseByPurchaseOrderId.has(key)) responseByPurchaseOrderId.set(key, response);
  }

  return rows.map((row) => ({
    ...row,
    supplier_response: responseByPurchaseOrderId.get(String(row.id)) || null,
  }));
}

export async function POST(req) {

  try {

    const body =
      await req.json();

    const access =
      await requireOrganizationAccess({

        organizationId:
          body.organizationId ||
          body.organization_id,

      });

    if (!access.success) {

      return NextResponse.json(
        {
          success: false,
          error:
            access.error,
        },
        {
          status:
            access.status,
        }
      );

    }

    const entityId =
      body.entityId ||
      body.entity_id ||
      null;

    let query = supabaseAdmin
      .from("purchase_orders")
      .select(`
        *,
        parties (
          id,
          display_name
        )
      `)

      .eq(
        "organization_id",
        access.organizationId
      );

    if (entityId) {
      query =
        query.eq(
          "entity_id",
          entityId
        );
    }

    const {
      data,
      error,
    } = await query

      .order(
        "created_at",
        {
          ascending: false,
        }
      );

    if (error) {
      throw error;
    }

    const enrichedOrders = await attachSupplierResponses(data || [], access.organizationId);

    return NextResponse.json({
      success: true,
      orders: enrichedOrders,
    });

  } catch (error) {

    console.error(error);

    return NextResponse.json(
      {
        success: false,
        error:
          error.message,
      },
      {
        status: 500,
      }
    );

  }

}



export async function GET(req) {

  try {

    const { searchParams } = new URL(req.url);

    const organizationId =
      searchParams.get("organizationId") ||
      searchParams.get("organization_id");
    const entityId =
      searchParams.get("entityId") ||
      searchParams.get("entity_id") ||
      null;
    const purchaseOrderId =
      searchParams.get("purchase_order_id") ||
      searchParams.get("id") ||
      null;

    const access =
      await requireOrganizationAccess({
        organizationId,
      });

    if (!access.success) {
      return NextResponse.json(
        {
          success: false,
          error: access.error,
        },
        {
          status: access.status,
        }
      );
    }

    let query = supabaseAdmin
      .from("purchase_orders")
      .select(`
        *,
        parties (
          id,
          display_name
        )
      `)
      .eq("organization_id", access.organizationId);

    if (entityId) query = query.eq("entity_id", entityId);
    if (purchaseOrderId) query = query.eq("id", purchaseOrderId);

    const { data, error } = await query.order("created_at", {
      ascending: false,
    });

    if (error) throw error;

    const enrichedOrders = await attachSupplierResponses(data || [], access.organizationId);

    return NextResponse.json({
      success: true,
      purchaseOrders: enrichedOrders,
      rows: enrichedOrders,
    });

  } catch (error) {

    return NextResponse.json(
      {
        success: false,
        error: error.message,
      },
      {
        status: 500,
      }
    );

  }

}
