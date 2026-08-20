export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 800;

import {
  getAvantiqoInvestorSemanticSegmentStatus,
  renderAvantiqoInvestorProductProof,
  renderAvantiqoInvestorFinalAct,
} from "@/lib/creative/post-production/runtime/AvantiqoInvestorSemanticSegmentRuntime";

const TOKEN = "avq-investor-semantic-segments-20260820-v1";

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
    const force = text(url.searchParams.get("force")).toLowerCase() === "true";

    if (action === "status") {
      return json(await getAvantiqoInvestorSemanticSegmentStatus());
    }

    if (action === "render-product-proof") {
      return json(await renderAvantiqoInvestorProductProof({ force }));
    }

    if (action === "render-final-act") {
      return json(await renderAvantiqoInvestorFinalAct({ force }));
    }

    return json({ success: false, error: "Unsupported action" }, 400);
  } catch (error) {
    return json(
      { success: false, error: error?.message || String(error) },
      500,
    );
  }
}
