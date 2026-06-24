export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";

export async function POST(req) {
  try {

    const body = await req.json();

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

    const query =
      String(body.query || "").trim();

    let db =
      supabaseAdmin
        .from("customer_loyalty_accounts")
        .select("*")
        .eq("tenant_id", tenantId);

    if (query) {
      db = db.or(
        `customer_name.ilike.%${query}%,customer_phone.ilike.%${query}%,customer_email.ilike.%${query}%`
      );
    }

    const { data, error } =
      await db
        .order(
          "last_visit_at",
          {
            ascending: false,
          }
        )
        .limit(
          query ? 10 : 100
        );

    if (error) {
      throw error;
    }

    return NextResponse.json({
      success: true,
      customers:
        data || [],
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
