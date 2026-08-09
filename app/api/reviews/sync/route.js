export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import resolveAuthenticatedStaffContext from "@/lib/people/runtime/resolveAuthenticatedStaffContext";

export async function POST(request) {
  try {
    const body = await request.json();
    const context = await resolveAuthenticatedStaffContext({
      request,
      organizationId:
        body?.organizationId || body?.organization_id || null,
    });

    if (!context.success) {
      return NextResponse.json(
        {
          success: false,
          error: context.error,
          code: context.code,
          availableOrganizationIds:
            context.availableOrganizationIds || [],
        },
        { status: context.status || 403 }
      );
    }

    const baseUrl =
      process.env.NEXT_PUBLIC_APP_URL ||
      process.env.APP_URL ||
      "http://localhost:3000";

    const cookie = request.headers.get("cookie");
    const authorization = request.headers.get("authorization");
    const results = [];

    for (const route of ["sync-google", "sync-facebook"]) {
      try {
        const headers = {
          "Content-Type": "application/json",
          "x-avantiqo-organization-id": context.organizationId,
        };

        if (cookie) {
          headers.cookie = cookie;
        }

        if (authorization) {
          headers.authorization = authorization;
        }

        const response = await fetch(
          `${baseUrl}/api/reviews/${route}`,
          {
            method: "POST",
            headers,
            body: JSON.stringify({
              organizationId: context.organizationId,
            }),
            cache: "no-store",
          }
        );

        const data = await response.json();
        results.push({
          route,
          ...data,
        });
      } catch (error) {
        results.push({
          route,
          success: false,
          error: error?.message || "Review sync failed",
        });
      }
    }

    return NextResponse.json({
      success: true,
      organizationId: context.organizationId,
      results,
    });
  } catch (error) {
    console.error("SYNC_REVIEWS_ERROR", error);

    return NextResponse.json(
      {
        success: false,
        error: error?.message || "Unable to sync reviews",
      },
      { status: 500 }
    );
  }
}
