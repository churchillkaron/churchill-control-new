export const dynamic = "force-dynamic";

import { NextResponse }
from "next/server";

import { supabase }
from "@/lib/shared/supabase/client";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";

export async function POST(
  req
) {

  try {

    const body =
      await req.json();

    const assetId =
      body?.assetId;
    const organizationId =
      body?.organizationId;

    if (!organizationId) {
      return NextResponse.json({ success: false, error: "Missing organizationId" }, { status: 400 });
    }

    const access = await requireOrganizationAccess({
      organizationId,
      request: req,
      requiredAnyPermission: ["creative.asset.upload", "marketing.campaign.manage", "creative.*"],
    });
    if (!access.success) {
      return NextResponse.json({ success: false, error: access.error || "Organization access denied" }, { status: access.status || 403 });
    }

    if (!assetId) {

      return NextResponse.json(

        {

          success: false,

          error:
            "Missing assetId",

        },

        {

          status: 400,

        }

      );

    }

    // =====================================
    // GET ASSET
    // =====================================

    const {

      data: asset,

      error: fetchError,

    } = await supabase

      .from(
        "creative_assets"
      )

      .select("*")

      .eq(
        "id",
        assetId
      )
      .eq("organization_id", access.organizationId)

      .single();

    if (
      fetchError ||
      !asset
    ) {

      throw new Error(
        "Asset not found"
      );

    }

    // =====================================
    // DELETE STORAGE FILE
    // =====================================

    if (
      asset.image_url
    ) {

      try {

        const split =
          asset.image_url.split(

            "/marketing-assets/"

          );

        const storagePath =
          split?.[1];

        if (storagePath) {

          await supabase.storage

            .from(
              "marketing-assets"
            )

            .remove([
              storagePath,
            ]);

        }

      } catch (err) {

        console.error(
          "STORAGE DELETE ERROR:",
          err
        );

      }

    }

    // =====================================
    // DELETE DATABASE
    // =====================================

    const {

      error: deleteError,

    } = await supabase

      .from(
        "creative_assets"
      )

      .delete()

      .eq(
        "id",
        assetId
      )
      .eq("organization_id", access.organizationId);

    if (deleteError) {

      throw deleteError;

    }

    return NextResponse.json({

      success: true,

    });

  } catch (err) {

    console.error(
      "DELETE ASSET ERROR:",
      err
    );

    return NextResponse.json(

      {

        success: false,

        error:
          "Unable to delete marketing asset",

      },

      {

        status: 500,

      }

    );

  }

}