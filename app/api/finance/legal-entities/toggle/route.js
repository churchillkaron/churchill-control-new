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
