export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { processNextSecretaryJob } from "@/lib/operator/secretary/SecretaryJobExecutionRuntime";

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
    const limit = Math.max(1, Math.min(Number(url.searchParams.get("limit")) || 3, 8));
    const workerId = `secretary-job:${crypto.randomUUID()}`;
    const results = [];

    for (let index = 0; index < limit; index += 1) {
      try {
        const outcome = await processNextSecretaryJob({ workerId, leaseSeconds: 300 });
        if (outcome.status === "idle") break;
        results.push(outcome);
      } catch (error) {
        const message = String(error?.message || error || "Secretary job execution failed").slice(0, 2000);
        results.push({ status: "failed", error: message });
        break;
      }
    }

    const reviewRequired = await supabaseAdmin
      .from("secretary_jobs")
      .select("id", { count: "exact", head: true })
      .eq("status", "REVIEW_REQUIRED");

    return Response.json(
      {
        success: true,
        contract: "AVANTIQO_SECRETARY_AUTONOMOUS_JOB_WORKER_V1",
        processed: results.length,
        review_required: reviewRequired.count || 0,
        results,
        external_authority_used: false,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return Response.json(
      { success: false, error: String(error?.message || error || "Secretary job processor failed") },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
