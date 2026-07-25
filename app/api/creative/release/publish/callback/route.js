export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import crypto from "node:crypto";
import { NextResponse } from "next/server";

import {
  CreativePublishReconciliationRuntime,
} from "@/lib/creative/release/runtime/CreativePublishReconciliationRuntime";
import * as AssetGraphRepository
from "@/lib/creative/assets/graph/repositories/CreativeAssetGraphRepository";
import {
  CREATIVE_ASSET_NODE_TYPES,
} from "@/lib/creative/assets/graph/documents/CreativeAssetNode";

const MAX_CLOCK_SKEW_SECONDS = 300;

function signatureValue(request) {
  const value =
    request.headers.get("x-avantiqo-signature") ||
    request.headers.get("x-provider-signature") ||
    "";
  return value.startsWith("sha256=") ? value.slice(7) : value;
}

function timestampValue(request) {
  return String(
    request.headers.get("x-avantiqo-timestamp") ||
    request.headers.get("x-provider-timestamp") ||
    "",
  ).trim();
}

function verifySignature(rawBody, timestamp, suppliedSignature) {
  const secret = process.env.CREATIVE_PUBLISH_CALLBACK_SECRET;
  if (!secret) throw new Error("CREATIVE_PUBLISH_CALLBACK_SECRET_REQUIRED");
  if (!timestamp || !suppliedSignature) return false;

  const timestampNumber = Number(timestamp);
  if (!Number.isFinite(timestampNumber)) return false;
  const timestampMs = timestampNumber > 10_000_000_000
    ? timestampNumber
    : timestampNumber * 1000;
  if (Math.abs(Date.now() - timestampMs) > MAX_CLOCK_SKEW_SECONDS * 1000) {
    return false;
  }

  const expected = crypto
    .createHmac("sha256", secret)
    .update(`${timestamp}.${rawBody}`)
    .digest("hex");
  const supplied = Buffer.from(suppliedSignature, "utf8");
  const calculated = Buffer.from(expected, "utf8");
  return supplied.length === calculated.length &&
    crypto.timingSafeEqual(supplied, calculated);
}

function safeExecution(execution) {
  return {
    id: execution?.id || null,
    organization_id: execution?.organization_id || null,
    creative_project_id: execution?.creative_project_id || null,
    status: execution?.status || null,
    execution_status: execution?.metadata?.execution_status || null,
    provider_id: execution?.metadata?.provider_id || null,
    provider_job_id: execution?.metadata?.provider_job_id || null,
    external_publication_id:
      execution?.metadata?.external_publication_id || null,
    external_publication_url:
      execution?.metadata?.external_publication_url || null,
    settlement: execution?.metadata?.settlement || null,
    error: execution?.metadata?.error || null,
  };
}

export async function POST(request) {
  try {
    const rawBody = await request.text();
    const timestamp = timestampValue(request);
    if (!verifySignature(rawBody, timestamp, signatureValue(request))) {
      return NextResponse.json(
        { success: false, error: "Invalid or expired callback signature" },
        { status: 401 },
      );
    }

    const body = JSON.parse(rawBody || "{}");
    const organizationId = body.organization_id || body.organizationId;
    const executionId =
      body.publish_execution_asset_node_id ||
      body.publishExecutionAssetNodeId ||
      body.execution_id ||
      body.executionId;
    const provider = String(body.provider || body.provider_id || "")
      .trim()
      .toLowerCase();
    const providerJobId = String(
      body.provider_job_id || body.job_id || body.jobId || "",
    ).trim();

    if (!organizationId || !executionId || !provider || !providerJobId) {
      return NextResponse.json(
        {
          success: false,
          error:
            "organization_id, publish_execution_asset_node_id, provider and provider_job_id required",
        },
        { status: 400 },
      );
    }

    const execution = await AssetGraphRepository.getById(executionId);
    if (
      !execution ||
      execution.organization_id !== organizationId ||
      execution.type !== CREATIVE_ASSET_NODE_TYPES.PUBLISH_EXECUTION
    ) {
      return NextResponse.json(
        { success: false, error: "Publish execution not found" },
        { status: 404 },
      );
    }
    if (
      String(execution.metadata?.provider_id || "").trim().toLowerCase() !==
      provider
    ) {
      return NextResponse.json(
        { success: false, error: "Provider does not match publish execution" },
        { status: 409 },
      );
    }
    if (
      String(execution.metadata?.provider_job_id || "").trim() !==
      providerJobId
    ) {
      return NextResponse.json(
        {
          success: false,
          error: "Provider job does not match publish execution",
        },
        { status: 409 },
      );
    }

    const result = await CreativePublishReconciliationRuntime.complete({
      organization_id: organizationId,
      execution_id: execution.id,
      payload: body,
    });

    return NextResponse.json({
      success: true,
      execution: safeExecution(result),
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 },
    );
  }
}
