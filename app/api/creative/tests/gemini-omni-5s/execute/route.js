export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 800;

import { NextResponse } from "next/server";

import {
  requireOrganizationAccess,
} from "@/lib/platform/security/requireOrganizationAccess";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import {
  CreativeMissionRuntime,
} from "@/lib/creative/missions/runtime/CreativeMissionRuntime";
import {
  CreativeProjectRuntime,
} from "@/lib/creative/projects/runtime/CreativeProjectRuntime";
import {
  CreativeApprovalRuntime,
} from "@/lib/creative/release/runtime/CreativeApprovalRuntime";
import {
  ProductionTaskRuntime,
} from "@/lib/operations/tasks/runtime/ProductionTaskRuntime";
import {
  PricingRuntime,
} from "@/lib/platform/service-runtime/pricing/PricingRuntime";

import "@/lib/creative/execution/runtime/CreativeApprovedProductionTaskCostGuardRuntime";
import "@/lib/creative/production/dossier/runtime/CreativeProductionDossierExecutionGate";

const ORGANIZATION_ID = "33336a72-acb5-474e-856b-8be0269360e2";
const MISSION_ID = "9e7f4465-366a-485b-ba29-12544e49b8ee";
const PROJECT_ID = "0230a08a-6b47-46e1-9f51-7956d70d304b";
const SOURCE_ASSET_ID = "fc1997d3-ed07-4478-a5a5-6baa484d0074";
const DOSSIER_ASSET_NODE_ID = "925f2756-c12d-452a-a94f-9add19888afe";
const VIDEO_TASK_ID = "85241ba5-675f-4c25-86d2-3b28114fc74e";
const TEST_CONTRACT = "GEMINI_OMNI_FULL_STUDIO_5S_SMOKE_V1";
const APPROVAL_PHRASE = "APPROVE VIDEO 22.75 THB";
const APPROVAL_CONTRACT = "CREATIVE_SINGLE_MEDIA_EXECUTION_APPROVAL_V1";
const TARGET_SECONDS = 5;
const MAXIMUM_CUSTOMER_PRICE = 22.75;
const CURRENCY = "THB";
const PROVIDER = "gemini";
const MODEL = "gemini-omni-flash-preview";

function text(value) {
  return String(value ?? "").trim();
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function number(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function sameMoney(left, right) {
  const a = number(left);
  const b = number(right);
  return a !== null && b !== null && Math.abs(a - b) <= 0.000001;
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

function taskDuration(task = {}) {
  return number(
    task.input?.media_duration_seconds ??
    task.input?.quantity ??
    task.input?.generation?.estimated_seconds ??
    task.input?.generation?.output_spec?.duration_seconds ??
    task.timing?.estimated_seconds,
  );
}

function taskSourceAssetId(task = {}) {
  return text(
    task.input?.generation?.primary_source_asset_id ||
    task.input?.provider_parameters?.primary_source_asset_id ||
    task.metadata?.source_asset_id,
  );
}

function outputUrl(task = {}) {
  const output = object(task.output);
  const nested = object(output.output);
  const provider = object(output.provider_poll);
  const providerOutput = object(provider.output);
  return text(
    nested.video_url ||
    nested.file_url ||
    output.video_url ||
    output.file_url ||
    providerOutput.video_url ||
    providerOutput.file_url,
  ) || null;
}

async function exactUsageCount(taskId) {
  const { count, error } = await supabaseAdmin
    .from("platform_service_usage")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", ORGANIZATION_ID)
    .eq("metadata->>task_id", taskId);
  if (error) throw error;
  return Number(count || 0);
}

async function assertStaticScope({ mission, project, task }) {
  if (!mission || String(mission.organization_id) !== ORGANIZATION_ID) {
    throw new Error("GEMINI_SMOKE_MISSION_SCOPE_INVALID");
  }
  if (!project || String(project.organization_id) !== ORGANIZATION_ID) {
    throw new Error("GEMINI_SMOKE_PROJECT_SCOPE_INVALID");
  }
  if (String(task.organization_id) !== ORGANIZATION_ID) {
    throw new Error("GEMINI_SMOKE_TASK_ORGANIZATION_INVALID");
  }
  if (String(task.creative_project_id) !== PROJECT_ID) {
    throw new Error("GEMINI_SMOKE_TASK_PROJECT_INVALID");
  }
  if (text(task.capability || task.service_code).toLowerCase() !== "ai.video.generate") {
    throw new Error("GEMINI_SMOKE_VIDEO_CAPABILITY_INVALID");
  }
  if (text(task.provider_id) !== PROVIDER) {
    throw new Error("GEMINI_SMOKE_VIDEO_PROVIDER_INVALID");
  }
  if (text(task.input?.generation?.model) !== MODEL) {
    throw new Error("GEMINI_SMOKE_VIDEO_MODEL_INVALID");
  }
  if (taskDuration(task) !== TARGET_SECONDS) {
    throw new Error(`GEMINI_SMOKE_VIDEO_DURATION_INVALID:${taskDuration(task)}`);
  }
  if (taskSourceAssetId(task) !== SOURCE_ASSET_ID) {
    throw new Error("GEMINI_SMOKE_VIDEO_SOURCE_INVALID");
  }
  if (mission.metadata?.gemini_omni_smoke?.dossier_asset_node_id !== DOSSIER_ASSET_NODE_ID) {
    throw new Error("GEMINI_SMOKE_DOSSIER_IDENTITY_CHANGED");
  }
  if (mission.metadata?.gemini_omni_smoke?.video_task_id &&
      mission.metadata.gemini_omni_smoke.video_task_id !== VIDEO_TASK_ID) {
    throw new Error("GEMINI_SMOKE_TASK_IDENTITY_CHANGED");
  }
}

async function resolvedVideoPricing() {
  const pricing = await PricingRuntime.resolve({
    provider: PROVIDER,
    capability: "ai.video.generate",
    model: MODEL,
    currency: CURRENCY,
    usage: { quantity: TARGET_SECONDS },
  });
  if (
    text(pricing.currency).toUpperCase() !== CURRENCY ||
    !sameMoney(pricing.customer_price, MAXIMUM_CUSTOMER_PRICE)
  ) {
    throw new Error(
      `GEMINI_SMOKE_APPROVED_PRICE_CHANGED:${pricing.customer_price}:${pricing.currency}`,
    );
  }
  return pricing;
}

async function approveOnce({ access, mission, task, pricing }) {
  const existing = object(task.metadata?.media_generation_authorization);
  if (existing.contract === APPROVAL_CONTRACT) {
    if (
      existing.media_generation_authorized !== true ||
      existing.publication_authorized !== false ||
      text(existing.approval_phrase) !== APPROVAL_PHRASE ||
      text(existing.task_id) !== VIDEO_TASK_ID ||
      text(existing.source_asset_id) !== SOURCE_ASSET_ID ||
      text(existing.provider) !== PROVIDER ||
      text(existing.model) !== MODEL ||
      number(existing.quantity) !== TARGET_SECONDS ||
      !sameMoney(existing.maximum_customer_price, MAXIMUM_CUSTOMER_PRICE) ||
      text(existing.currency).toUpperCase() !== CURRENCY
    ) {
      throw new Error("GEMINI_SMOKE_EXISTING_MEDIA_APPROVAL_INVALID");
    }
    return task;
  }

  if (text(task.status).toUpperCase() !== "WAITING") {
    throw new Error(`GEMINI_SMOKE_NEW_APPROVAL_REQUIRES_WAITING_TASK:${task.status}`);
  }

  const dossierApproval = await CreativeApprovalRuntime.approve({
    organization_id: ORGANIZATION_ID,
    subject_asset_node_id: DOSSIER_ASSET_NODE_ID,
    scope: "PRODUCTION_DOSSIER",
    approver: {
      user_id: access.userId,
      staff_account_id: access.access.staffAccountId,
      email: access.userEmail,
    },
    notes: `${TEST_CONTRACT}: ${APPROVAL_PHRASE}; exactly one governed 5-second Gemini video generation; publication remains unauthorized.`,
    approved_cost_ceiling: MAXIMUM_CUSTOMER_PRICE,
  });

  const authorization = {
    contract: APPROVAL_CONTRACT,
    test_contract: TEST_CONTRACT,
    approval_phrase: APPROVAL_PHRASE,
    media_generation_authorized: true,
    publication_authorized: false,
    organization_id: ORGANIZATION_ID,
    creative_mission_id: MISSION_ID,
    creative_project_id: PROJECT_ID,
    production_graph_id: task.production_graph_id,
    dossier_asset_node_id: DOSSIER_ASSET_NODE_ID,
    dossier_approval_record_asset_node_id: dossierApproval.approval?.id || null,
    task_id: VIDEO_TASK_ID,
    source_asset_id: SOURCE_ASSET_ID,
    capability: "ai.video.generate",
    provider: PROVIDER,
    model: MODEL,
    quantity: TARGET_SECONDS,
    unit: pricing.unit || "second",
    maximum_customer_price: MAXIMUM_CUSTOMER_PRICE,
    currency: CURRENCY,
    pricing_id: pricing.pricing_id,
    authorized_by_user_id: access.userId,
    authorized_by_staff_account_id: access.access.staffAccountId,
    authorized_at: new Date().toISOString(),
  };

  const updated = await ProductionTaskRuntime.update(task.id, {
    cost: {
      ...(task.cost || {}),
      estimated: pricing.customer_price,
      approved: true,
      currency: CURRENCY,
    },
    input: {
      ...(task.input || {}),
      approved_cost_guard: {
        contract: "CREATIVE_APPROVED_PRODUCTION_TASK_COST_GUARD_V1",
        maximum_customer_price: MAXIMUM_CUSTOMER_PRICE,
        currency: CURRENCY,
        reference: `${TEST_CONTRACT}:${VIDEO_TASK_ID}`,
        estimated_quantity: TARGET_SECONDS,
      },
    },
    metadata: {
      ...(task.metadata || {}),
      media_generation_authorization: authorization,
      approved_cost_guard: {
        contract: "CREATIVE_APPROVED_PRODUCTION_TASK_COST_GUARD_V1",
        maximum_customer_price: MAXIMUM_CUSTOMER_PRICE,
        currency: CURRENCY,
        reference: `${TEST_CONTRACT}:${VIDEO_TASK_ID}`,
        estimated_quantity: TARGET_SECONDS,
      },
      media_generation_authorized: true,
      publication_authorized: false,
    },
  });

  await CreativeMissionRuntime.update(MISSION_ID, {
    metadata: {
      ...(mission.metadata || {}),
      gemini_omni_smoke: {
        ...object(mission.metadata?.gemini_omni_smoke),
        phase: "VIDEO_AUTHORIZED",
        video_task_id: VIDEO_TASK_ID,
        dossier_asset_node_id: DOSSIER_ASSET_NODE_ID,
        media_generation_authorized: true,
        publication_authorized: false,
        media_generation_authorization: authorization,
        updated_at: new Date().toISOString(),
      },
    },
  });

  return updated;
}

async function execute(request) {
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
  if (!access.access?.staffAccountId) {
    return json({ success: false, error: "Authenticated staff account required" }, 403);
  }

  const [mission, project, originalTask] = await Promise.all([
    CreativeMissionRuntime.get(MISSION_ID),
    CreativeProjectRuntime.get(PROJECT_ID),
    ProductionTaskRuntime.get(VIDEO_TASK_ID),
  ]);
  if (!originalTask) throw new Error("GEMINI_SMOKE_VIDEO_TASK_NOT_FOUND");
  await assertStaticScope({ mission, project, task: originalTask });

  const status = text(originalTask.status).toUpperCase();
  const previousUsageCount = await exactUsageCount(VIDEO_TASK_ID);

  if (status === "COMPLETED") {
    return json({
      success: true,
      status: "GEMINI_SMOKE_VIDEO_COMPLETED",
      contract: TEST_CONTRACT,
      task_id: VIDEO_TASK_ID,
      provider: PROVIDER,
      model: MODEL,
      target_seconds: TARGET_SECONDS,
      customer_price_ceiling_thb: MAXIMUM_CUSTOMER_PRICE,
      provider_usage_count: previousUsageCount,
      video_url: outputUrl(originalTask),
      publication_authorized: false,
      media_generation_authorized: true,
    });
  }

  if (status === "RUNNING") {
    if (previousUsageCount !== 1) {
      throw new Error(`GEMINI_SMOKE_RUNNING_USAGE_COUNT_INVALID:${previousUsageCount}:1`);
    }
    const polled = await ProductionTaskRuntime.poll(VIDEO_TASK_ID);
    return json({
      success: text(polled.status).toUpperCase() === "COMPLETED",
      status: `GEMINI_SMOKE_VIDEO_${text(polled.status).toUpperCase()}`,
      contract: TEST_CONTRACT,
      task_id: VIDEO_TASK_ID,
      provider: PROVIDER,
      model: MODEL,
      target_seconds: TARGET_SECONDS,
      customer_price_ceiling_thb: MAXIMUM_CUSTOMER_PRICE,
      provider_usage_count: await exactUsageCount(VIDEO_TASK_ID),
      provider_job_id: polled.output?.provider_job_id || null,
      video_url: outputUrl(polled),
      publication_authorized: false,
      media_generation_authorized: true,
    }, text(polled.status).toUpperCase() === "FAILED" ? 500 : 200);
  }

  if (status === "FAILED") {
    return json({
      success: false,
      status: "GEMINI_SMOKE_VIDEO_FAILED_NO_AUTOMATIC_RETRY",
      contract: TEST_CONTRACT,
      task_id: VIDEO_TASK_ID,
      provider_usage_count: previousUsageCount,
      error: originalTask.error || "Previous governed video execution failed",
      publication_authorized: false,
    }, 409);
  }

  if (status !== "WAITING") {
    throw new Error(`GEMINI_SMOKE_VIDEO_TASK_STATUS_INVALID:${status}`);
  }
  if (previousUsageCount !== 0) {
    throw new Error(`GEMINI_SMOKE_WAITING_TASK_ALREADY_HAS_USAGE:${previousUsageCount}`);
  }

  const pricing = await resolvedVideoPricing();
  const approvedTask = await approveOnce({
    access,
    mission,
    task: originalTask,
    pricing,
  });

  const usageBeforeDispatch = await exactUsageCount(VIDEO_TASK_ID);
  if (usageBeforeDispatch !== 0) {
    throw new Error(`GEMINI_SMOKE_USAGE_APPEARED_BEFORE_DISPATCH:${usageBeforeDispatch}`);
  }

  const dispatched = await ProductionTaskRuntime.dispatch(approvedTask.id);
  const usageAfterDispatch = await exactUsageCount(VIDEO_TASK_ID);
  if (usageAfterDispatch > 1) {
    throw new Error(`GEMINI_SMOKE_MULTIPLE_PROVIDER_USAGE_DETECTED:${usageAfterDispatch}`);
  }

  const dispatchedStatus = text(dispatched.status).toUpperCase();
  await CreativeMissionRuntime.update(MISSION_ID, {
    metadata: {
      ...(await CreativeMissionRuntime.get(MISSION_ID)).metadata,
      gemini_omni_smoke: {
        ...object((await CreativeMissionRuntime.get(MISSION_ID)).metadata?.gemini_omni_smoke),
        phase: dispatchedStatus === "COMPLETED"
          ? "VIDEO_COMPLETED"
          : dispatchedStatus === "RUNNING"
            ? "VIDEO_RUNNING"
            : dispatchedStatus === "FAILED"
              ? "VIDEO_FAILED"
              : "VIDEO_DISPATCHED",
        media_generation_authorized: true,
        publication_authorized: false,
        video_task_id: VIDEO_TASK_ID,
        provider_usage_count: usageAfterDispatch,
        updated_at: new Date().toISOString(),
      },
    },
  });

  return json({
    success: dispatchedStatus === "COMPLETED",
    status: `GEMINI_SMOKE_VIDEO_${dispatchedStatus}`,
    contract: TEST_CONTRACT,
    task_id: VIDEO_TASK_ID,
    dossier_asset_node_id: DOSSIER_ASSET_NODE_ID,
    source_asset_id: SOURCE_ASSET_ID,
    provider: PROVIDER,
    model: MODEL,
    target_seconds: TARGET_SECONDS,
    resolved_customer_price_thb: pricing.customer_price,
    customer_price_ceiling_thb: MAXIMUM_CUSTOMER_PRICE,
    provider_usage_count: usageAfterDispatch,
    provider_job_id: dispatched.output?.provider_job_id || null,
    video_url: outputUrl(dispatched),
    publication_authorized: false,
    media_generation_authorized: true,
    automatic_retry_authorized: false,
  }, dispatchedStatus === "FAILED" ? 500 : 200);
}

export async function GET(request) {
  try {
    return await execute(request);
  } catch (error) {
    return json({
      success: false,
      contract: TEST_CONTRACT,
      target_seconds: TARGET_SECONDS,
      customer_price_ceiling_thb: MAXIMUM_CUSTOMER_PRICE,
      publication_authorized: false,
      error: error?.message || String(error),
    }, 409);
  }
}

export async function POST(request) {
  return GET(request);
}
