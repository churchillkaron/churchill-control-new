export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

import { supabaseAdmin } from "@/lib/shared/supabase/admin";

function authorized(request) {
  const secret = String(process.env.CRON_SECRET || "").trim();
  if (!secret) return false;
  return (request.headers.get("authorization") || "") === `Bearer ${secret}`;
}

export async function GET(request) {
  if (!authorized(request)) {
    return Response.json(
      { success: false, error: "Unauthorized" },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  }

  try {
    const url = new URL(request.url);
    const horizonMinutes = Math.max(
      1,
      Math.min(1440, Number(url.searchParams.get("horizonMinutes")) || 60),
    );
    const now = new Date().toISOString();
    const result = await supabaseAdmin.rpc("secretary_materialize_due_alerts", {
      p_now: now,
      p_horizon_minutes: horizonMinutes,
    });
    if (result.error) throw result.error;

    return Response.json(
      {
        success: true,
        contract: "AVANTIQO_SECRETARY_DUE_WORK_PROCESS_V1",
        result: result.data || null,
        external_authority_used: false,
      },
      { headers: { "Cache-Control": "no-store, private" } },
    );
  } catch (error) {
    console.error("SECRETARY_DUE_WORK_PROCESS_FAILED", error?.message || error);
    return Response.json(
      { success: false, error: error?.message || "Secretary due-work process failed" },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
