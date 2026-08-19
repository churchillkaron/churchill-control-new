export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 180;

import { AvantiqoInvestorFounderAudioLockRuntime } from "@/lib/creative/post-production/runtime/AvantiqoInvestorFounderAudioLockRuntime";

const TOKEN = "avq-investor-founder-audio-lock-20260819-v1";

function json(data, status = 200) {
  return Response.json(data, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

export async function GET(request) {
  try {
    const url = new URL(request.url);
    if (url.searchParams.get("token") !== TOKEN) return json({ success: false }, 404);

    const action = url.searchParams.get("action") || "status";
    if (action === "status") return json(await AvantiqoInvestorFounderAudioLockRuntime.status());
    if (action === "render") return json(await AvantiqoInvestorFounderAudioLockRuntime.render());
    if (action === "download") {
      const audio_url = await AvantiqoInvestorFounderAudioLockRuntime.downloadUrl(86400);
      if (!audio_url) return json({ success: false, error: "FOUNDER_AUDIO_LOCK_NOT_READY" }, 404);
      return json({ success: true, audio_url });
    }

    return json({ success: false, error: "Unsupported action" }, 400);
  } catch (error) {
    return json({ success: false, error: error?.message || String(error) }, 500);
  }
}
