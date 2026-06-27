export const dynamic = "force-dynamic";

import { NextResponse }
from "next/server";

import { postDepreciationToLedger }
from "@/lib/finance/accounting/postDepreciationToLedger";

import {
  requireOrganizationAccess,
} from "@/lib/platform/security/requireOrganizationAccess";

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

    const result =
      await postDepreciationToLedger({

        organizationId,

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