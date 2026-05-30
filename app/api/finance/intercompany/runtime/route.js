import {
  NextResponse,
} from "next/server";

import {
  requireAuth,
} from "@/lib/shared/auth";

import {
  getTenantId,
} from "@/lib/shared/tenant/getTenantId";

import {
  supabaseAdmin,
} from "@/lib/shared/supabase/admin";

export async function POST() {

  try {

    await requireAuth();

    const tenantId =
      await getTenantId();

    if (!tenantId) {

      return NextResponse.json(
        {
          success: false,
          error:
            "Tenant not found",
        },
        {
          status: 401,
        }
      );

    }

    const [
      entitiesResult,
      transactionsResult,
    ] = await Promise.all([

      supabaseAdmin
        .from("legal_entities")
        .select("*")
        .eq(
          "tenant_id",
          tenantId
        )
        .eq(
          "is_active",
          true
        )
        .order(
          "legal_name",
          {
            ascending: true,
          }
        ),

      supabaseAdmin
        .from("intercompany_transactions")
        .select(`
          *,
          from_entity:from_legal_entity_id (
            id,
            legal_name,
            code
          ),
          to_entity:to_legal_entity_id (
            id,
            legal_name,
            code
          )
        `)
        .eq(
          "tenant_id",
          tenantId
        )
        .order(
          "created_at",
          {
            ascending: false,
          }
        ),

    ]);

    return NextResponse.json({

      success: true,

      entities:
        entitiesResult.data || [],

      transactions:
        transactionsResult.data || [],

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
