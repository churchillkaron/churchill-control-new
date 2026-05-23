import { NextResponse } from "next/server";

import buildStaffRuntime
from "@/lib/runtime/buildStaffRuntime";

import buildRealtimeSnapshot
from "@/lib/intelligence/realtime/buildRealtimeSnapshot";

import { loadStaffPerformance }
from "@/lib/staff/loadStaffPerformance";

import { createClient }
from "@supabase/supabase-js";

const supabase =
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );

export async function GET(request) {

  try {

    const tenant_id =
      request.nextUrl.searchParams.get(
        "tenant_id"
      );

    const staff_name =
      request.nextUrl.searchParams.get(
        "staff_name"
      );

    const [
      performance,
      snapshot,
      tablesResult,
      ordersResult,
      paymentsResult,
    ] = await Promise.all([

      loadStaffPerformance(
        tenant_id
      ),

      buildRealtimeSnapshot({
        tenant_id,
      }),

      supabase
        .from("tables")
        .select("*")
        .eq(
          "tenant_id",
          tenant_id
        ),

      supabase
        .from("orders")
        .select("*")
        .eq(
          "tenant_id",
          tenant_id
        ),

      supabase
        .from("payments")
        .select("*")
        .eq(
          "tenant_id",
          tenant_id
        ),
    ]);

    const staff =
      performance.find(
        member =>
          member.name ===
          staff_name
      ) || null;

    const runtime =
      buildStaffRuntime({

        staff,

        tables:
          tablesResult.data || [],

        orders:
          ordersResult.data || [],

        payments:
          paymentsResult.data || [],

      });

    return NextResponse.json({

      success: true,

      runtime,

      performance,

      snapshot,

    });

  } catch (error) {

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
