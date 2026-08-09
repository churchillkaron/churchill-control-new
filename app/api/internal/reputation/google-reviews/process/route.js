export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { syncGoogleReviews } from "@/lib/commercial/reputation/ReputationAutomationRuntime";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

function authorized(request) {
  const secret = String(process.env.CRON_SECRET || "").trim();
  if (!secret) return false;
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

export async function GET(request) {
  if (!authorized(request)) {
    return Response.json(
      { success: false, error: "Unauthorized" },
      { status: 401 }
    );
  }

  try {
    const { data: policies, error: policyError } = await supabaseAdmin
      .from("reputation_review_policies")
      .select("organization_id")
      .eq("enabled", true);
    if (policyError) throw policyError;

    const organizationIds = [
      ...new Set((policies || []).map((policy) => policy.organization_id)),
    ];
    if (!organizationIds.length) {
      return Response.json({ success: true, organizations: [] });
    }

    const { data: connections, error: connectionError } = await supabaseAdmin
      .from("organization_channel_connections")
      .select("organization_id")
      .eq("provider", "google")
      .eq("status", "ACTIVE")
      .in("organization_id", organizationIds);
    if (connectionError) throw connectionError;

    const connectedIds = [
      ...new Set((connections || []).map((item) => item.organization_id)),
    ];
    const results = [];

    for (const organizationId of connectedIds) {
      try {
        const result = await syncGoogleReviews({ organizationId });
        results.push({ organizationId, success: true, ...result });
      } catch (error) {
        results.push({
          organizationId,
          success: false,
          error: error?.message || "Google review processing failed",
        });
      }
    }

    const failed = results.filter((result) => !result.success).length;
    return Response.json(
      { success: failed === 0, failed, organizations: results },
      { status: failed ? 207 : 200 }
    );
  } catch (error) {
    return Response.json(
      {
        success: false,
        error: error?.message || "Google review processing failed",
      },
      { status: 500 }
    );
  }
}
