import { NextResponse } from "next/server";

import loadOperationalSettings
from "@/lib/settings/loadOperationalSettings";

export async function GET(req) {
  try {

    const { searchParams } =
      new URL(req.url);

    const tenantId =
      searchParams.get("tenantId");

    if (!tenantId) {
      return NextResponse.json(
        {
          success: false,
          error: "tenantId required",
        },
        {
          status: 400,
        }
      );
    }

    const settings =
      await loadOperationalSettings({
        tenantId,
        domain: "POS",
      });

    return NextResponse.json({
      success: true,
      settings,
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
