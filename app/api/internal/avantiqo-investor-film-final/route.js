export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

import { AvantiqoInvestorFilmFinishingRuntime } from "@/lib/creative/post-production/runtime/AvantiqoInvestorFilmFinishingRuntime";

const TOKEN = "avq-investor-final-20260819";

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

    const action = url.searchParams.get("action") || "status";

    if (action === "status") {
      return json({
        success: true,
        ...(await AvantiqoInvestorFilmFinishingRuntime.status()),
      });
    }

    if (action === "render-review") {
      const result = await AvantiqoInvestorFilmFinishingRuntime.render({
        mode: "review",
        useScore: true,
      });
      return json(result);
    }

    if (action === "render-upload") {
      const result = await AvantiqoInvestorFilmFinishingRuntime.render({
        mode: "upload",
        useScore: true,
      });
      return json(result);
    }

    return json({ success: false, error: "Unsupported action" }, 400);
  } catch (error) {
    return json(
      {
        success: false,
        error: error?.message || String(error),
      },
      500,
    );
  }
}
