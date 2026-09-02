export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";

import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

function clean(value) {
  return String(value ?? "").trim();
}

function normalized(value) {
  return clean(value).toLowerCase().replace(/[\s-]+/g, "_");
}

async function safe(source, task, fallback = []) {
  try {
    return { source, status: "connected", data: await task(), error: null };
  } catch (error) {
    console.error("CREATIVE_COMMAND_CENTER_SOURCE_FAILED", { source, error });
    return { source, status: "error", data: fallback, error: error?.message || "Source unavailable" };
  }
}

export async function GET(request) {
  try {
    const url = new URL(request.url);
    const organizationId = clean(
      url.searchParams.get("organizationId") || url.searchParams.get("organization_id"),
    );

    const access = await requireOrganizationAccess({ organizationId, request });
    if (!access.success) {
      return NextResponse.json(
        { success: false, error: access.error },
        { status: access.status || 403 },
      );
    }

    const orgId = access.organizationId;
    const [missionsSource, projectsSource, tasksSource, assetsSource, publishSource, publicationsSource, outcomesSource] = await Promise.all([
      safe("creative_missions", async () => {
        const { data, error } = await supabaseAdmin
          .from("creative_missions")
          .select("id,title,objective,status,approval_state,started_at,completed_at,created_at,updated_at")
          .eq("organization_id", orgId)
          .order("updated_at", { ascending: false })
          .limit(250);
        if (error) throw error;
        return data || [];
      }),
      safe("creative_projects", async () => {
        const { data, error } = await supabaseAdmin
          .from("creative_projects")
          .select("id,creative_mission_id,name,description,status,archived,production_type,objective,updated_at,created_at")
          .eq("organization_id", orgId)
          .order("updated_at", { ascending: false })
          .limit(500);
        if (error) throw error;
        return data || [];
      }),
      safe("creative_production_tasks", async () => {
        const { data, error } = await supabaseAdmin
          .from("creative_production_tasks")
          .select("id,creative_project_id,type,status,title,description,priority,error,updated_at,created_at")
          .eq("organization_id", orgId)
          .order("updated_at", { ascending: false })
          .limit(1000);
        if (error) throw error;
        return data || [];
      }),
      safe("creative_assets", async () => {
        const { data, error } = await supabaseAdmin
          .from("creative_assets")
          .select("id,creative_mission_id,creative_project_id,asset_type,name,title,status,approval_state,file_url,image_url,updated_at,created_at")
          .eq("organization_id", orgId)
          .order("updated_at", { ascending: false })
          .limit(750);
        if (error) throw error;
        return data || [];
      }),
      safe("creative_publish_jobs", async () => {
        const { data, error } = await supabaseAdmin
          .from("creative_publish_jobs")
          .select("id,creative_mission_id,creative_project_id,asset_id,channel,destination,status,scheduled_at,completed_at,failed_at,error_message,updated_at,created_at")
          .eq("organization_id", orgId)
          .order("updated_at", { ascending: false })
          .limit(500);
        if (error) throw error;
        return data || [];
      }),
      safe("creative_publications", async () => {
        const { data, error } = await supabaseAdmin
          .from("creative_publications")
          .select("id,campaign_id,asset_id,channel,status,published_at,updated_at,created_at")
          .eq("organization_id", orgId)
          .order("updated_at", { ascending: false })
          .limit(500);
        if (error) throw error;
        return data || [];
      }),
      safe("creative_outcome_observations", async () => {
        const { data, error } = await supabaseAdmin
          .from("creative_outcome_observations")
          .select("id,creative_mission_id,creative_project_id,campaign_id,channel,evidence_tier,observed_at,created_at")
          .eq("organization_id", orgId)
          .order("observed_at", { ascending: false })
          .limit(500);
        if (error) throw error;
        return data || [];
      }),
    ]);

    const missions = missionsSource.data || [];
    const projects = projectsSource.data || [];
    const tasks = tasksSource.data || [];
    const assets = assetsSource.data || [];
    const publishJobs = publishSource.data || [];
    const publications = publicationsSource.data || [];
    const outcomes = outcomesSource.data || [];

    const activeMissions = missions.filter((row) => ["active", "draft", "paused"].includes(normalized(row.status)));
    const activeProjects = projects.filter((row) => !row.archived && !["archived", "completed", "cancelled"].includes(normalized(row.status)));
    const failedTasks = tasks.filter((row) => normalized(row.status) === "failed");
    const waitingTasks = tasks.filter((row) => ["waiting", "ready", "queued", "running"].includes(normalized(row.status)));
    const approvalAssets = assets.filter((row) => ["pending", "review", "in_review", "pending_approval"].includes(normalized(row.approval_state)));
    const approvedAssets = assets.filter((row) => normalized(row.approval_state) === "approved");
    const openPublishJobs = publishJobs.filter((row) => !["completed", "published", "cancelled"].includes(normalized(row.status)));
    const failedPublishJobs = publishJobs.filter((row) => normalized(row.status) === "failed" || Boolean(row.error_message));
    const observedProjectIds = new Set(outcomes.map((row) => row.creative_project_id).filter(Boolean));
    const publishedAssetIds = new Set(publications.map((row) => row.asset_id).filter(Boolean));
    const approvedNotPublished = approvedAssets.filter((row) => !publishedAssetIds.has(row.id));
    const completedProjectsWithoutOutcome = projects.filter((row) =>
      ["completed", "published", "delivered"].includes(normalized(row.status)) && !observedProjectIds.has(row.id),
    );

    const queue = [];
    failedTasks.slice(0, 8).forEach((row) => queue.push({
      id: `task:${row.id}`,
      priority: "attention",
      kind: "production",
      title: row.title || "Production task failed",
      detail: clean(row.error) || row.description || "Production needs repair or retry.",
      status: "Failed",
      href: `/creative/studio/production/${row.creative_project_id || ""}`,
    }));
    approvalAssets.slice(0, 8).forEach((row) => queue.push({
      id: `approval:${row.id}`,
      priority: "review",
      kind: "approval",
      title: row.title || row.name || "Asset ready for review",
      detail: row.asset_type ? `${row.asset_type} · review before release` : "Review before release",
      status: "Review",
      href: `/creative/studio/assets/${row.creative_project_id || row.creative_mission_id || ""}`,
    }));
    failedPublishJobs.slice(0, 6).forEach((row) => queue.push({
      id: `publish:${row.id}`,
      priority: "attention",
      kind: "publishing",
      title: `Publishing failed${row.channel ? ` · ${row.channel}` : ""}`,
      detail: row.error_message || row.destination || "Publishing requires attention.",
      status: "Retry",
      href: `/creative/studio/publishing/${row.creative_project_id || row.creative_mission_id || ""}`,
    }));
    approvedNotPublished.slice(0, 6).forEach((row) => queue.push({
      id: `release:${row.id}`,
      priority: "review",
      kind: "release",
      title: row.title || row.name || "Approved creative asset",
      detail: "Approved but no publication record exists yet.",
      status: "Ready to publish",
      href: `/creative/studio/publishing/${row.creative_project_id || row.creative_mission_id || ""}`,
    }));
    completedProjectsWithoutOutcome.slice(0, 6).forEach((row) => queue.push({
      id: `outcome:${row.id}`,
      priority: "review",
      kind: "measurement",
      title: row.name || "Finished creative project",
      detail: "Finished work has no measured outcome evidence yet.",
      status: "Measure results",
      href: "/creative/marketing",
    }));

    return NextResponse.json({
      success: true,
      metrics: {
        active_missions: activeMissions.length,
        active_projects: activeProjects.length,
        production_failed: failedTasks.length,
        production_in_flight: waitingTasks.length,
        review_required: approvalAssets.length,
        approved_not_published: approvedNotPublished.length,
        publish_open: openPublishJobs.length,
        publish_failed: failedPublishJobs.length,
        publications: publications.length,
        outcomes: outcomes.length,
      },
      queue: queue.slice(0, 24),
      recent_projects: activeProjects.slice(0, 10),
      sources: Object.fromEntries(
        [missionsSource, projectsSource, tasksSource, assetsSource, publishSource, publicationsSource, outcomesSource]
          .map((entry) => [entry.source, { status: entry.status, error: entry.error }]),
      ),
      generated_at: new Date().toISOString(),
    });
  } catch (error) {
    console.error("CREATIVE_COMMAND_CENTER_FAILED", error);
    return NextResponse.json(
      { success: false, error: error?.message || "Unable to load Creative command center" },
      { status: 500 },
    );
  }
}
