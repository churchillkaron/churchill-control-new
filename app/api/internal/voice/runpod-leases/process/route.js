import {
  reapExpiredVoiceRunpodLeases,
} from "@/lib/platform/service-runtime/providers/avantiqo-voice/AvantiqoVoiceRunpodLeaseRuntime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

function authorized(request) {
  const secret = String(process.env.CRON_SECRET || "").trim();
  if (!secret) return false;
  return (request.headers.get("authorization") || "") === `Bearer ${secret}`;
}

export async function GET(request) {
  if (!authorized(request)) {
    return Response.json(
      { success: false, error: "Unauthorized" },
      { status: 401 },
    );
  }

  try {
    const url = new URL(request.url);
    const limit = Math.max(
      1,
      Math.min(Number(url.searchParams.get("limit")) || 10, 25),
    );
    const result = await reapExpiredVoiceRunpodLeases({ limit });
    return Response.json(result, {
      status: result.success ? 200 : 207,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return Response.json(
      {
        success: false,
        error: error?.message || "Voice RunPod lease cleanup failed",
        blind_queue_purge_performed: false,
      },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
