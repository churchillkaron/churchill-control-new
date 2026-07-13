export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";

import { getExecutiveAlerts } from "@/lib/finance/reporting/alerts/getExecutiveAlerts";

import {
  BusinessIntelligenceRuntime,
} from "@/lib/platform/service-runtime/intelligence/runtime/BusinessIntelligenceRuntime";

export async function POST(request) {
  try {
    const body =
      await request.json();

    const alerts =
      await getExecutiveAlerts({
        organizationId:
          body.organizationId,
      });


    const intelligence =
      await BusinessIntelligenceRuntime
        .analyzeOrganization(
          body.organizationId
        )
        .catch(
          () => null
        );


    const aiAlerts =
      (
        intelligence?.recommendations ||
        []
      )
      .map(
        item => ({

          severity:
            "info",

          message:
            item.message,

          source:
            item.provider,

        })
      );


    return NextResponse.json({
      success: true,

      alerts: [
        ...(alerts || []),
        ...aiAlerts,
      ],

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
