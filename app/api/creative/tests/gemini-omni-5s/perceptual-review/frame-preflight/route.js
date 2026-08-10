export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";

import {
  ProductionTaskRuntime,
} from "@/lib/operations/tasks/runtime/ProductionTaskRuntime";
import {
  signCreativeStorageReference,
} from "@/lib/creative/assets/storage/CreativePrivateStorageRuntime";
import {
  CreativeGeneratedMediaPerceptualExecutionGate,
} from "@/lib/creative/quality/runtime/CreativeGeneratedMediaPerceptualExecutionGate";
import {
  creativeMediaBinaryReadiness,
} from "@/lib/creative/media/runtime/CreativeMediaBinaryRuntime";
import {
  OpenAIVideoAnalysisFrameRuntime,
  prepareOpenAIVideoAnalysisInput,
} from "@/lib/platform/service-runtime/providers/openai/OpenAIVideoAnalysisFrameRuntime";

const ORGANIZATION_ID = "33336a72-acb5-474e-856b-8be0269360e2";
const REVIEW_TASK_ID = "4ea86c40-6f7c-4b90-9bb9-5e7f5c6a323f";
const SOURCE_TASK_ID = "85241ba5-675f-4c25-86d2-3b28114fc74e";
const REVIEW_URL_TTL_SECONDS = 15 * 60;

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function list(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function text(value) {
  return String(value ?? "").trim();
}

function inputShape(input = {}) {
  const providerParameters = object(input.provider_parameters);
  return {
    input_type: typeof input,
    media_kind: text(input.media_kind) || null,
    provider_media_kind: text(providerParameters.media_kind) || null,
    has_video: Boolean(text(input.video)),
    has_media: Boolean(text(input.media)),
    has_source: Boolean(text(input.source)),
    has_image: Boolean(text(input.image)),
    has_generated_media_url: Boolean(text(providerParameters.generated_media_url)),
    primary_video_resolved: Boolean(
      OpenAIVideoAnalysisFrameRuntime.primaryVideoUrl(input),
    ),
    duration_hint_seconds:
      OpenAIVideoAnalysisFrameRuntime.durationHint(input) || null,
  };
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

export async function GET() {
  const runtime_readiness = creativeMediaBinaryReadiness();

  try {
    const task = await ProductionTaskRuntime.get(REVIEW_TASK_ID);
    if (!task) {
      return json({
        success: false,
        error: "SMOKE_REVIEW_TASK_NOT_FOUND",
        runtime_readiness,
      }, 404);
    }
    if (String(task.organization_id) !== ORGANIZATION_ID) {
      return json({
        success: false,
        error: "SMOKE_REVIEW_ORGANIZATION_MISMATCH",
        runtime_readiness,
      }, 409);
    }
    if (text(task.capability || task.service_code).toLowerCase() !== "ai.image.analyze") {
      return json({
        success: false,
        error: "SMOKE_REVIEW_CAPABILITY_MISMATCH",
        runtime_readiness,
      }, 409);
    }
    if (!list(task.depends_on).includes(SOURCE_TASK_ID)) {
      return json({
        success: false,
        error: "SMOKE_REVIEW_SOURCE_DEPENDENCY_MISMATCH",
        runtime_readiness,
      }, 409);
    }

    const sourceTask = await ProductionTaskRuntime.get(SOURCE_TASK_ID);
    if (!sourceTask || sourceTask.status !== "COMPLETED") {
      return json({
        success: false,
        error: "SMOKE_REVIEW_SOURCE_TASK_NOT_COMPLETED",
        runtime_readiness,
      }, 409);
    }
    if (String(sourceTask.organization_id) !== ORGANIZATION_ID) {
      return json({
        success: false,
        error: "SMOKE_REVIEW_SOURCE_ORGANIZATION_MISMATCH",
        runtime_readiness,
      }, 409);
    }

    const sourceReference =
      CreativeGeneratedMediaPerceptualExecutionGate.outputUrl(sourceTask.output);
    if (!sourceReference) {
      return json({
        success: false,
        error: "SMOKE_REVIEW_SOURCE_MEDIA_REFERENCE_REQUIRED",
        runtime_readiness,
      }, 409);
    }

    const reviewUrl = await signCreativeStorageReference({
      organization_id: ORGANIZATION_ID,
      reference: sourceReference,
      expires_in: REVIEW_URL_TTL_SECONDS,
    });
    if (!/^https:\/\//i.test(text(reviewUrl))) {
      return json({
        success: false,
        error: "SMOKE_REVIEW_SIGNED_HTTPS_SOURCE_REQUIRED",
        runtime_readiness,
      }, 409);
    }

    const persisted_input_shape = inputShape(object(task.input));
    const expectedMediaKind = text(
      task.input?.requirements?.expected_contract?.media_kind ||
      task.metadata?.media_kind ||
      task.input?.provider_parameters?.media_kind,
    ).toUpperCase();
    const boundInput = {
      ...object(task.input),
      openai_video_analysis_frame_contract: null,
      capability: "ai.image.analyze",
      media_kind: expectedMediaKind || "VIDEO",
      image: reviewUrl,
      media: reviewUrl,
      source: reviewUrl,
      video: reviewUrl,
      assets: [
        {
          url: reviewUrl,
          role: "GENERATED_MEDIA_UNDER_REVIEW",
        },
      ],
      provider_parameters: {
        ...object(task.input?.provider_parameters),
        media_kind: expectedMediaKind || "VIDEO",
        generated_media_url: reviewUrl,
        source_generation_task_id: SOURCE_TASK_ID,
      },
      context: {
        ...object(task.input?.context),
        organization_id: ORGANIZATION_ID,
        production_task_id: REVIEW_TASK_ID,
      },
    };
    const bound_input_shape = inputShape(boundInput);

    const prepared = await prepareOpenAIVideoAnalysisInput(boundInput);
    const contract = object(prepared.openai_video_analysis_frame_contract);
    const frameAssets = list(prepared.assets).filter(
      (asset) => text(asset?.role) === "GENERATED_VIDEO_FRAME_UNDER_REVIEW",
    );

    return json({
      success:
        contract.contract === "OPENAI_VIDEO_ANALYSIS_FRAME_SET_V1" &&
        contract.prepared === true &&
        Number(contract.frame_count) === 7 &&
        frameAssets.length === 7,
      contract: contract.contract || null,
      prepared: contract.prepared === true,
      frame_count: Number(contract.frame_count || 0),
      frame_asset_count: frameAssets.length,
      source_transport: contract.source_transport || null,
      source_duration_seconds: Number(contract.source_duration_seconds || 0),
      source_duration_basis: contract.source_duration_basis || null,
      source_file_size_bytes: Number(contract.source_file_size_bytes || 0),
      fractions: list(contract.fractions),
      frames: list(contract.frames).map((frame) => ({
        index: Number(frame.index || 0),
        timestamp_seconds: Number(frame.timestamp_seconds || 0),
        width: Number(frame.width || 0),
        height: Number(frame.height || 0),
        jpeg_bytes: Number(frame.jpeg_bytes || 0),
        encoded_bytes: Number(frame.encoded_bytes || 0),
      })),
      persisted_input_shape,
      bound_input_shape,
      runtime_readiness,
      source_reference_resolved: true,
      fresh_signed_source_bound: true,
      database_writes_executed: false,
      provider_calls_executed: false,
      publication_authorized: false,
      media_regeneration_authorized: false,
    });
  } catch (error) {
    return json({
      success: false,
      error: error?.message || String(error),
      runtime_readiness,
      database_writes_executed: false,
      provider_calls_executed: false,
      publication_authorized: false,
      media_regeneration_authorized: false,
    }, 500);
  }
}
