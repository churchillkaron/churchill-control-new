export const dynamic = "force-dynamic";

import { NextResponse }
from "next/server";

import { supabase }
from "@/lib/shared/supabase/client";

export async function POST(
  req
) {

  try {

    const body =
      await req.json();

    const assetId =
      body?.assetId;

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
        "marketing_assets"
      )

      .select("*")

      .eq(
        "id",
        assetId
      )

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
        "marketing_assets"
      )

      .delete()

      .eq(
        "id",
        assetId
      );

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
          err.message,

      },

      {

        status: 500,

      }

    );

  }

}