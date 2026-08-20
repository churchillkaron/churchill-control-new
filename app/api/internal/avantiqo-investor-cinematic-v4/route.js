export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 800;

import {
  getAvantiqoInvestorCinematicV4Status,
  renderAvantiqoInvestorCinematicV4,
} from "@/lib/creative/post-production/runtime/AvantiqoInvestorCinematicSegmentRuntimeV4";

const TOKEN = "avq-investor-cinematic-v4-20260821";

function json(data, status = 200) {
  return Response.json(data, {
    status,
    headers: { "Cache-Control": "no-store, private" },
  });
}

export async function GET(request) {
  try {
    const url = new URL(request.url);
    if (url.searchParams.get("token") !== TOKEN) return json({ success: false }, 404);
    const action = url.searchParams.get("action") || "status";
    const scope = url.searchParams.get("scope") || "all";
    if (action === "status") return json(await getAvantiqoInvestorCinematicV4Status());
    if (action === "render") {
      if (!["all", "product", "final"].includes(scope)) return json({ success: false, error: "Unsupported scope" }, 400);
      return json(await renderAvantiqoInvestorCinematicV4(scope));
    }
    return json({ success: false, error: "Unsupported action" }, 400);
  } catch (error) {
    return json({ success: false, error: error?.message || String(error) }, 500);
  }
}
