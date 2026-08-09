export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 800;

import { NextResponse } from "next/server";

import {
  requireOrganizationAccess,
} from "@/lib/platform/security/requireOrganizationAccess";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import {
  ProductionTaskRuntime,
} from "@/lib/operations/tasks/runtime/ProductionTaskRuntime";

const ORGANIZATION_ID = "33336a72-acb5-474e-856b-8be0269360e2";
const MISSION_ID = "9e7f4465-366a-485b-ba29-12544e49b8ee";
const PROJECT_ID = "0230a08a-6b47-46e1-9f51-7956d70d304b";
const VIDEO_TASK_ID = "85241ba5-675f-4c25-86d2-3b28114fc74e";
const PROVIDER_JOB_ID = "3cueocet0m6q";
const PROVIDER = "gemini";
const MODEL = "gemini-omni-flash-preview";
const TARGET_SECONDS = 5;
const TEST_CONTRACT = "GEMINI_OMNI_FULL_STUDIO_5S_SMOKE_V1";
const RECOVERABLE_ERROR = "CREATIVE_MEDIA_ASSET_BUCKET_REQUIRED";

function text(value) {
  return String(value ?? "").trim();
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
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

function outputUrl(task = {}) {
  const output = object(task.output);
  const poll = object(output.provider_poll);
  const pollOutput = object(poll.output);
  const raw = object(pollOutput.raw);
  const rawOutput = object(raw.output);
  return text(
    output.video_url ||
    output.file_url ||
    pollOutput.video_url ||
    pollOutput.file_url ||
    rawOutput.video_url ||
    rawOutput.file_url,
  ) || null;
}

async function usages() {
  const { data, error } = await supabaseAdmin
    .from("platform_service_usage")
    .select("id,status,provider,capability,quantity,currency,customer_price,charged_amount,billing_completed,metadata")
    .eq("organization_id", ORGANIZATION_ID)
    .eq("metadata->>task_id", VIDEO_TASK_ID)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data || [];
}

async function recover(request) {
  const access = await requireOrganizationAccess({
    organizationId: ORGANIZATION_ID,
    request,
    requiredAnyPermission: [
      "creative.execute",
      "creative.production.run",
      "creative.*",
    ],
  });
  if (!access.success) return json(access, access.status);

  let task = await ProductionTaskRuntime.get(VIDEO_TASK_ID);
  if (!task) throw new Error("GEMINI_SMOKE_VIDEO_TASK_NOT_FOUND");
  if (String(task.organization_id) !== ORGANIZATION_ID) {
    throw new Error("GEMINI_SMOKE_TASK_ORGANIZATION_INVALID");
  }
  if (String(task.creative_project_id) !== PROJECT_ID) {
    throw new Error("GEMINI_SMOKE_TASK_PROJECT_INVALID");
  }
  if (text(task.provider_id) !== PROVIDER) {
    throw new Error("GEMINI_SMOKE_TASK_PROVIDER_INVALID");
  }

  const usageRows = await usages();
  if (usageRows.length !== 1) {
    throw new Error(`GEMINI_SMOKE_RECOVERY_USAGE_COUNT_INVALID:${usageRows.length}:1`);
  }
  const usage = usageRows[0];
  if (text(usage.provider) !== PROVIDER) {
    throw new Error("GEMINI_SMOKE_RECOVERY_USAGE_PROVIDER_INVALID");
  }
  if (text(usage.capability).toLowerCase() !== "ai.video.generate") {
    throw new Error("GEMINI_SMOKE_RECOVERY_USAGE_CAPABILITY_INVALID");
  }
  if (Number(usage.quantity) !== TARGET_SECONDS) {
    throw new Error("GEMINI_SMOKE_RECOVERY_USAGE_QUANTITY_INVALID");
  }

  const storedJobId = text(
    task.output?.provider_job_id ||
    task.output?.provider_submission?.provider_job_id,
  );
  if (storedJobId !== PROVIDER_JOB_ID) {
    throw new Error(`GEMINI_SMOKE_RECOVERY_JOB_INVALID:${storedJobId}`);
  }

  const status = text(task.status).toUpperCase();
  if (status === "COMPLETED") {
    task = await ProductionTaskRuntime.ensureAssetNode(VIDEO_TASK_ID);
    return json({
      success: true,
      status: "GEMINI_SMOKE_VIDEO_COMPLETED",
      contract: TEST_CONTRACT,
      task_id: VIDEO_TASK_ID,
      asset_node_id: task.output?.asset_node_id || null,
      provider_job_id: PROVIDER_JOB_ID,
      provider_usage_count: 1,
      charged_amount_thb: Number(usage.charged_amount || 0),
      video_url: outputUrl(task),
      recovered_existing_provider_job: true,
      recovered_asset_node_without_provider_execution: true,
      new_provider_generation_executed: false,
      publication_authorized: false,
    });
  }

  if (status === "FAILED") {
    if (text(task.error) !== RECOVERABLE_ERROR) {
      throw new Error(`GEMINI_SMOKE_RECOVERY_ERROR_NOT_ALLOWED:${text(task.error)}`);
    }
    if (!["PENDING", "SUCCESS"].includes(text(usage.status).toUpperCase())) {
      throw new Error(`GEMINI_SMOKE_RECOVERY_USAGE_STATUS_INVALID:${usage.status}`);
    }

    task = await ProductionTaskRuntime.update(VIDEO_TASK_ID, {
      status: "RUNNING",
      input: {
        ...object(task.input),
        provider_status: {
          ...object(task.input?.provider_status),
          model: MODEL,
          creative_mission_id: MISSION_ID,
          creative_project_id: PROJECT_ID,
        },
      },
      metadata: {
        ...object(task.metadata),
        same_provider_job_recovery_contract:
          "GEMINI_SAME_PROVIDER_JOB_OUTPUT_RECOVERY_V1",
        same_provider_job_recovery_job_id: PROVIDER_JOB_ID,
        same_provider_job_recovery_reason: RECOVERABLE_ERROR,
        same_provider_job_recovery_started_at: new Date().toISOString(),
        publication_authorized: false,
      },
      error: null,
    });
  } else if (status !== "RUNNING") {
    throw new Error(`GEMINI_SMOKE_RECOVERY_TASK_STATUS_INVALID:${status}`);
  }

  const recovered = await ProductionTaskRuntime.poll(VIDEO_TASK_ID);
  const finalStatus = text(recovered.status).toUpperCase();
  const finalUsages = await usages();
  if (finalUsages.length !== 1) {
    throw new Error(`GEMINI_SMOKE_RECOVERY_CREATED_NEW_USAGE:${finalUsages.length}`);
  }

  const withAsset = finalStatus === "COMPLETED"
    ? await ProductionTaskRuntime.ensureAssetNode(VIDEO_TASK_ID)
    : recovered;

  return json({
    success: finalStatus === "COMPLETED",
    status: `GEMINI_SMOKE_VIDEO_${finalStatus}`,
    contract: TEST_CONTRACT,
    task_id: VIDEO_TASK_ID,
    asset_node_id: withAsset.output?.asset_node_id || null,
    provider: PROVIDER,
    model: MODEL,
    target_seconds: TARGET_SECONDS,
    provider_job_id: PROVIDER_JOB_ID,
    provider_usage_count: finalUsages.length,
    usage_status: finalUsages[0]?.status || null,
    charged_amount_thb: Number(finalUsages[0]?.charged_amount || 0),
    video_url: outputUrl(withAsset),
    recovered_existing_provider_job: true,
    recovered_asset_node_without_provider_execution: finalStatus === "COMPLETED",
    new_provider_generation_executed: false,
    automatic_retry_authorized: false,
    publication_authorized: false,
    error: withAsset.error || null,
  }, finalStatus === "FAILED" ? 500 : 200);
}

export async function GET(request) {
  try {
    return await recover(request);
  } catch (error) {
    return json({
      success: false,
      contract: TEST_CONTRACT,
      provider_job_id: PROVIDER_JOB_ID,
      recovered_existing_provider_job: true,
      new_provider_generation_executed: false,
      automatic_retry_authorized: false,
      publication_authorized: false,
      error: error?.message || String(error),
    }, 409);
  }
}

export async function POST(request) {
  return GET(request);
}