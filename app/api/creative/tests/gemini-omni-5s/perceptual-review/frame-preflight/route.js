export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";

import {
  ProductionTaskRuntime,
} from "@/lib/operations/tasks/runtime/ProductionTaskRuntime";
import {
  prepareOpenAIVideoAnalysisInput,
} from "@/lib/platform/service-runtime/providers/openai/OpenAIVideoAnalysisFrameRuntime";

const ORGANIZATION_ID = "33336a72-acb5-474e-856b-8be0269360e2";
const REVIEW_TASK_ID = "4ea86c40-6f7c-4b90-9bb9-5e7f5c6a323f";

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

function runtimeReadiness() {
  return {
    ffmpeg_configured: Boolean(text(process.env.CREATIVE_MEDIA_FFMPEG_PATH)),
    ffprobe_configured: Boolean(text(process.env.CREATIVE_MEDIA_FFPROBE_PATH)),
    private_media_ttl_configured: Boolean(
      text(process.env.CREATIVE_PRIVATE_MEDIA_URL_TTL_SECONDS),
    ),
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
  const runtime_readiness = runtimeReadiness();

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

    const prepared = await prepareOpenAIVideoAnalysisInput({
      ...object(task.input),
      capability: "ai.image.analyze",
      context: {
        ...object(task.input?.context),
        organization_id: ORGANIZATION_ID,
        production_task_id: REVIEW_TASK_ID,
      },
    });

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
      source_duration_seconds: Number(contract.source_duration_seconds || 0),
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
      runtime_readiness,
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
