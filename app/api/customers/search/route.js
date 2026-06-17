export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export async function POST(req) {
  try {
    const body = await req.json();

    const tenantId = body.tenantId;
    const query = String(body.query || "").trim();

    if (!tenantId) {
      return NextResponse.json(
        {
          success: false,
          error: "Missing tenantId",
        },
        {
          status: 400,
        }
      );
    }

    if (!query) {

      const {
        data,
        error,
      } =
        await supabaseAdmin
          .from(
            "customer_loyalty_accounts"
          )
          .select("*")
          .eq(
            "tenant_id",
            tenantId
          )
          .order(
            "last_visit_at",
            {
              ascending: false,
            }
          )
          .limit(100);

      if (error) {
        throw error;
      }

      return NextResponse.json({
        success: true,
        customers:
          data || [],
      });

    }

    const { data, error } =
      await supabaseAdmin
        .from(
          "customer_loyalty_accounts"
        )
        .select("*")
        .eq(
          "tenant_id",
          tenantId
        )
        .or(
          `customer_name.ilike.%${query}%,customer_phone.ilike.%${query}%,customer_email.ilike.%${query}%`
        )
        .order(
          "last_visit_at",
          {
            ascending: false,
          }
        )
        .limit(10);

    if (error) {
      throw error;
    }

    return NextResponse.json({
      success: true,
      customers:
        data || [],
    });

  } catch (error) {

    console.error(
      "[CUSTOMER_SEARCH]",
      error
    );

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
