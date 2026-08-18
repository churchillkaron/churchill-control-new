export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";

import {
  requireOrganizationAccess,
} from "@/lib/platform/security/requireOrganizationAccess";
import {
  ProductionTaskRuntime,
} from "@/lib/operations/tasks/runtime/ProductionTaskRuntime";
import {
  CreativeVideoGenerationApprovalRuntime,
} from "@/lib/creative/video/runtime/CreativeVideoGenerationApprovalRuntime";

function text(value) {
  return String(value ?? "").trim();
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function publicInspection(inspection = {}) {
  const task = object(inspection.task);
  const preflight = object(inspection.preflight);
  return {
    task: {
      id: task.id || null,
      title: task.title || task.description || "Video generation",
      status: task.status || null,
      creative_project_id: task.creative_project_id || null,
      production_graph_id: task.production_graph_id || null,
    },
    preflight,
    approved: inspection.approved === true,
    can_approve: inspection.can_approve === true,
    stale_authorization: inspection.stale_authorization === true,
    blocking_reasons: Array.isArray(inspection.blocking_reasons)
      ? inspection.blocking_reasons
      : [],
    dossier: inspection.dossier
      ? {
          id: inspection.dossier.id,
          status: inspection.dossier.status,
          passed: inspection.dossier.metadata?.passed === true,
        }
      : null,
    dossier_approved: Boolean(inspection.dossier_approval),
    approval_record_id: inspection.approval_record?.id || null,
  };
}

async function accessFor(request, organizationId) {
  return requireOrganizationAccess({
    organizationId,
    organization_id: organizationId,
    request,
    requiredAnyPermission: [
      "creative.execute",
      "creative.production.run",
      "creative.*",
    ],
  });
}

async function inspectTask({ organizationId, taskId }) {
  const task = await ProductionTaskRuntime.get(taskId);
  if (!task || text(task.organization_id) !== organizationId) {
    return null;
  }
  return CreativeVideoGenerationApprovalRuntime.inspect({ task_id: taskId });
}

export async function GET(request) {
  try {
    const url = new URL(request.url);
    const organizationId = text(url.searchParams.get("organization_id"));
    const projectId = text(url.searchParams.get("creative_project_id"));
    const taskId = text(url.searchParams.get("task_id"));

    if (!organizationId || (!taskId && !projectId)) {
      return NextResponse.json(
        { error: "organization_id and task_id or creative_project_id required" },
        { status: 400 },
      );
    }

    const access = await accessFor(request, organizationId);
    if (!access.success) {
      return NextResponse.json(access, { status: access.status });
    }

    if (taskId) {
      const inspection = await inspectTask({ organizationId, taskId });
      if (!inspection) {
        return NextResponse.json({ error: "Production task not found" }, { status: 404 });
      }
      return NextResponse.json({
        success: true,
        inspection: publicInspection(inspection),
      });
    }

    const tasks = await ProductionTaskRuntime.list({
      organization_id: organizationId,
      creative_project_id: projectId,
    });
    const inspections = [];
    for (const task of tasks) {
      try {
        const inspection = await CreativeVideoGenerationApprovalRuntime.inspect({
          task_id: task.id,
        });
        inspections.push(publicInspection(inspection));
      } catch {
        // A task that cannot satisfy the configured video preflight is not a video approval candidate.
      }
    }

    return NextResponse.json({
      success: true,
      inspections,
    });
  } catch (error) {
    console.error("creative video generation approval GET", error);
    return NextResponse.json(
      { error: error?.message || "Failed to inspect video generation approval" },
      { status: 500 },
    );
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    const organizationId = text(body.organization_id);
    const taskId = text(body.task_id);
    const preflightSha256 = text(body.preflight_sha256);

    if (!organizationId || !taskId || !preflightSha256) {
      return NextResponse.json(
        { error: "organization_id, task_id and preflight_sha256 required" },
        { status: 400 },
      );
    }

    const access = await accessFor(request, organizationId);
    if (!access.success) {
      return NextResponse.json(access, { status: access.status });
    }
    if (!access.access?.staffAccountId) {
      return NextResponse.json(
        { error: "Authenticated staff account required" },
        { status: 403 },
      );
    }

    const task = await ProductionTaskRuntime.get(taskId);
    if (!task || text(task.organization_id) !== organizationId) {
      return NextResponse.json({ error: "Production task not found" }, { status: 404 });
    }

    const result = await CreativeVideoGenerationApprovalRuntime.approve({
      task_id: taskId,
      preflight_sha256: preflightSha256,
      notes: text(body.notes),
      approver: {
        user_id: access.userId,
        staff_account_id: access.access.staffAccountId,
        email: access.userEmail,
      },
    });

    return NextResponse.json({
      success: true,
      approved: true,
      publication_authorized: false,
      reused: result.reused === true,
      task_id: result.task?.id || taskId,
      approval_record_id: result.approval_record?.id || null,
      authorization: result.authorization,
      preflight: result.preflight,
    });
  } catch (error) {
    console.error("creative video generation approval POST", error);
    const message = error?.message || "Failed to approve video generation";
    const status = message.includes("STALE") ||
      message.includes("BLOCKED") ||
      message.includes("MISMATCH")
      ? 409
      : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
