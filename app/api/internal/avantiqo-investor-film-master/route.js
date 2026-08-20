export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 800;

import {
  AvantiqoInvestorFilmMasterRuntime,
} from "@/lib/creative/post-production/runtime/AvantiqoInvestorFilmMasterRuntime";

const TOKEN = "avq-investor-film-master-20260820-v1";

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
      return json(await AvantiqoInvestorFilmMasterRuntime.status());
    }

    if (action === "preflight") {
      return json(await AvantiqoInvestorFilmMasterRuntime.preflight());
    }

    if (action === "render") {
      const force = url.searchParams.get("force") === "1";
      return json(await AvantiqoInvestorFilmMasterRuntime.render({ force }));
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
