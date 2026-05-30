import {
  NextResponse,
} from "next/server";

import {
  requireAuth,
} from "@/lib/shared/auth";

import {
  requireOrganizationAccess,
} from "@/lib/platform/security/requireOrganizationAccess";

import {
  supabaseAdmin,
} from "@/lib/shared/supabase/admin";

export async function POST(req) {

  try {

    await requireAuth();

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
          error:
            access.error,
        },
        {
          status:
            access.status,
        }
      );

    }

    const tenantId =
      access.tenantId;

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
