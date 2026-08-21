export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 800;

import { AvantiqoInvestorFilmCommunicationIntelligenceRuntimeV3 } from "@/lib/investor-film/AvantiqoInvestorFilmCommunicationIntelligenceRuntimeV3";

const TOKEN = "avq-communication-intelligence-v3-20260821";

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

    const action = String(url.searchParams.get("action") || "status").toLowerCase();
    if (action === "status") {
      return json({
        success: true,
        ...(await AvantiqoInvestorFilmCommunicationIntelligenceRuntimeV3.status()),
      });
    }
    if (action === "render") {
      return json(await AvantiqoInvestorFilmCommunicationIntelligenceRuntimeV3.render());
    }
    if (action === "download") {
      const signed_url = await AvantiqoInvestorFilmCommunicationIntelligenceRuntimeV3.downloadUrl(86400);
      if (!signed_url) return json({ success: false, error: "COMMUNICATION_INTELLIGENCE_NOT_READY" }, 404);
      return json({ success: true, signed_url });
    }

    return json({ success: false, error: "Unsupported action" }, 400);
  } catch (error) {
    console.error("AVANTIQO_COMMUNICATION_INTELLIGENCE_V3_FAILED", {
      message: error?.message || String(error),
    });
    return json({ success: false, error: error?.message || String(error) }, 500);
  }
}
