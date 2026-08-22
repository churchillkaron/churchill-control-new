export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

import { NextResponse } from "next/server";
import { AvantiqoInvestorFilmLogoShotPreviewV1 } from "@/lib/investor-film/AvantiqoInvestorFilmLogoShotPreviewV1";
import { authorizeInvestorV9Render } from "@/lib/investor-film/InvestorV9RenderAuth";

async function handler(request) {
  if (!(await authorizeInvestorV9Render(request))) return NextResponse.json({ success: false, error: "UNAUTHORIZED" }, { status: 401 });
  try {
    return NextResponse.json(await AvantiqoInvestorFilmLogoShotPreviewV1.render());
  } catch (error) {
    return NextResponse.json({ success: false, contract: AvantiqoInvestorFilmLogoShotPreviewV1.CONTRACT, error: error?.message || "FLOATING_CHANNEL_LOGO_PREVIEW_FAILED" }, { status: 500 });
  }
}

export async function GET(request) { return handler(request); }
export async function POST(request) { return handler(request); }
