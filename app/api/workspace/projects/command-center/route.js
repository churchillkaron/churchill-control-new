export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";

import { resolveBusinessContext } from "@/lib/business-context/resolveBusinessContext";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

const TERMINAL = new Set([
  "cancelled",
  "closed",
  "complete",
  "completed",
  "done",
  "finished",
]);

const ACTIVE = new Set([
  "active",
  "approved",
  "execution",
  "in_progress",
  "open",
  "started",
]);

function clean(value) {
  return String(value ?? "").trim();
}

function normalized(value) {
  return clean(value).toLowerCase().replace(/[\s-]+/g, "_");
}

function titleCase(value) {
  return clean(value)
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function dateOnly(value) {
  return value ? String(value).slice(0, 10) : null;
}

function dayDifference(left, right) {
  if (!left || !right) return null;
  const leftDate = new Date(`${left}T00:00:00.000Z`);
  const rightDate = new Date(`${right}T00:00:00.000Z`);
  if (Number.isNaN(leftDate.getTime()) || Number.isNaN(rightDate.getTime())) return null;
  return Math.round((leftDate.getTime() - rightDate.getTime()) / 86400000);
}

function isTerminal(value) {
  return TERMINAL.has(normalized(value));
}

function isActive(row) {
  const status = normalized(row?.status);
  if (TERMINAL.has(status)) return false;
  if (!status) return true;
  return ACTIVE.has(status) || !TERMINAL.has(status);
}

function projectHref(id = null) {
  return id ? `/projects?projectId=${encodeURIComponent(id)}` : "/projects";
}

async function safe(source, task, fallback) {
  try {
    return { source, status: "connected", data: await task(), error: null };
  } catch (error) {
    console.error("PROJECTS_COMMAND_CENTER_SOURCE_FAILED", { source, error });
    return {
      source,
      status: "error",
      data: fallback,
      error: error?.message || "Source unavailable",
    };
  }
}

export async function GET(request) {
  try {
    const url = new URL(request.url);
    const organizationId = clean(
      url.searchParams.get("organizationId") ||
        url.searchParams.get("organization_id"),
    );
    const entityId = clean(
      url.searchParams.get("entityId") || url.searchParams.get("entity_id"),
    );
    const periodId = clean(
      url.searchParams.get("periodId") || url.searchParams.get("period_id"),
    );

    const access = await requireOrganizationAccess({ organizationId, request });
    if (!access.success) {
      return NextResponse.json(
        { success: false, error: access.error },
        { status: access.status || 403 },
      );
    }

    const context = await resolveBusinessContext({
      organizationId: access.organizationId,
      entityId: entityId || null,
      periodId: periodId || null,
      request,
      access,
    });

    if (!context.success) {
      return NextResponse.json(
        { success: false, error: context.error },
        { status: context.status || 400 },
      );
    }

    const resolvedEntityId = context.entityId || null;
    const today = new Date().toISOString().slice(0, 10);

    const projectsSource = await safe("projects", async () => {
      let query = supabaseAdmin
        .from("projects")
        .select("id,organization_id,entity_id,code,name,description,status,start_date,end_date,created_at,updated_at")
        .eq("organization_id", context.organizationId);

      if (resolvedEntityId) {
        query = query.or(`entity_id.eq.${resolvedEntityId},entity_id.is.null`);
      }

      const { data, error } = await query
        .order("updated_at", { ascending: false })
        .limit(5000);
      if (error) throw error;
      return data || [];
    }, []);

    const projects = projectsSource.data || [];
    const activeProjects = projects.filter(isActive);
    const overdue = activeProjects.filter((project) => {
      const end = dateOnly(project.end_date);
      return Boolean(end && end < today);
    });
    const due30 = activeProjects.filter((project) => {
      const days = dayDifference(dateOnly(project.end_date), today);
      return days !== null && days >= 0 && days <= 30;
    });
    const future = activeProjects.filter((project) => {
      const start = dateOnly(project.start_date);
      return Boolean(start && start > today);
    });
    const missingDates = activeProjects.filter(
      (project) => !project.start_date || !project.end_date,
    );
    const missingEntity = activeProjects.filter((project) => !project.entity_id);
    const completed = projects.filter((project) => isTerminal(project.status));

    const queue = [];

    overdue
      .sort((left, right) => String(left.end_date).localeCompare(String(right.end_date)))
      .slice(0, 8)
      .forEach((project) => {
        queue.push({
          id: `overdue:${project.id}`,
          kind: "schedule",
          priority: "attention",
          title: project.name || project.code || "Project",
          detail: `Planned finish ${project.end_date} · ${Math.abs(dayDifference(project.end_date, today) || 0)} day(s) overdue`,
          status: project.status || "Open",
          href: projectHref(project.id),
        });
      });

    due30.slice(0, 6).forEach((project) => {
      queue.push({
        id: `due:${project.id}`,
        kind: "deadline",
        priority: "review",
        title: project.name || project.code || "Project",
        detail: `Planned finish ${project.end_date} · ${dayDifference(project.end_date, today)} day(s) remaining`,
        status: project.status || "Open",
        href: projectHref(project.id),
      });
    });

    missingDates.slice(0, 5).forEach((project) => {
      queue.push({
        id: `dates:${project.id}`,
        kind: "planning",
        priority: "review",
        title: project.name || project.code || "Project",
        detail: "Project schedule dates are incomplete",
        status: "Planning required",
        href: projectHref(project.id),
      });
    });

    missingEntity.slice(0, 5).forEach((project) => {
      queue.push({
        id: `entity:${project.id}`,
        kind: "governance",
        priority: "review",
        title: project.name || project.code || "Project",
        detail: "Project is not assigned to a legal entity",
        status: "Scope required",
        href: projectHref(project.id),
      });
    });

    return NextResponse.json({
      success: true,
      ready: true,
      context: {
        organization_id: context.organizationId,
        entity_id: resolvedEntityId,
        period_id: context.periodId || null,
        currency: context.currency || null,
        business_date: today,
      },
      metrics: {
        portfolio: {
          total: projects.length,
          active: activeProjects.length,
          completed: completed.length,
          source_status: projectsSource.status,
        },
        schedule: {
          overdue: overdue.length,
          due_30_days: due30.length,
          future: future.length,
          missing_dates: missingDates.length,
          source_status: projectsSource.status,
        },
        governance: {
          missing_entity: missingEntity.length,
          source_status: projectsSource.status,
        },
      },
      portfolio: activeProjects
        .map((project) => {
          const endDate = dateOnly(project.end_date);
          const daysToEnd = dayDifference(endDate, today);
          const health = !endDate
            ? "planning"
            : daysToEnd < 0
              ? "off_track"
              : daysToEnd <= 30
                ? "watch"
                : "on_track";
          return {
            ...project,
            days_to_end: daysToEnd,
            health,
          };
        })
        .sort((left, right) => {
          const rank = { off_track: 0, planning: 1, watch: 2, on_track: 3 };
          return (rank[left.health] ?? 9) - (rank[right.health] ?? 9);
        })
        .slice(0, 20),
      queue: queue.slice(0, 18),
      capability_depth: {
        portfolio_projects: true,
        milestones: false,
        work_breakdown: false,
        dependencies: false,
        project_risks: false,
        resource_capacity: false,
        project_financials: false,
        note: "These controls are not represented by first-class canonical project records yet and are intentionally not fabricated in this read model.",
      },
      sources: {
        projects: {
          status: projectsSource.status,
          error: projectsSource.error,
        },
      },
      generated_at: new Date().toISOString(),
    });
  } catch (error) {
    console.error("PROJECTS_COMMAND_CENTER_FAILED", error);
    return NextResponse.json(
      {
        success: false,
        error: error?.message || "Unable to load Projects command center",
      },
      { status: 500 },
    );
  }
}
