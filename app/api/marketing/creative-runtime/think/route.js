export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { CreativeRuntimeThink } from "@/lib/marketing/ai/runtime/CreativeRuntime";

export async function POST(request) {
  try {
    const body = await request.json();

    const production =
      await CreativeRuntimeThink({
        tenantId: body.tenantId,
        pageId: body.pageId,
        business: body.business || body.selectedBusiness || {},
        brand: body.brand || {},
        objective: body.objective || body.prompt || "",
        platform: body.platform || "facebook",
        durationSeconds: body.durationSeconds || body.duration || 30,
        budgetMode: body.budgetMode || "cost-effective",
        assets: body.assets || body.selectedAssets || [],
        userInput: body,
      });

    return NextResponse.json({
      success: true,
      production,
    });
  } catch (err) {
    console.error("CREATIVE RUNTIME THINK ERROR:", err);

    return NextResponse.json(
      {
        success: false,
        error: err.message,
      },
      {
        status: 500,
      }
    );
  }
}
