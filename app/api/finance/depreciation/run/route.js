import { NextResponse }
from "next/server";

import { postDepreciationToLedger }
from "@/lib/finance/accounting/postDepreciationToLedger";

import { getTenantId }
from "@/lib/shared/tenant/getTenantId";

// =====================================
// RUN DEPRECIATION
// =====================================

export async function POST(
  req
) {

  try {

    const body =
      await req.json();

    const {
      assetId,
    } = body;

    if (!assetId) {

      return NextResponse.json(
        {
          error:
            "Missing assetId",
        },
        {
          status: 400,
        }
      );

    }

    const tenantId =
      await getTenantId();

    const result =
      await postDepreciationToLedger({

        tenantId,

        assetId,

        createdBy:
          "system",

      });

    return NextResponse.json({

      success: true,

      result,

    });

  } catch (err) {

    console.error(
      "DEPRECIATION ERROR:",
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