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

export async function POST(req) {

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

    const body =
      await req.json();

    const {
      data: entity,
      error: loadError,
    } = await supabaseAdmin

      .from("legal_entities")

      .select("*")

      .eq(
        "tenant_id",
        tenantId
      )

      .eq(
        "id",
        body.entity_id
      )

      .single();

    if (loadError || !entity) {
      throw new Error("ENTITY_NOT_FOUND");
    }

    const {
      data,
      error,
    } = await supabaseAdmin

      .from("legal_entities")

      .update({

        is_active:
          !entity.is_active,

        updated_at:
          new Date().toISOString(),

      })

      .eq(
        "id",
        entity.id
      )

      .select()

      .single();

    if (error) {
      throw error;
    }

    return NextResponse.json({

      success: true,

      entity:
        data,

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
