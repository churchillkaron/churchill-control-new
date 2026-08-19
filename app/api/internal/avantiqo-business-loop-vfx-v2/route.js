export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

import { AvantiqoInvestorFilmBusinessLoopRuntimeV2 } from "@/lib/investor-film/AvantiqoInvestorFilmBusinessLoopRuntimeV2";

const TOKEN = "avq-business-loop-vfx-v2-20260819";

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
        ...(await AvantiqoInvestorFilmBusinessLoopRuntimeV2.status()),
      });
    }

    if (action === "render") {
      return json(await AvantiqoInvestorFilmBusinessLoopRuntimeV2.render());
    }

    if (action === "download") {
      const signed_url = await AvantiqoInvestorFilmBusinessLoopRuntimeV2.downloadUrl(86400);
      if (!signed_url) {
        return json({ success: false, error: "BUSINESS_LOOP_V2_NOT_READY" }, 404);
      }
      return json({ success: true, signed_url });
    }

    return json({ success: false, error: "Unsupported action" }, 400);
  } catch (error) {
    return json({ success: false, error: error?.message || String(error) }, 500);
  }
}
