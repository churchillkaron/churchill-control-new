export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 800;

import { NextResponse } from "next/server";

import { AvantiqoInvestorFilmV9WindowRepairRuntimeV1 } from "@/lib/investor-film/AvantiqoInvestorFilmV9WindowRepairRuntimeV1";
import { authorizeInvestorV9Render } from "@/lib/investor-film/InvestorV9RenderAuth";

function json(value, status = 200) {
  return NextResponse.json(value, { status, headers: { "Cache-Control": "no-store, private" } });
}

export async function GET(request) {
  if (!(await authorizeInvestorV9Render(request))) return json({ success: false, error: "UNAUTHORIZED" }, 401);
  const action = new URL(request.url).searchParams.get("action") || "status";
  try {
    if (action === "render") return json(await AvantiqoInvestorFilmV9WindowRepairRuntimeV1.render());
    return json({ success: true, ...(await AvantiqoInvestorFilmV9WindowRepairRuntimeV1.status()) });
  } catch (error) {
    return json({ success: false, contract: AvantiqoInvestorFilmV9WindowRepairRuntimeV1.CONTRACT, error: error?.message || "V9_WINDOW_REPAIR_FAILED" }, 500);
  }
}

export async function POST(request) {
  if (!(await authorizeInvestorV9Render(request))) return json({ success: false, error: "UNAUTHORIZED" }, 401);
  try {
    return json(await AvantiqoInvestorFilmV9WindowRepairRuntimeV1.render());
  } catch (error) {
    return json({ success: false, contract: AvantiqoInvestorFilmV9WindowRepairRuntimeV1.CONTRACT, error: error?.message || "V9_WINDOW_REPAIR_FAILED" }, 500);
  }
}
