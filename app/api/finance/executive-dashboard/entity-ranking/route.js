export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";

import { getEntityRanking } from "@/lib/finance/reporting/reports/getEntityRanking";

import {
  BusinessIntelligenceRuntime,
} from "@/lib/platform/service-runtime/intelligence/runtime/BusinessIntelligenceRuntime";

export async function POST(request) {
  try {
    const body =
      await request.json();

    const rankings =
      await getEntityRanking({
        organizationId:
          body.organizationId,
        entities:
          body.entities,
      });

    const intelligence =
      await BusinessIntelligenceRuntime
        .analyzeOrganization(
          body.organizationId
        )
        .catch(
          () => null
        );


    return NextResponse.json({

      success: true,

      rankings,

      intelligence,

    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        message:
          error.message,
      },
      {
        status: 400,
      }
    );
  }
}
