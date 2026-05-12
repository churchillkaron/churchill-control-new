export const runtime =
  "nodejs";

import { NextResponse }
from "next/server";

import { uploadMarketingAssetFlow }
from "@/lib/services/uploadMarketingAssetFlow";

export async function POST(
  request
) {

  try {

    const formData =
      await request.formData();

    const tenantId =
      formData.get(
        "tenantId"
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

    if (!tenantId) {

      return NextResponse.json(

        {

          success: false,

          error:
            "Missing tenantId",

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

        tenantId,

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