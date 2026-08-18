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
  CreativeVideoGenerationDispatchRuntime,
} from "@/lib/creative/video/runtime/CreativeVideoGenerationDispatchRuntime";

function text(value) {
  return String(value ?? "").trim();
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

    const access = await requireOrganizationAccess({
      organizationId,
      organization_id: organizationId,
      request,
      requiredAnyPermission: [
        "creative.execute",
        "creative.production.run",
        "creative.*",
      ],
    });
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
      return NextResponse.json(
        { error: "Production task not found" },
        { status: 404 },
      );
    }

    const result = await CreativeVideoGenerationDispatchRuntime.dispatch({
      task_id: taskId,
      preflight_sha256: preflightSha256,
      actor: {
        user_id: access.userId,
        staff_account_id: access.access.staffAccountId,
        email: access.userEmail,
      },
    });

    return NextResponse.json({
      success: true,
      generation_started: true,
      publication_authorized: false,
      task: result.task,
      preflight_sha256: result.preflight?.preflight_sha256 || preflightSha256,
      dispatch_contract: result.contract,
    });
  } catch (error) {
    console.error("creative video generation dispatch POST", error);
    const message = error?.message || "Failed to start video generation";
    const status = [
      "APPROVAL_REQUIRED",
      "NOT_AUTHORIZED",
      "ALREADY_CONSUMED",
      "MISMATCH",
      "DRIFT",
      "STALE",
      "ALREADY_CLAIMED",
      "STATUS_INVALID",
      "BOUNDARY_INVALID",
    ].some((marker) => message.includes(marker))
      ? 409
      : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
