export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import crypto from "node:crypto";
import { NextResponse } from "next/server";

import {
  CreativeProviderCompletionRuntime,
} from "@/lib/creative/providers/runtime/CreativeProviderCompletionRuntime";
import {
  ProductionTaskRuntime,
} from "@/lib/operations/tasks/runtime/ProductionTaskRuntime";

function signatureValue(request) {
  const value =
    request.headers.get("x-avantiqo-signature") ||
    request.headers.get("x-provider-signature") ||
    "";
  return value.startsWith("sha256=") ? value.slice("sha256=".length) : value;
}

function verifySignature(rawBody, suppliedSignature) {
  const secret = process.env.CREATIVE_PROVIDER_CALLBACK_SECRET;
  if (!secret) throw new Error("CREATIVE_PROVIDER_CALLBACK_SECRET_REQUIRED");
  if (!suppliedSignature) return false;

  const expected = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
  const supplied = Buffer.from(suppliedSignature, "utf8");
  const calculated = Buffer.from(expected, "utf8");
  return supplied.length === calculated.length &&
    crypto.timingSafeEqual(supplied, calculated);
}

function safeTask(task) {
  return {
    id: task?.id || null,
    organization_id: task?.organization_id || null,
    creative_project_id: task?.creative_project_id || null,
    status: task?.status || null,
    provider_id: task?.provider_id || null,
    provider_job_id: task?.output?.provider_job_id || null,
    asset_node_id: task?.output?.asset_node_id || null,
    storage_path: task?.output?.storage_path || task?.output?.output?.storage_path || null,
    settlement: task?.output?.settlement || null,
    error: task?.error || null,
  };
}

export async function POST(request) {
  try {
    const rawBody = await request.text();
    if (!verifySignature(rawBody, signatureValue(request))) {
      return NextResponse.json(
        { success: false, error: "Invalid callback signature" },
        { status: 401 },
      );
    }

    const body = JSON.parse(rawBody || "{}");
    const taskId = body.task_id || body.taskId;
    const organizationId = body.organization_id || body.organizationId;
    const callbackProvider = String(body.provider || body.provider_id || "").trim().toLowerCase();
    const callbackJobId = String(
      body.provider_job_id || body.job_id || body.jobId || "",
    ).trim();

    if (!taskId || !organizationId || !callbackProvider || !callbackJobId) {
      return NextResponse.json(
        {
          success: false,
          error: "task_id, organization_id, provider and provider_job_id required",
        },
        { status: 400 },
      );
    }

    const task = await ProductionTaskRuntime.get(taskId);
    if (!task) {
      return NextResponse.json(
        { success: false, error: "Production task not found" },
        { status: 404 },
      );
    }

    if (task.organization_id !== organizationId) {
      return NextResponse.json(
        { success: false, error: "Organization does not match production task" },
        { status: 409 },
      );
    }

    if (String(task.provider_id || "").trim().toLowerCase() !== callbackProvider) {
      return NextResponse.json(
        { success: false, error: "Provider does not match production task" },
        { status: 409 },
      );
    }

    if (String(task.output?.provider_job_id || "").trim() !== callbackJobId) {
      return NextResponse.json(
        { success: false, error: "Provider job does not match production task" },
        { status: 409 },
      );
    }

    const result = await CreativeProviderCompletionRuntime.complete({
      task_id: task.id,
      payload: body,
    });

    return NextResponse.json({
      success: true,
      task: safeTask(result),
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 },
    );
  }
}
