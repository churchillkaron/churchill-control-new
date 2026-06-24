export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";

export async function POST(req) {

  try {

    const body =
      await req.json();

    const access =
      await requireOrganizationAccess({
        organizationId:
          body.organizationId,
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

    const tenantId =
      access.tenantId;

    const customerPhone =
      body.customerPhone;

    const {
      data: sessions,
      error: sessionError,
    } = await supabaseAdmin
      .from("table_sessions")
      .select("id")
      .eq("tenant_id", tenantId)
      .eq("customer_phone", customerPhone);

    if (sessionError) {
      throw sessionError;
    }

    const sessionIds =
      (sessions || []).map(
        s => s.id
      );

    if (!sessionIds.length) {
      return NextResponse.json({
        success: true,
        history: [],
      });
    }

    const {
      data: orders,
      error: ordersError,
    } = await supabaseAdmin
      .from("orders")
      .select("*")
      .in("session_id", sessionIds)
      .order(
        "created_at",
        {
          ascending: false,
        }
      );

    if (ordersError) {
      throw ordersError;
    }

    const orderIds =
      (orders || []).map(
        o => o.id
      );

    const {
      data: items,
      error: itemsError,
    } = await supabaseAdmin
      .from("order_items")
      .select("*")
      .in(
        "order_id",
        orderIds.length
          ? orderIds
          : ["00000000-0000-0000-0000-000000000000"]
      );

    if (itemsError) {
      throw itemsError;
    }

    const history =
      (orders || []).map(
        order => ({
          ...order,
          items:
            (items || []).filter(
              item =>
                item.order_id === order.id
            ),
        })
      );

    return NextResponse.json({
      success: true,
      history,
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
