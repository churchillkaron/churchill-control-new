export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

import { NextResponse } from "next/server";

import { CreativeAssetsRuntime } from "@/lib/creative/assets/runtime/CreativeAssetsRuntime";
import {
  resolveCreativeProviderAssetUrl,
} from "@/lib/creative/assets/storage/resolveCreativeProviderAssetUrl";
import {
  CreativeMusicFinishingRuntime,
} from "@/lib/creative/music/runtime/CreativeMusicFinishingRuntime";
import {
  buildMusicGenerationPlan,
} from "@/lib/creative/runtime/engines/MusicEngine";
import {
  executeService,
  settlePendingService,
} from "@/lib/platform/service-runtime/execution/ServiceExecutionRuntime";
import { UsageRuntime } from "@/lib/platform/service-runtime/usage/UsageRuntime";
import {
  requireOrganizationAccess,
} from "@/lib/platform/security/requireOrganizationAccess";

const EXECUTION_PERMISSIONS = Object.freeze([
  "creative.execute",
  "creative.production.run",
  "creative.*",
]);

function text(value) {
  return String(value ?? "").trim();
}

function finite(value, fallback = null) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function clamp(value, min, max, fallback) {
  const number = finite(value, fallback);
  return Math.max(min, Math.min(max, number));
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function errorStatus(error) {
  const value = `${text(error?.code)}:${text(error?.message)}`.toUpperCase();
  if (value.includes("REQUIRED") || value.includes("INVALID")) return 400;
  if (value.includes("PERMISSION") || value.includes("FORBIDDEN") || value.includes("UNAUTHORIZED")) return 403;
  if (value.includes("NOT FOUND") || value.includes("NOT_FOUND")) return 404;
  if (value.includes("WALLET") || value.includes("BALANCE")) return 402;
  return 500;
}

async function requireAccess(request, organizationId) {
  const access = await requireOrganizationAccess({
    organizationId,
    request,
    requiredAnyPermission: EXECUTION_PERMISSIONS,
  });
  if (!access.success) {
    const error = new Error(access.error || "CREATIVE_MUSIC_ACCESS_FORBIDDEN");
    error.code = access.code || "CREATIVE_MUSIC_ACCESS_FORBIDDEN";
    error.status = access.status || 403;
    throw error;
  }
  return access;
}

function musicSessionFromUsage(usage, fallback = {}) {
  const metadata = object(usage?.metadata);
  const saved = object(metadata.music_session);
  const mastering = object(metadata.audio_finishing_target);
  return {
    title: text(saved.title || fallback.title || "Avantiqo composition").slice(0, 160),
    style: text(saved.style || fallback.style),
    mood: text(saved.mood || fallback.mood),
    energy: text(saved.energy || fallback.energy),
    instrumentation: text(saved.instrumentation || fallback.instrumentation),
    structure: text(saved.structure || fallback.structure),
    duration_seconds: finite(saved.duration_seconds ?? usage?.quantity ?? fallback.duration_seconds, 30),
    bpm: finite(saved.bpm ?? fallback.bpm, 96),
    keyscale: text(saved.keyscale || fallback.keyscale),
    timesignature: text(saved.timesignature || fallback.timesignature || "4"),
    instrumental: saved.instrumental !== false,
    vocal_language: text(saved.vocal_language || fallback.vocal_language || "unknown"),
    mastering_profile: text(saved.mastering_profile || metadata.mastering_profile || fallback.mastering_profile || "streaming"),
    mastering: {
      target_lufs: finite(mastering.target_lufs, -14),
      true_peak_dbtp: finite(mastering.true_peak_dbtp, -1),
    },
  };
}

function publicAsset(asset) {
  if (!asset) return null;
  return {
    id: asset.id,
    title: asset.title || asset.name || asset.file_name || null,
    file_url: asset.file_url || null,
    asset_type: asset.asset_type || null,
    metadata: asset.metadata || {},
  };
}

function publicExecution(result, { session = null, usage = null, sourceAsset = null, finishing = null } = {}) {
  return {
    success: result?.success !== false,
    pending: result?.pending === true,
    failed: result?.failed === true,
    provider_status: result?.provider_status || null,
    usage_id: usage?.id || result?.usage?.id || null,
    settlement: result?.settlement || null,
    output: result?.output || null,
    asset: publicAsset(sourceAsset),
    master_asset: finishing?.master_asset || null,
    finishing: finishing ? {
      status: finishing.status,
      ready: finishing.ready === true,
      failed: finishing.failed === true,
      error: finishing.error || null,
      source_task_id: finishing.source_task_id || null,
      finish_task_id: finishing.finish_task_id || null,
    } : null,
    session,
    engine: {
      owner: "AVANTIQO",
      family: "ACE_STEP_1_5",
      certified_capability: "ai.music.generate",
      provider_selection_exposed: false,
      execution_transport_only_direction: true,
      automatic_finishing: true,
      downstream_mastering_runtime: "AVANTIQO_AUDIO_FINISHING",
    },
  };
}

async function completeMusicPipeline({ organizationId, body, result, usage, session }) {
  if (result?.pending === true || result?.failed === true) {
    return publicExecution(result, { session, usage });
  }

  const projectId = text(body.creative_project_id || usage?.metadata?.creative_project_id) || null;
  const missionId = text(body.creative_mission_id || usage?.metadata?.creative_mission_id) || null;
  const sourceAsset = await CreativeMusicFinishingRuntime.persistGeneration({
    organizationId,
    projectId,
    missionId,
    result,
    session,
    usage,
  });

  const finishing = sourceAsset
    ? await CreativeMusicFinishingRuntime.ensureMaster({
        organizationId,
        projectId,
        missionId,
        sourceAsset,
        session,
        usage,
        result,
        retryFailed: body.retry_finishing === true,
      })
    : null;

  return publicExecution(result, {
    session,
    usage,
    sourceAsset,
    finishing,
  });
}

async function compose(body) {
  const organizationId = text(body.organization_id);
  if (!organizationId) throw new Error("organization_id required");
  const plan = buildMusicGenerationPlan(body);
  const session = plan.session;

  const result = await executeService({
    organization_id: organizationId,
    bill_to_organization_id: organizationId,
    entity_id: text(body.entity_id) || null,
    service_id: plan.service_id,
    capability: plan.capability,
    input: {
      title: session.title,
      description: session.direction,
      quantity: session.duration_seconds,
      currency: text(body.currency || "THB"),
      generation: plan.generation,
      requirements: {
        output_spec: plan.output_spec,
      },
      output_spec: {
        duration_seconds: plan.output_spec.duration_seconds,
        format: plan.output_spec.format,
        mastering_profile: plan.output_spec.mastering_profile,
      },
      provider_parameters: {
        ...(body.seed !== undefined && body.seed !== null && body.seed !== ""
          ? { seed: Math.round(clamp(body.seed, 0, 4294967295, 0)) }
          : {}),
        inference_steps: Math.round(clamp(body.inference_steps, 1, 20, 8)),
        shift: clamp(body.shift, 1, 5, 3),
      },
    },
    metadata: {
      module: "CREATIVE",
      operation: "AVANTIQO_MUSIC_STUDIO_COMPOSE",
      creative_project_id: text(body.creative_project_id) || null,
      creative_mission_id: text(body.creative_mission_id) || null,
      mastering_profile: session.mastering_profile,
      audio_finishing_target: session.mastering,
      music_session: {
        title: session.title,
        style: session.style,
        mood: session.mood,
        energy: session.energy,
        instrumentation: session.instrumentation,
        structure: session.structure,
        duration_seconds: session.duration_seconds,
        bpm: session.bpm,
        keyscale: session.keyscale || null,
        timesignature: session.timesignature,
        instrumental: session.instrumental,
        vocal_language: session.vocal_language,
        mastering_profile: session.mastering_profile,
      },
      owned_engine_preferred: true,
      provider_selection_exposed: false,
      user_prompt_surface: false,
    },
    provider_policy: {
      preferred_providers: ["avantiqo-audio"],
    },
    category: plan.category,
  });

  const usage = result?.usage || (result?.usage?.id ? await UsageRuntime.get(result.usage.id) : null);
  return completeMusicPipeline({ organizationId, body, result, usage, session });
}

async function status(body) {
  const organizationId = text(body.organization_id);
  if (!organizationId) throw new Error("organization_id required");
  const usageId = text(body.usage_id);
  if (!usageId) throw new Error("usage_id required");

  const usage = await UsageRuntime.get(usageId);
  if (!usage || text(usage.organization_id) !== organizationId) {
    const error = new Error("CREATIVE_MUSIC_USAGE_NOT_FOUND");
    error.code = "CREATIVE_MUSIC_USAGE_NOT_FOUND";
    error.status = 404;
    throw error;
  }
  if (text(usage.capability) !== "ai.music.generate") {
    throw new Error("CREATIVE_MUSIC_USAGE_CAPABILITY_INVALID");
  }

  const provider = text(usage.provider);
  const providerJobId = text(usage.provider_request_id || usage.metadata?.provider_request_id);
  if (!provider) throw new Error("CREATIVE_MUSIC_USAGE_PROVIDER_REQUIRED");
  if (!providerJobId) throw new Error("CREATIVE_MUSIC_PROVIDER_JOB_REQUIRED");

  const session = musicSessionFromUsage(usage, body);
  const result = await settlePendingService({
    organization_id: organizationId,
    provider,
    provider_job_id: providerJobId,
    usage_id: usageId,
    pricing: {},
    quantity: finite(usage.quantity, null),
    unit: text(usage.unit) || null,
    credential_id: null,
    started_at: text(usage.execution_started_at || usage.created_at) || null,
    metadata: {
      module: "CREATIVE",
      operation: "AVANTIQO_MUSIC_STUDIO_SETTLE",
      creative_project_id: text(usage.metadata?.creative_project_id) || null,
      creative_mission_id: text(usage.metadata?.creative_mission_id) || null,
    },
  });

  const settledUsage = result?.usage || await UsageRuntime.get(usageId);
  return completeMusicPipeline({
    organizationId,
    body: {
      ...body,
      creative_project_id: text(usage.metadata?.creative_project_id) || null,
      creative_mission_id: text(usage.metadata?.creative_mission_id) || null,
    },
    result,
    usage: settledUsage,
    session,
  });
}

async function resolveAsset(body) {
  const organizationId = text(body.organization_id);
  if (!organizationId) throw new Error("organization_id required");
  const assetId = text(body.asset_id);
  if (!assetId) throw new Error("asset_id required");

  const asset = await CreativeAssetsRuntime.get(assetId);
  if (!asset || text(asset.organization_id) !== organizationId) {
    const error = new Error("CREATIVE_MUSIC_ASSET_NOT_FOUND");
    error.code = "CREATIVE_MUSIC_ASSET_NOT_FOUND";
    error.status = 404;
    throw error;
  }
  const reference = text(asset.file_url || asset.metadata?.storage_reference);
  if (!reference) throw new Error("CREATIVE_MUSIC_ASSET_URL_REQUIRED");
  const url = await resolveCreativeProviderAssetUrl({
    organization_id: organizationId,
    value: reference,
  });
  return {
    success: true,
    pending: false,
    failed: false,
    asset: {
      ...publicAsset(asset),
      playback_url: url,
    },
  };
}

async function history(body) {
  const organizationId = text(body.organization_id);
  if (!organizationId) throw new Error("organization_id required");
  const assets = await CreativeMusicFinishingRuntime.history({
    organizationId,
    projectId: text(body.creative_project_id) || null,
    missionId: text(body.creative_mission_id) || null,
  });
  return {
    success: true,
    pending: false,
    failed: false,
    assets,
  };
}

export async function POST(request) {
  try {
    const body = await request.json();
    const organizationId = text(body.organization_id);
    if (!organizationId) {
      return NextResponse.json({ success: false, error: "organization_id required" }, { status: 400 });
    }
    await requireAccess(request, organizationId);

    const action = text(body.action || "compose").toLowerCase();
    const result = action === "compose"
      ? await compose(body)
      : action === "status"
        ? await status(body)
        : action === "resolve_asset"
          ? await resolveAsset(body)
          : action === "history"
            ? await history(body)
            : null;

    if (!result) {
      return NextResponse.json(
        { success: false, error: "CREATIVE_MUSIC_ACTION_INVALID" },
        { status: 400 },
      );
    }

    return NextResponse.json(result, {
      status: result.failed ? 502 : 200,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error?.message || "Creative Music Studio execution failed",
        code: error?.code || null,
      },
      { status: error?.status || errorStatus(error) },
    );
  }
}
