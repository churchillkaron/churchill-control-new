export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

import { NextResponse } from "next/server";

import {
  executeService,
  settlePendingService,
} from "@/lib/platform/service-runtime/execution/ServiceExecutionRuntime";
import {
  requireOrganizationAccess,
} from "@/lib/platform/security/requireOrganizationAccess";

const EXECUTION_PERMISSIONS = Object.freeze([
  "creative.execute",
  "creative.production.run",
  "creative.*",
]);

const MASTERING_PROFILES = Object.freeze({
  streaming: Object.freeze({ target_lufs: -14, true_peak_dbtp: -1 }),
  cinematic: Object.freeze({ target_lufs: -16, true_peak_dbtp: -1 }),
  broadcast: Object.freeze({ target_lufs: -23, true_peak_dbtp: -1 }),
  club: Object.freeze({ target_lufs: -9, true_peak_dbtp: -0.8 }),
});

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

function normalizedSession(body = {}) {
  const style = text(body.style || body.genre || "cinematic modern").slice(0, 120);
  const mood = text(body.mood || "premium, emotionally controlled").slice(0, 120);
  const energy = text(body.energy || "balanced").slice(0, 80);
  const instrumentation = text(body.instrumentation || "").slice(0, 240);
  const structure = text(body.structure || "intro, development, lift, resolution").slice(0, 240);
  const title = text(body.title || "Untitled composition").slice(0, 160);
  const instrumental = body.instrumental !== false;
  const lyrics = instrumental ? "" : text(body.lyrics).slice(0, 4096);
  if (!instrumental && !lyrics) {
    const error = new Error("CREATIVE_MUSIC_LYRICS_REQUIRED_FOR_VOCAL_MODE");
    error.code = "CREATIVE_MUSIC_LYRICS_REQUIRED_FOR_VOCAL_MODE";
    throw error;
  }

  const durationSeconds = clamp(body.duration_seconds, 10, 180, 30);
  const bpm = Math.round(clamp(body.bpm, 30, 300, 96));
  const keyscale = text(body.keyscale || body.key || "").slice(0, 32);
  const rawTimeSignature = text(body.timesignature || body.time_signature || "4");
  const timesignature = ({ "2/4": "2", "3/4": "3", "4/4": "4", "6/8": "6" })[rawTimeSignature] || rawTimeSignature;
  if (!["2", "3", "4", "6"].includes(timesignature)) {
    const error = new Error("CREATIVE_MUSIC_TIME_SIGNATURE_INVALID");
    error.code = "CREATIVE_MUSIC_TIME_SIGNATURE_INVALID";
    throw error;
  }

  const profileId = text(body.mastering_profile || "streaming").toLowerCase();
  const validProfile = Object.hasOwn(MASTERING_PROFILES, profileId);
  const mastering = validProfile ? MASTERING_PROFILES[profileId] : MASTERING_PROFILES.streaming;
  const vocalLanguage = instrumental ? "unknown" : text(body.vocal_language || "english").toLowerCase().slice(0, 16);

  const directionParts = [
    `${style} music`,
    `${mood} mood`,
    `${energy} energy`,
    instrumentation ? `instrumentation: ${instrumentation}` : null,
    `arrangement: ${structure}`,
    `${bpm} BPM`,
    keyscale ? `key: ${keyscale}` : null,
    instrumental ? "instrumental, no vocals" : `${vocalLanguage} vocals with supplied lyrics`,
    "cohesive arrangement, professional dynamics, strong musical transitions, release-quality composition",
  ].filter(Boolean);

  return {
    title,
    style,
    mood,
    energy,
    instrumentation,
    structure,
    instrumental,
    lyrics,
    duration_seconds: durationSeconds,
    bpm,
    keyscale,
    timesignature,
    vocal_language: vocalLanguage,
    mastering_profile: validProfile ? profileId : "streaming",
    mastering,
    direction: directionParts.join("; "),
  };
}

function publicExecution(result, session = null, execution = {}) {
  const output = result?.output || null;
  return {
    success: result?.success !== false,
    pending: result?.pending === true,
    failed: result?.failed === true,
    provider: result?.provider || execution.provider || null,
    model: result?.model || execution.model || null,
    provider_job_id: result?.provider_job_id || execution.provider_job_id || null,
    provider_status: result?.provider_status || null,
    usage_id: result?.usage?.id || execution.usage_id || null,
    pricing: result?.pricing || result?.reservation_pricing || execution.pricing || null,
    credential_id: result?.credential_id || execution.credential_id || null,
    started_at: result?.started_at || execution.started_at || null,
    settlement: result?.settlement || null,
    output,
    ...(session ? {
      session: {
        title: session.title,
        style: session.style,
        mood: session.mood,
        duration_seconds: session.duration_seconds,
        bpm: session.bpm,
        keyscale: session.keyscale || null,
        timesignature: session.timesignature,
        instrumental: session.instrumental,
        vocal_language: session.vocal_language,
        structure: session.structure,
        mastering_profile: session.mastering_profile,
        mastering: session.mastering,
      },
    } : {}),
    engine: {
      owner: "AVANTIQO",
      family: "ACE_STEP_1_5",
      certified_capability: "ai.music.generate",
      provider_selection_exposed: false,
      execution_transport_only_direction: true,
      downstream_mastering_runtime: "AVANTIQO_AUDIO_FINISHING",
    },
  };
}

async function compose(body) {
  const organizationId = text(body.organization_id);
  if (!organizationId) throw new Error("organization_id required");
  const session = normalizedSession(body);

  const result = await executeService({
    organization_id: organizationId,
    bill_to_organization_id: organizationId,
    entity_id: text(body.entity_id) || null,
    service_id: "ai.music.generate",
    capability: "ai.music.generate",
    input: {
      title: session.title,
      description: session.direction,
      quantity: session.duration_seconds,
      currency: text(body.currency || "THB"),
      generation: {
        caption: session.direction,
        lyrics: session.lyrics,
        instrumental: session.instrumental,
        bpm: session.bpm,
        keyscale: session.keyscale,
        timesignature: session.timesignature,
        duration_seconds: session.duration_seconds,
        vocal_language: session.vocal_language,
        structure: session.structure,
        style: session.style,
        mood: session.mood,
        energy: session.energy,
        instrumentation: session.instrumentation,
      },
      requirements: {
        output_spec: {
          duration_seconds: session.duration_seconds,
          format: "wav",
          sample_rate: 48000,
          channels: 2,
          mastering_profile: session.mastering_profile,
          loudness: session.mastering,
        },
      },
      output_spec: {
        duration_seconds: session.duration_seconds,
        format: "wav",
        mastering_profile: session.mastering_profile,
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
      owned_engine_preferred: true,
      provider_selection_exposed: false,
      user_prompt_surface: false,
    },
    provider_policy: {
      preferred_providers: ["avantiqo-audio"],
    },
    category: "AI",
  });

  return publicExecution(result, session);
}

async function status(body) {
  const organizationId = text(body.organization_id);
  if (!organizationId) throw new Error("organization_id required");
  const provider = text(body.provider);
  const providerJobId = text(body.provider_job_id);
  const usageId = text(body.usage_id);
  if (!provider) throw new Error("provider required");
  if (!providerJobId) throw new Error("provider_job_id required");
  if (!usageId) throw new Error("usage_id required");

  const result = await settlePendingService({
    organization_id: organizationId,
    provider,
    provider_job_id: providerJobId,
    usage_id: usageId,
    pricing: body.pricing || {},
    quantity: finite(body.quantity, null),
    unit: text(body.unit) || null,
    credential_id: text(body.credential_id) || null,
    started_at: text(body.started_at) || null,
    metadata: {
      module: "CREATIVE",
      operation: "AVANTIQO_MUSIC_STUDIO_SETTLE",
      creative_project_id: text(body.creative_project_id) || null,
      creative_mission_id: text(body.creative_mission_id) || null,
    },
  });

  return publicExecution(result, null, {
    provider,
    provider_job_id: providerJobId,
    usage_id: usageId,
    pricing: body.pricing || null,
    credential_id: text(body.credential_id) || null,
    started_at: text(body.started_at) || null,
  });
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
