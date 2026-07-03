export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/shared/auth";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export async function GET(req) {
  try {
    await requireAuth();

    const { searchParams } = new URL(req.url);

    const access =
      await requireOrganizationAccess({
        organizationId:
          searchParams.get("organizationId"),
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

    const organizationId =
      access.organizationId;

    const { data, error } =
      await supabaseAdmin
        .from("fixed_assets")
        .select("*")
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

    const assets =
      (data || []).map(asset => ({
        ...asset,
        calculated_book_value:
          Math.max(
            0,
            Number(asset.purchase_cost || 0) -
            Number(asset.accumulated_depreciation || 0)
          ),
      }));

    return NextResponse.json({
      success: true,
      organizationId,
      assets,
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
