export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

function text(value) {
  return String(value ?? "").trim();
}

function ageSeconds(value) {
  const time = new Date(value || 0).getTime();
  return Number.isFinite(time) ? Math.max(0, Math.round((Date.now() - time) / 1000)) : null;
}

export async function GET(request) {
  try {
    const url = new URL(request.url);
    const organizationId = text(url.searchParams.get("organizationId") || url.searchParams.get("organization_id"));
    const access = await requireOrganizationAccess({ organizationId, request });
    if (!access.success) {
      return NextResponse.json({ success: false, error: access.error }, { status: access.status || 403 });
    }

    const [nodesResult, jobsResult] = await Promise.all([
      supabaseAdmin.from("avantiqo_local_compute_nodes")
        .select("id,display_name,enabled,capabilities,last_seen_at,metadata,created_at,updated_at")
        .order("created_at", { ascending: true }),
      supabaseAdmin.from("avantiqo_local_compute_jobs")
        .select("id,capability,lane,workload,model,status,priority,node_id,attempts,max_attempts,metrics,error_code,created_at,started_at,completed_at,updated_at")
        .eq("organization_id", access.organizationId)
        .order("created_at", { ascending: false })
        .limit(100),
    ]);
    if (nodesResult.error) throw nodesResult.error;
    if (jobsResult.error) throw jobsResult.error;

    const nodes = (nodesResult.data || []).map((node) => {
      const heartbeatAge = ageSeconds(node.last_seen_at);
      return {
        ...node,
        heartbeat_age_seconds: heartbeatAge,
        online: node.enabled === true && heartbeatAge !== null && heartbeatAge <= 90,
      };
    });
    const jobs = jobsResult.data || [];
    const queueDepth = jobs.filter((job) => ["QUEUED", "RUNNING"].includes(job.status)).length;
    const completed = jobs.filter((job) => job.status === "COMPLETED");
    const failed = jobs.filter((job) => job.status === "FAILED");
    const latencyRows = completed.map((job) => Number(job.metrics?.elapsed_ms || 0)).filter((value) => value > 0);
    const averageLatencyMs = latencyRows.length
      ? Math.round(latencyRows.reduce((sum, value) => sum + value, 0) / latencyRows.length)
      : null;

    return NextResponse.json({
      success: true,
      generated_at: new Date().toISOString(),
      organization_id: access.organizationId,
      routing: {
        normal_intelligence: "LOCAL_FIRST",
        deep_intelligence: "MODAL",
        heavy_generation: "MODAL",
        local_transport: "SUPABASE_PULL_QUEUE_V1",
      },
      metrics: {
        nodes_total: nodes.length,
        nodes_online: nodes.filter((node) => node.online).length,
        queue_depth: queueDepth,
        completed_jobs: completed.length,
        failed_jobs: failed.length,
        average_latency_ms: averageLatencyMs,
      },
      nodes,
      jobs,
    });
  } catch (error) {
    console.error("ADMINISTRATION_COMPUTE_STATUS_FAILED", error);
    return NextResponse.json({ success: false, error: error?.message || "Compute status unavailable" }, { status: 500 });
  }
}
