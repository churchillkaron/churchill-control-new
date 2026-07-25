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

  return value.startsWith("sha256=")
    ? value.slice("sha256=".length)
    : value;
}

function verifySignature(rawBody, suppliedSignature) {
  const secret = process.env.CREATIVE_PROVIDER_CALLBACK_SECRET;
  if (!secret) {
    throw new Error("CREATIVE_PROVIDER_CALLBACK_SECRET_REQUIRED");
  }

  if (!suppliedSignature) return false;

  const expected = crypto
    .createHmac("sha256", secret)
    .update(rawBody)
    .digest("hex");

  const supplied = Buffer.from(suppliedSignature, "utf8");
  const calculated = Buffer.from(expected, "utf8");

  return supplied.length === calculated.length &&
    crypto.timingSafeEqual(supplied, calculated);
}

export async function POST(request) {
  try {
    const rawBody = await request.text();
    const signature = signatureValue(request);

    if (!verifySignature(rawBody, signature)) {
      return NextResponse.json(
        { success: false, error: "Invalid callback signature" },
        { status: 401 },
      );
    }

    const body = JSON.parse(rawBody || "{}");
    const taskId = body.task_id || body.taskId;

    if (!taskId) {
      return NextResponse.json(
        { success: false, error: "task_id required" },
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

    const callbackProvider = body.provider || body.provider_id || null;
    if (
      callbackProvider &&
      task.provider_id &&
      callbackProvider !== task.provider_id
    ) {
      return NextResponse.json(
        { success: false, error: "Provider does not match production task" },
        { status: 409 },
      );
    }

    const callbackJobId =
      body.provider_job_id ||
      body.job_id ||
      body.jobId ||
      body.id ||
      null;
    const taskJobId = task.output?.provider_job_id || null;

    if (callbackJobId && taskJobId && callbackJobId !== taskJobId) {
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
      task: result,
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 },
    );
  }
}
