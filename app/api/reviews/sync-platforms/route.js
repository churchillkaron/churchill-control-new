export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";

export async function POST(req) {
  try {
    const { tenantId } = await req.json();

    if (!tenantId) {
      return NextResponse.json(
        {
          success: false,
          error: "Missing tenantId",
        },
        {
          status: 400,
        }
      );
    }

    const origin =
      process.env.NEXT_PUBLIC_APP_URL ||
      process.env.APP_URL ||
      "http://localhost:3000";

    const syncResults = [];

    for (const route of [
      "sync-google",
      "sync-facebook",
    ]) {

      try {

        const response =
          await fetch(
            `${origin}/api/reviews/${route}`,
            {
              method: "POST",
              headers: {
                "Content-Type":
                  "application/json",
              },
              body: JSON.stringify({
                tenantId,
              }),
            }
          );

        const result =
          await response.json();

        syncResults.push({
          route,
          success:
            result.success || false,
          synced:
            result.synced || 0,
          error:
            result.error || null,
        });

      } catch (error) {

        syncResults.push({
          route,
          success: false,
          synced: 0,
          error:
            error.message,
        });

      }

    }

    const totalSynced =
      syncResults.reduce(
        (sum, item) =>
          sum +
          Number(
            item.synced || 0
          ),
        0
      );

    return NextResponse.json({
      success: true,
      tenantId,
      totalSynced,
      results:
        syncResults,
    });

  } catch (error) {

    console.error(
      "[SYNC_PLATFORMS]",
      error
    );

    return NextResponse.json(
      {
        success: false,
        error:
          error.message,
      },
      {
        status: 500,
      }
    );

  }

}
