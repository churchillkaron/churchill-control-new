import { NextResponse } from "next/server";

import loadOperationalSettings
from "@/lib/settings/loadOperationalSettings";

export async function GET(req) {
  try {

    const { searchParams } =
      new URL(req.url);

    const organizationId =
      searchParams.get("organizationId");

    if (!organizationId) {
      return NextResponse.json(
        {
          success: false,
          error: "organizationId required",
        },
        {
          status: 400,
        }
      );
    }

    const settings =
      await loadOperationalSettings({
        organizationId,
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
