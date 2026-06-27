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

    const organizationId =
      access.organizationId;

    const {
      data: center,
      error: loadError,
    } = await supabaseAdmin

      .from("cost_centers")

      .select("*")

      .eq(
        "organization_id",
        organizationId
      )

      .eq(
        "id",
        body.cost_center_id
      )

      .single();

    if (loadError || !center) {
      throw new Error("COST_CENTER_NOT_FOUND");
    }

    const {
      data,
      error,
    } = await supabaseAdmin

      .from("cost_centers")

      .update({

        is_active:
          !center.is_active,

        updated_at:
          new Date().toISOString(),

      })

      .eq(
        "id",
        center.id
      )

      .select()

      .single();

    if (error) {
      throw error;
    }

    return NextResponse.json({

      success: true,

      costCenter:
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
