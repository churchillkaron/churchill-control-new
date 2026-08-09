export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import crypto from "node:crypto";
import { NextResponse } from "next/server";

import "@/lib/creative/quality/runtime/CreativeGeneratedMediaRecoveryBootstrap";

import {
  ProductionTaskRuntime,
} from "@/lib/operations/tasks/runtime/ProductionTaskRuntime";
import {
  getServiceSupabase,
} from "@/lib/shared/supabase/service";

const ORGANIZATION_ID = "33336a72-acb5-474e-856b-8be0269360e2";
const CREATIVE_PROJECT_ID = "0230a08a-6b47-46e1-9f51-7956d70d304b";
const REVIEW_TASK_ID = "4ea86c40-6f7c-4b90-9bb9-5e7f5c6a323f";
const SOURCE_TASK_ID = "85241ba5-675f-4c25-86d2-3b28114fc74e";
const SOURCE_ASSET_NODE_ID = "ade8687c-a2cc-440e-923d-d21eeb3de188";
const REVIEW_CONTRACT = "GENERATED_MEDIA_PERCEPTUAL_REVIEW_V1";
const EXECUTION_CONTRACT =
  "GEMINI_OMNI_5S_PERCEPTUAL_REVIEW_ONE_TIME_EXECUTION_V1";
const REVIEW_SERVICE = "ai.image.analyze";
const REVIEW_PROVIDER = "openai";
const MAXIMUM_CUSTOMER_PRICE_THB = 0.4368;

const supabaseAdmin = getServiceSupabase();

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function text(value) {
  return String(value ?? "").trim();
}

function number(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function json(payload, status = 200) {
  return NextResponse.json(payload, {
    status,
    headers: {
      "Cache-Control": "no-store, max-age=0",
      Pragma: "no-cache",
    },
  });
}

function tokenDigest(value) {
  return crypto.createHash("sha256").update(String(value || "")).digest();
}

function safeTokenMatch(provided, expectedHex) {
  const expected = text(expectedHex);
  if (!provided || !/^[a-f0-9]{64}$/i.test(expected)) return false;
  const left = tokenDigest(provided);
  const right = Buffer.from(expected, "hex");
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

function taskService(task = {}) {
  return text(task.capability || task.service_code || task.service_id).toLowerCase();
}

function currentPriceCeiling(task = {}) {
  return number(
    task.cost?.maximum_customer_price ??
    task.metadata?.perceptual_review_spend_ceiling_thb ??
    task.cost?.estimated,
  );
}

function assertTaskBoundary(task = {}) {
  if (String(task.id) !== REVIEW_TASK_ID) {
    throw new Error("SMOKE_REVIEW_TASK_ID_MISMATCH");
  }
  if (String(task.organization_id) !== ORGANIZATION_ID) {
    throw new Error("SMOKE_REVIEW_ORGANIZATION_MISMATCH");
  }
  if (String(task.creative_project_id) !== CREATIVE_PROJECT_ID) {
    throw new Error("SMOKE_REVIEW_PROJECT_MISMATCH");
  }
  if (text(task.type).toUpperCase() !== "QUALITY_REVIEW") {
    throw new Error("SMOKE_REVIEW_TASK_TYPE_MISMATCH");
  }
  if (taskService(task) !== REVIEW_SERVICE) {
    throw new Error("SMOKE_REVIEW_SERVICE_MISMATCH");
  }
  if (text(task.provider_id).toLowerCase() !== REVIEW_PROVIDER) {
    throw new Error("SMOKE_REVIEW_PROVIDER_MISMATCH");
  }
  if (text(task.metadata?.contract) !== REVIEW_CONTRACT) {
    throw new Error("SMOKE_REVIEW_CONTRACT_MISMATCH");
  }
  if (text(task.metadata?.source_generation_task_id) !== SOURCE_TASK_ID) {
    throw new Error("SMOKE_REVIEW_SOURCE_TASK_MISMATCH");
  }
  if (text(task.metadata?.source_asset_node_id) !== SOURCE_ASSET_NODE_ID) {
    throw new Error("SMOKE_REVIEW_SOURCE_ASSET_MISMATCH");
  }
  if (task.cost?.approved !== true) {
    throw new Error("SMOKE_REVIEW_COST_APPROVAL_REQUIRED");
  }
  const ceiling = currentPriceCeiling(task);
  if (
    ceiling === null ||
    ceiling <= 0 ||
    ceiling > MAXIMUM_CUSTOMER_PRICE_THB
  ) {
    throw new Error(`SMOKE_REVIEW_COST_CEILING_INVALID:${ceiling ?? "missing"}`);
  }
  if (number(task.cost?.actual) > 0) {
    throw new Error("SMOKE_REVIEW_ALREADY_CHARGED");
  }
  if (task.metadata?.publication_authorized === true) {
    throw new Error("SMOKE_REVIEW_PUBLICATION_MUST_REMAIN_DISABLED");
  }
  if (task.metadata?.media_regeneration_authorized === true) {
    throw new Error("SMOKE_REVIEW_REGENERATION_MUST_REMAIN_DISABLED");
  }
}

function executionMetadata(task = {}) {
  return object(task.metadata);
}

export async function GET(request) {
  try {
    const token = text(new URL(request.url).searchParams.get("token"));
    if (!token) {
      return json({ success: false, error: "ONE_TIME_TOKEN_REQUIRED" }, 401);
    }

    const task = await ProductionTaskRuntime.get(REVIEW_TASK_ID);
    if (!task) {
      return json({ success: false, error: "SMOKE_REVIEW_TASK_NOT_FOUND" }, 404);
    }

    assertTaskBoundary(task);

    const metadata = executionMetadata(task);
    if (text(metadata.one_time_execution_contract) !== EXECUTION_CONTRACT) {
      return json({ success: false, error: "ONE_TIME_EXECUTION_NOT_PREPARED" }, 409);
    }
    if (metadata.one_time_execution_consumed_at) {
      return json({
        success: false,
        error: "ONE_TIME_EXECUTION_ALREADY_CONSUMED",
        consumed_at: metadata.one_time_execution_consumed_at,
      }, 409);
    }

    const expiresAt = Date.parse(text(metadata.one_time_execution_expires_at));
    if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
      return json({ success: false, error: "ONE_TIME_EXECUTION_EXPIRED" }, 410);
    }
    if (!safeTokenMatch(token, metadata.one_time_execution_token_sha256)) {
      return json({ success: false, error: "ONE_TIME_TOKEN_INVALID" }, 401);
    }
    if (task.status !== "WAITING") {
      return json({
        success: false,
        error: `SMOKE_REVIEW_NOT_WAITING:${task.status}`,
      }, 409);
    }

    const consumedAt = new Date().toISOString();
    const claimedMetadata = {
      ...metadata,
      one_time_execution_consumed_at: consumedAt,
      one_time_execution_token_validated: true,
      one_time_execution_requested_via: "VERCEL_PRODUCTION_SMOKE_GATE",
      one_time_execution_publication_authorized: false,
      one_time_execution_media_regeneration_authorized: false,
    };

    const { data: claimed, error: claimError } = await supabaseAdmin
      .from("creative_production_tasks")
      .update({
        status: "READY",
        metadata: claimedMetadata,
      })
      .eq("id", REVIEW_TASK_ID)
      .eq("status", "WAITING")
      .select("id,status,metadata")
      .maybeSingle();

    if (claimError) throw claimError;
    if (!claimed?.id) {
      return json({ success: false, error: "ONE_TIME_EXECUTION_CLAIM_FAILED" }, 409);
    }

    const result = await ProductionTaskRuntime.dispatch(REVIEW_TASK_ID);
    const validation =
      result?.output?.perceptual_validation ||
      result?.output?.output?.perceptual_validation ||
      null;

    return json({
      success: true,
      execution_contract: EXECUTION_CONTRACT,
      task_id: REVIEW_TASK_ID,
      source_task_id: SOURCE_TASK_ID,
      source_asset_node_id: SOURCE_ASSET_NODE_ID,
      status: result?.status || null,
      provider: result?.provider_id || result?.output?.provider || REVIEW_PROVIDER,
      maximum_customer_price_thb: MAXIMUM_CUSTOMER_PRICE_THB,
      publication_authorized: false,
      media_regeneration_authorized: false,
      perceptual_validation_passed: validation?.passed === true,
      perceptual_validation: validation,
      error: result?.error || null,
      one_time_execution_consumed_at: consumedAt,
    });
  } catch (error) {
    return json({
      success: false,
      error: error?.message || String(error),
      task_id: REVIEW_TASK_ID,
      publication_authorized: false,
      media_regeneration_authorized: false,
    }, 500);
  }
}
