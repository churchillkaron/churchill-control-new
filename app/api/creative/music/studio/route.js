export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

import { randomUUID } from "node:crypto";
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
  buildMusicTransformationPlan,
  MUSIC_SOURCE_AUDIO_RIGHTS_ATTESTATION_CONTRACT,
} from "@/lib/creative/runtime/engines/MusicEngine";
import {
  executeService,
  settlePendingService,
} from "@/lib/platform/service-runtime/execution/ServiceExecutionRuntime";
import { UsageRuntime } from "@/lib/platform/service-runtime/usage/UsageRuntime";
import {
  requireOrganizationAccess,
} from "@/lib/platform/security/requireOrganizationAccess";
import { getServiceSupabase } from "@/lib/shared/supabase/service";

const EXECUTION_PERMISSIONS = Object.freeze([
  "creative.execute",
  "creative.production.run",
  "creative.*",
]);
const MUSIC_BUCKET = "creative-assets";
const MAX_BACKING_SOURCE_BYTES = 629145600;
const AUDIO_EXTENSIONS = new Set(["wav", "mp3", "m4a", "aac", "flac", "ogg"]);
const SEPARATOR_ASSET_KEYS = Object.freeze([
  "backing_track_wav",
  "backing_track_mp3",
  "vocals",
  "drums",
  "bass",
  "other",
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
  if (error?.status) return error.status;
  if (value.includes("NOT_CERTIFIED") || value.includes("ENGINE_DISABLED")) return 503;
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

function backingSessionFromUsage(usage, fallback = {}) {
  const saved = object(usage?.metadata?.backing_track_session);
  return {
    title: text(saved.title || fallback.title || "Backing track").slice(0, 160),
    source_audio: text(saved.source_audio || fallback.source_audio),
    source_duration_seconds: finite(saved.source_duration_seconds ?? usage?.quantity ?? fallback.source_duration_seconds, null),
    key_shift_semitones: finite(saved.key_shift_semitones ?? fallback.key_shift_semitones, 0),
    tempo_ratio: finite(saved.tempo_ratio ?? fallback.tempo_ratio, 1),
    count_in_bars: finite(saved.count_in_bars ?? fallback.count_in_bars, 0),
    bpm: finite(saved.bpm ?? fallback.bpm, null),
    export_stems: saved.export_stems !== false,
    preserve_arrangement: saved.preserve_arrangement !== false,
    rights_attestation: object(saved.rights_attestation),
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

function safeFileName(value) {
  const original = text(value || "source-audio");
  const pieces = original.split(".");
  const extension = text(pieces.length > 1 ? pieces.pop() : "").toLowerCase();
  if (!AUDIO_EXTENSIONS.has(extension)) {
    throw new Error("CREATIVE_MUSIC_SOURCE_AUDIO_EXTENSION_INVALID");
  }
  const base = pieces.join(".")
    .normalize("NFKD")
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 100) || "source-audio";
  return `${base}.${extension}`;
}

async function prepareSourceUpload(body) {
  const organizationId = text(body.organization_id);
  const fileName = safeFileName(body.file_name);
  const sizeBytes = finite(body.size_bytes, null);
  const contentType = text(body.content_type).toLowerCase();
  if (sizeBytes === null || sizeBytes <= 0 || sizeBytes > MAX_BACKING_SOURCE_BYTES) {
    throw new Error(`CREATIVE_MUSIC_SOURCE_AUDIO_SIZE_INVALID:max=${MAX_BACKING_SOURCE_BYTES}`);
  }
  if (contentType && !contentType.startsWith("audio/")) {
    throw new Error("CREATIVE_MUSIC_SOURCE_AUDIO_CONTENT_TYPE_INVALID");
  }
  const path = `${organizationId}/source/music-backing-tracks/${randomUUID()}-${fileName}`;
  const supabase = getServiceSupabase();
  const { data, error } = await supabase.storage
    .from(MUSIC_BUCKET)
    .createSignedUploadUrl(path, { upsert: false });
  if (error) throw error;
  if (!data?.signedUrl) throw new Error("CREATIVE_MUSIC_SOURCE_UPLOAD_URL_REQUIRED");
  return {
    success: true,
    upload_url: data.signedUrl,
    storage_reference: `storage://${MUSIC_BUCKET}/${path}`,
    max_source_bytes: MAX_BACKING_SOURCE_BYTES,
    max_source_duration_seconds: 900,
    accepted_extensions: [...AUDIO_EXTENSIONS],
  };
}

function backingPlan(body) {
  const plan = buildMusicTransformationPlan("backing_track", {
    ...body,
    rights_attestation: {
      contract: MUSIC_SOURCE_AUDIO_RIGHTS_ATTESTATION_CONTRACT,
      confirmed: body.source_rights_confirmed === true || body.rights_attestation?.confirmed === true,
    },
  });
  return {
    success: true,
    plan,
    ready_for_execution: plan.executable === true,
    production_certified: plan.executable === true,
    rights_confirmation_required: true,
    content_restriction_policy: plan.content_restriction_policy,
  };
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
      requirements: { output_spec: plan.output_spec },
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
    provider_policy: { preferred_providers: ["avantiqo-audio"] },
    category: plan.category,
  });

  const usage = result?.usage || (result?.usage?.id ? await UsageRuntime.get(result.usage.id) : null);
  return completeMusicPipeline({ organizationId, body, result, usage, session });
}

async function executeBackingTrack(body) {
  const organizationId = text(body.organization_id);
  const plan = backingPlan(body).plan;
  if (plan.executable !== true) {
    const error = new Error(`CREATIVE_MUSIC_BACKING_TRACK_NOT_CERTIFIED:${plan.certification}`);
    error.code = "CREATIVE_MUSIC_BACKING_TRACK_NOT_CERTIFIED";
    error.status = 503;
    throw error;
  }
  const duration = finite(plan.session.source_duration_seconds, null);
  if (duration === null || duration <= 0) {
    throw new Error("CREATIVE_MUSIC_SOURCE_DURATION_REQUIRED");
  }
  const processing = {
    ...plan.provider_parameters,
    bpm: finite(body.bpm, null),
    rights_attestation: plan.rights_attestation,
  };
  const result = await executeService({
    organization_id: organizationId,
    bill_to_organization_id: organizationId,
    entity_id: text(body.entity_id) || null,
    service_id: plan.service_id,
    capability: plan.capability,
    input: {
      title: plan.session.title,
      description: "Create an original-arrangement backing track from the confirmed source audio.",
      quantity: duration,
      currency: text(body.currency || "THB"),
      source_audio: plan.source_audio,
      requirements: {
        output_spec: plan.output_spec,
        rights_attestation: plan.rights_attestation,
      },
      output_spec: plan.output_spec,
      provider_parameters: processing,
      metadata: {
        rights_attestation: plan.rights_attestation,
        backing_track: true,
      },
    },
    metadata: {
      module: "CREATIVE",
      operation: "AVANTIQO_MUSIC_STUDIO_BACKING_TRACK",
      creative_project_id: text(body.creative_project_id) || null,
      creative_mission_id: text(body.creative_mission_id) || null,
      backing_track_session: {
        title: plan.session.title,
        source_audio: plan.source_audio,
        source_duration_seconds: duration,
        key_shift_semitones: processing.key_shift_semitones,
        tempo_ratio: processing.tempo_ratio,
        count_in_bars: processing.count_in_bars,
        bpm: processing.bpm,
        export_stems: processing.export_stems,
        preserve_arrangement: processing.preserve_arrangement,
        rights_attestation: plan.rights_attestation,
      },
      source_rights_attested: true,
      source_rights_attestation_contract: MUSIC_SOURCE_AUDIO_RIGHTS_ATTESTATION_CONTRACT,
      content_restriction_policy: "USER_RIGHTS_ATTESTATION_ONLY",
      owned_engine_preferred: true,
      provider_selection_exposed: false,
      user_prompt_surface: false,
    },
    provider_policy: {
      preferred_providers: ["avantiqo-audio"],
      allowed_providers: ["avantiqo-audio"],
    },
    category: plan.category,
  });
  const usage = result?.usage || (result?.usage?.id ? await UsageRuntime.get(result.usage.id) : null);
  return completeBackingTrackPipeline({ organizationId, result, usage, session: plan.session });
}

function separatorOutput(result = {}) {
  const first = object(result.output);
  return object(first.output || first);
}

async function persistSeparatorAssets({ organizationId, usage, result, session }) {
  if (!usage?.id) return [];
  const output = separatorOutput(result);
  const providerAssets = object(output.assets);
  const references = object(output.storage_references || output.storageReferences);
  const existing = await CreativeAssetsRuntime.list({ organization_id: organizationId, limit: 500 });
  const byKey = new Map(
    existing
      .filter((asset) => text(asset.metadata?.music_separator_usage_id) === text(usage.id))
      .map((asset) => [text(asset.metadata?.music_separator_output_key), asset]),
  );
  const assets = [];
  const projectId = text(usage.metadata?.creative_project_id) || null;
  const missionId = text(usage.metadata?.creative_mission_id) || null;
  const exportStems = session?.processing?.export_stems !== false && session?.export_stems !== false;

  for (const key of SEPARATOR_ASSET_KEYS) {
    if (!exportStems && ["vocals", "drums", "bass", "other"].includes(key)) continue;
    const reference = text(providerAssets[key]?.storage_reference || references[key]);
    if (!reference) continue;
    if (byKey.has(key)) {
      assets.push(byKey.get(key));
      continue;
    }
    const isBacking = key.startsWith("backing_track_");
    const extension = key.endsWith("mp3") ? "mp3" : "wav";
    const title = isBacking
      ? `${text(session?.title || "Backing track")} ${extension.toUpperCase()}`
      : `${text(session?.title || "Backing track")} - ${key}`;
    const asset = await CreativeAssetsRuntime.create({
      organization_id: organizationId,
      creative_project_id: projectId,
      creative_mission_id: missionId,
      asset_type: isBacking ? "MUSIC_BACKING_TRACK" : "MUSIC_STEM",
      file_url: reference,
      file_name: `${key}.${extension}`,
      title,
      description: isBacking
        ? "Original-arrangement backing track generated from user-confirmed source audio."
        : `${key} source-separated stem from user-confirmed source audio.`,
      ai_generated: false,
      provider: "avantiqo-audio",
      engine: "demucs-htdemucs-ft",
      metadata: {
        media_kind: "MUSIC",
        music_studio_asset: true,
        backing_track: isBacking,
        stem: isBacking ? null : key,
        storage_reference: reference,
        music_separator_usage_id: usage.id,
        music_separator_output_key: key,
        separator_quality_profile: "DEMUCS_HTDEMUCS_FT_4STEM_V1",
        source_audio: session?.source_audio || null,
        source_rights_attested: true,
        source_rights_attestation_contract: MUSIC_SOURCE_AUDIO_RIGHTS_ATTESTATION_CONTRACT,
        content_restriction_policy: "USER_RIGHTS_ATTESTATION_ONLY",
        creative_project_id: projectId,
        creative_mission_id: missionId,
      },
    });
    assets.push(asset);
  }
  return assets;
}

async function completeBackingTrackPipeline({ organizationId, result, usage, session }) {
  if (result?.pending === true || result?.failed === true) {
    return {
      success: result?.success !== false,
      pending: result?.pending === true,
      failed: result?.failed === true,
      provider_status: result?.provider_status || null,
      usage_id: usage?.id || result?.usage?.id || null,
      output: result?.output || null,
      session,
      assets: [],
      engine: {
        owner: "AVANTIQO",
        family: "MUSIC_SEPARATOR",
        capability: "ai.audio.stems",
        model: "demucs-htdemucs-ft",
        quality_profile: "DEMUCS_HTDEMUCS_FT_4STEM_V1",
        rights_confirmation_required: true,
        content_restriction_policy: "USER_RIGHTS_ATTESTATION_ONLY",
      },
    };
  }
  const assets = await persistSeparatorAssets({ organizationId, usage, result, session });
  const primary = assets.find((asset) => text(asset.metadata?.music_separator_output_key) === "backing_track_wav") || assets[0] || null;
  return {
    success: true,
    pending: false,
    failed: false,
    provider_status: result?.provider_status || "completed",
    usage_id: usage?.id || result?.usage?.id || null,
    settlement: result?.settlement || null,
    output: result?.output || null,
    asset: publicAsset(primary),
    assets: assets.map(publicAsset),
    session,
    engine: {
      owner: "AVANTIQO",
      family: "MUSIC_SEPARATOR",
      capability: "ai.audio.stems",
      model: "demucs-htdemucs-ft",
      quality_profile: "DEMUCS_HTDEMUCS_FT_4STEM_V1",
      rights_confirmation_required: true,
      content_restriction_policy: "USER_RIGHTS_ATTESTATION_ONLY",
    },
  };
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
  const capability = text(usage.capability);
  if (!["ai.music.generate", "ai.audio.stems"].includes(capability)) {
    throw new Error("CREATIVE_MUSIC_USAGE_CAPABILITY_INVALID");
  }

  const provider = text(usage.provider);
  const providerJobId = text(usage.provider_request_id || usage.metadata?.provider_request_id);
  if (!provider) throw new Error("CREATIVE_MUSIC_USAGE_PROVIDER_REQUIRED");
  if (!providerJobId) throw new Error("CREATIVE_MUSIC_PROVIDER_JOB_REQUIRED");

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
      operation: capability === "ai.audio.stems"
        ? "AVANTIQO_MUSIC_STUDIO_BACKING_TRACK_SETTLE"
        : "AVANTIQO_MUSIC_STUDIO_SETTLE",
      creative_project_id: text(usage.metadata?.creative_project_id) || null,
      creative_mission_id: text(usage.metadata?.creative_mission_id) || null,
    },
  });

  const settledUsage = result?.usage || await UsageRuntime.get(usageId);
  if (capability === "ai.audio.stems") {
    return completeBackingTrackPipeline({
      organizationId,
      result,
      usage: settledUsage,
      session: backingSessionFromUsage(usage, body),
    });
  }
  return completeMusicPipeline({
    organizationId,
    body: {
      ...body,
      creative_project_id: text(usage.metadata?.creative_project_id) || null,
      creative_mission_id: text(usage.metadata?.creative_mission_id) || null,
    },
    result,
    usage: settledUsage,
    session: musicSessionFromUsage(usage, body),
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
    asset: { ...publicAsset(asset), playback_url: url },
  };
}

async function history(body) {
  const organizationId = text(body.organization_id);
  if (!organizationId) throw new Error("organization_id required");
  const [generated, allAssets] = await Promise.all([
    CreativeMusicFinishingRuntime.history({
      organizationId,
      projectId: text(body.creative_project_id) || null,
      missionId: text(body.creative_mission_id) || null,
    }),
    CreativeAssetsRuntime.list({
      organization_id: organizationId,
      creative_project_id: text(body.creative_project_id) || null,
      creative_mission_id: text(body.creative_mission_id) || null,
      limit: 500,
    }),
  ]);
  const separator = allAssets.filter((asset) => asset.metadata?.music_studio_asset === true);
  const merged = [...new Map([...separator, ...generated].map((asset) => [asset.id, asset])).values()];
  return {
    success: true,
    pending: false,
    failed: false,
    assets: merged,
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
      : action === "prepare_source_upload"
        ? await prepareSourceUpload(body)
        : action === "backing_track_plan"
          ? backingPlan(body)
          : action === "backing_track"
            ? await executeBackingTrack(body)
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
