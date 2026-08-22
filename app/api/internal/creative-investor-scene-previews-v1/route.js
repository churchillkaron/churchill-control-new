export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 800;

import { NextResponse } from "next/server";
import { AvantiqoInvestorScenePreviewRuntimeV2 } from "@/lib/investor-film/AvantiqoInvestorScenePreviewRuntimeV2";
import { authorizeInvestorV9Render } from "@/lib/investor-film/InvestorV9RenderAuth";

async function render(request) {
  if (!(await authorizeInvestorV9Render(request))) {
    return NextResponse.json({ success: false, error: "UNAUTHORIZED" }, { status: 401 });
  }
  try {
    return NextResponse.json(await AvantiqoInvestorScenePreviewRuntimeV2.render());
  } catch (error) {
    return NextResponse.json({
      success: false,
      contract: AvantiqoInvestorScenePreviewRuntimeV2.CONTRACT,
      error: error?.message || "INVESTOR_SCENE_PREVIEW_FAILED",
    }, { status: 500 });
  }
}

export async function GET(request) { return render(request); }
export async function POST(request) { return render(request); }
