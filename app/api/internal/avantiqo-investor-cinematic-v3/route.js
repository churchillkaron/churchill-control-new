export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 800;

import {
  getAvantiqoInvestorCinematicV3Status,
  renderAvantiqoInvestorCinematicV3,
} from "@/lib/creative/post-production/runtime/AvantiqoInvestorCinematicSegmentRuntime";

const TOKEN = "avq-investor-cinematic-v3-20260821";

function json(data, status = 200) {
  return Response.json(data, {
    status,
    headers: {
      "Cache-Control": "no-store, private",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

function text(value) {
  return String(value ?? "").trim();
}

export async function GET(request) {
  try {
    const url = new URL(request.url);
    if (text(url.searchParams.get("token")) !== TOKEN) {
      return json({ success: false }, 404);
    }

    const action = text(url.searchParams.get("action") || "status").toLowerCase();
    if (action === "status") {
      return json(await getAvantiqoInvestorCinematicV3Status());
    }
    if (action === "render") {
      const scope = text(url.searchParams.get("scope") || "all").toLowerCase();
      if (!["all", "opening", "product", "final"].includes(scope)) {
        return json({ success: false, error: "Unsupported scope" }, 400);
      }
      return json(await renderAvantiqoInvestorCinematicV3(scope));
    }
    return json({ success: false, error: "Unsupported action" }, 400);
  } catch (error) {
    return json({ success: false, error: error?.message || String(error) }, 500);
  }
}
