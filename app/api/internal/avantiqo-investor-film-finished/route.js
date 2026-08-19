export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

import { AvantiqoInvestorFilmFinishedRuntime } from "@/lib/creative/post-production/runtime/AvantiqoInvestorFilmFinishedRuntime";

const TOKEN = "avq-investor-finished-20260819";

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
      return json({ success: true, ...(await AvantiqoInvestorFilmFinishedRuntime.status()) });
    }

    if (action === "render") {
      return json(await AvantiqoInvestorFilmFinishedRuntime.render());
    }

    if (action === "download") {
      const signed_url = await AvantiqoInvestorFilmFinishedRuntime.downloadUrl(86400);
      if (!signed_url) return json({ success: false, error: "FINISHED_VIDEO_NOT_READY" }, 404);
      return json({ success: true, signed_url });
    }

    return json({ success: false, error: "Unsupported action" }, 400);
  } catch (error) {
    return json({ success: false, error: error?.message || String(error) }, 500);
  }
}
