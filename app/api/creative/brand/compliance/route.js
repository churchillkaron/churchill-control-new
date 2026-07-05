export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";

import {
  CreativeBrandComplianceRuntime,
} from "@/lib/creative/brand/compliance/runtime/CreativeBrandComplianceRuntime";

export async function POST(req) {

  try {

    const body =
      await req.json();

    const result =
      CreativeBrandComplianceRuntime.evaluate({

        brand:
          body.brand,

        asset:
          body.asset,

      });

    return NextResponse.json({

      success: true,

      compliance:
        result,

    });

  } catch (error) {

    return NextResponse.json({

      success: false,

      error:
        error.message,

    }, {

      status: 500,

    });

  }

}
