export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

import {
  getAvantiqoInvestorOpeningAssemblyPlan,
  renderAvantiqoInvestorOpeningAssembly,
} from "@/lib/creative/post-production/runtime/AvantiqoInvestorOpeningAssemblyRuntime";

const TOKEN = "avq-investor-opening-assembly-20260820-v1";

function json(data, status = 200) {
  return Response.json(data, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

export async function GET(request) {
  try {
    const url = new URL(request.url);
    if (url.searchParams.get("token") !== TOKEN) {
      return json({ success: false }, 404);
    }

    const action = url.searchParams.get("action") || "plan";

    if (action === "plan" || action === "status") {
      return json({
        success: true,
        deployed_execution_required: true,
        production_promotion_required: false,
        plan: getAvantiqoInvestorOpeningAssemblyPlan(),
      });
    }

    if (action === "render") {
      const force = url.searchParams.get("force") === "1";
      const result = await renderAvantiqoInvestorOpeningAssembly({ force });
      return json(result);
    }

    return json({ success: false, error: "Unsupported action" }, 400);
  } catch (error) {
    return json(
      { success: false, error: error?.message || String(error) },
      500,
    );
  }
}
