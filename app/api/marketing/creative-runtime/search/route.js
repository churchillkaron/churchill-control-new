export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { CreativeSearchRuntime } from "@/lib/marketing/ai/intelligence/CreativeSearchRuntime";

export async function POST(request) {
  try {
    const body =
      await request.json();

    const access = await requireOrganizationAccess({
      organizationId: body.organizationId || body.organization_id,
      request: request,
    });

    if (!access.success) {
      return NextResponse.json(
        { success: false, error: access.error },
        { status: access.status || 403 },
      );
    }

    const result =
      await CreativeSearchRuntime({
        organizationId:
          access.organizationId,
        pageId:
          body.pageId,
        objective:
          body.objective || body.prompt || "",
        platform:
          body.platform || "facebook",
        durationSeconds:
          body.durationSeconds || body.duration || 30,
        budgetMode:
          body.budgetMode || "cost-effective",
        business:
          body.business ||
          body.selectedBusiness ||
          {},
        brand:
          body.brand || {},
        assets:
          body.assets ||
          body.selectedAssets ||
          [],
        campaignMemory:
          body.campaignMemory || [],
        performanceMemory:
          body.performanceMemory || [],
        userInput:
          body,
      });

    return NextResponse.json(result);
  } catch (err) {
    console.error(
      "CREATIVE SEARCH RUNTIME ERROR:",
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
