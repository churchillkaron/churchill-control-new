export const dynamic = "force-dynamic";

export const runtime =
  "nodejs";

import { NextResponse }
from "next/server";

import { uploadMarketingAssetFlow }
from "@/lib/marketing/services/uploadMarketingAssetFlow";

export async function POST(
  request
) {

  try {

    const formData =
      await request.formData();

    const organizationId =
      formData.get(
        "organizationId"
      );

    const pageId =
      formData.get(
        "pageId"
      );

    const assetType =
      formData.get(
        "assetType"
      );

    const name =
      formData.get(
        "name"
      );

    const file =
      formData.get(
        "file"
      );

    // =====================================
    // VALIDATION
    // =====================================

    if (!organizationId) {

      return NextResponse.json(

        {

          success: false,

          error:
            "Missing organizationId",

        },

        {

          status: 400,

        }

      );

    }

    if (!file) {

      return NextResponse.json(

        {

          success: false,

          error:
            "Missing file",

        },

        {

          status: 400,

        }

      );

    }

    // =====================================
    // ALLOWED TYPES
    // =====================================

    const allowedTypes = [

      "staff",

      "venue",

      "cocktail",

      "food",

      "interior",

      "branding",

      "event",

    ];

    if (
      assetType &&
      !allowedTypes.includes(
        assetType
      )
    ) {

      return NextResponse.json(

        {

          success: false,

          error:
            "Invalid asset type",

        },

        {

          status: 400,

        }

      );

    }

    // =====================================
    // UPLOAD FLOW
    // =====================================

    const result =
      await uploadMarketingAssetFlow({

        organizationId,

        pageId,

        file,

        assetType,

        name,

      });

    return NextResponse.json(
      result
    );

  } catch (err) {

    console.error(
      "UPLOAD ASSET API ERROR:",
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