import {
  NextResponse,
} from "next/server";

import {
  requireAuth,
} from "@/lib/shared/auth";

import {
  supabaseAdmin,
} from "@/lib/shared/supabase/admin";

import {
  requireOrganizationAccess,
} from "@/lib/platform/security/requireOrganizationAccess";

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
      data,
      error,
    } = await supabaseAdmin

      .from("fixed_assets")

      .select(`
        *,
        vendors (
          id,
          legal_name,
          display_name
        ),
        legal_entities (
          id,
          legal_name,
          code
        ),
        cost_centers (
          id,
          name,
          code
        )
      `)

      .eq(
        "organization_id",
        organizationId
      )

      .order(
        "created_at",
        {
          ascending: false,
        }
      );

    if (error) {
      throw error;
    }

    const normalized =
      (data || []).map(
        asset => ({

          ...asset,

          calculated_book_value:
            Math.max(
              0,
              Number(asset.purchase_cost || 0) -
              Number(asset.accumulated_depreciation || 0)
            ),

        })
      );

    return NextResponse.json({

      success: true,

      assets:
        normalized,

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
