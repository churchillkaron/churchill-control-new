export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

import crypto from "node:crypto";

import {
  executeService,
  settlePendingService,
} from "@/lib/platform/service-runtime/execution/ServiceExecutionRuntime";
import { getServiceSupabase } from "@/lib/shared/supabase/service";

const supabase = getServiceSupabase();

const TOKEN = "avq-synthetic-intelligence-opening-20260822-v2";
const ORGANIZATION_ID = "33336a72-acb5-474e-856b-8be0269360e2";
const ENTITY_ID = "073dc5f5-b6a8-4cae-8cda-fd7acb21ef50";
const PROVIDER = "runway";
const MODEL = "gemini_omni_flash";
const DURATION_SECONDS = 8;
const BUCKET = "creative-assets";
const OUTPUT_DIR = `${ORGANIZATION_ID}/avantiqo-investor-film-20260822/opening-v2`;

function json(data, status = 200) {
  return Response.json(data, {
    status,
    headers: { "Cache-Control": "no-store, private" },
  });
}

function text(value) {
  return String(value ?? "").trim();
}

function mediaUrlFrom(value, seen = new Set()) {
  if (!value) return null;
  if (typeof value === "string") {
    return /^https:\/\//i.test(value) ? value : null;
  }
  if (typeof value !== "object" || seen.has(value)) return null;
  seen.add(value);
  if (Array.isArray(value)) {
    return value.map((item) => mediaUrlFrom(item, seen)).find(Boolean) || null;
  }
  for (const key of [
    "video_url", "videoUrl", "download_url", "downloadUrl", "url",
    "output", "outputs", "result", "results", "data", "files", "videos",
  ]) {
    const found = mediaUrlFrom(value[key], seen);
    if (found) return found;
  }
  return null;
}

function generationContract(take) {
  const variation = `Creative variation ${take}: use a unique composition and camera path; do not repeat any previous take.`;
  const description = [
    "Create an eight-second world-class cinematic technology launch film announcing a new category called SYNTHETIC INTELLIGENCE.",
    variation,
    "0.0-2.0 seconds: start almost completely black. A restrained intelligent presence awakens through elegant volumetric light, microscopic energy filaments, smoked-glass reflections and dark-metal depth. Real cinematic parallax, expensive optics, controlled movement.",
    "2.0-4.8 seconds: intelligence converges physically in deep three-dimensional space. The camera makes a slow confident push while dark platinum matter, glass and light organize with deliberate purpose.",
    "4.8-6.6 seconds: the exact words SYNTHETIC INTELLIGENCE become the hero object. Physically dimensional lettering with true thickness and bevels, polished smoked glass, dark platinum metal, restrained champagne-gold edge reflections, realistic specular highlights and volumetric depth. Exact spelling only. No other readable words or logos. Hold with authority.",
    "6.6-8.0 seconds: the dimensional title elegantly collapses, dissolves or disassembles back into darkness and a narrow controlled field of light. End on a calm black frame for the Avantiqo reveal.",
    "Overall feeling: global luxury technology launch, prestige cinema title design, powerful, intelligent, sophisticated, believable, restrained and expensive.",
    "ABSOLUTE NEGATIVES: no humans, no Churchill, no restaurant, no screens, no dashboards, no software UI, no network diagram, no data globe, no cyberpunk neon, no gaming aesthetic, no cheap hologram, no blue sci-fi tunnel, no particle explosion, no glitch typography, no additional text, no misspelling, no flat 2D title card, no slideshow, no voice-over.",
  ].join("\n\n");

  return {
    model: MODEL,
    prompt: description,
    description,
    title: `Avantiqo Synthetic Intelligence opening — generated take ${take}`,
    quantity: DURATION_SECONDS,
    currency: "THB",
    generation: {
      model: MODEL,
      output_spec: {
        duration_seconds: DURATION_SECONDS,
        aspect_ratio: "16:9",
        resolution: "720p",
      },
      provider_parameters: {
        duration: DURATION_SECONDS,
        aspect_ratio: "16:9",
      },
    },
    output_spec: {
      duration_seconds: DURATION_SECONDS,
      aspect_ratio: "16:9",
      resolution: "720p",
    },
    provider_parameters: {
      duration: DURATION_SECONDS,
      aspect_ratio: "16:9",
    },
  };
}

async function signedUrl(storagePath, seconds = 86400) {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(storagePath, seconds);
  if (error) throw error;
  return data?.signedUrl || null;
}

async function ingestProviderVideo({ providerUrl, take, providerJobId }) {
  const response = await fetch(providerUrl, {
    method: "GET",
    redirect: "follow",
    headers: { Accept: "video/mp4,video/*;q=0.9,*/*;q=0.1" },
  });
  if (!response.ok) {
    throw new Error(`SYNTHETIC_OPENING_PROVIDER_VIDEO_DOWNLOAD_FAILED:${response.status}`);
  }
  const bytes = Buffer.from(await response.arrayBuffer());
  if (!bytes.length) throw new Error("SYNTHETIC_OPENING_PROVIDER_VIDEO_EMPTY");

  const outputPath = `${OUTPUT_DIR}/synthetic-intelligence-omni-take-${take}.mp4`;
  const { error } = await supabase.storage.from(BUCKET).upload(outputPath, bytes, {
    contentType: text(response.headers.get("content-type")) || "video/mp4",
    cacheControl: "3600",
    upsert: true,
    metadata: {
      organization_id: ORGANIZATION_ID,
      investor_film: "20260822",
      opening_version: "synthetic-intelligence-v2",
      generator: "gemini-omni-flash",
      gateway: "runway",
      provider_job_id: providerJobId,
      take: String(take),
      ffmpeg_used: "false",
      publication_authorized: "false",
    },
  });
  if (error) throw error;

  return {
    output_path: outputPath,
    signed_url: await signedUrl(outputPath),
    bytes: bytes.length,
    sha256: crypto.createHash("sha256").update(bytes).digest("hex"),
  };
}

export async function GET(request) {
  try {
    const url = new URL(request.url);
    if (url.searchParams.get("token") !== TOKEN) return json({ success: false }, 404);
    const action = text(url.searchParams.get("action") || "status").toLowerCase();
    const take = Math.max(2, Math.min(99, Number(url.searchParams.get("take") || 2) || 2));

    if (action === "status") {
      return json({
        success: true,
        provider: PROVIDER,
        model: MODEL,
        duration_seconds: DURATION_SECONDS,
        ffmpeg_used: false,
        mode: "AI_GENERATED_VIDEO_ONLY",
      });
    }

    if (action === "start") {
      const result = await executeService({
        organization_id: ORGANIZATION_ID,
        bill_to_organization_id: ORGANIZATION_ID,
        entity_id: ENTITY_ID,
        service_id: "ai.video.generate",
        provider_id: PROVIDER,
        provider_policy: {
          allowed_providers: [PROVIDER],
          preferred_providers: [PROVIDER],
          preferred_models: [MODEL],
        },
        input: generationContract(take),
        metadata: {
          module: "CREATIVE",
          operation: "AVANTIQO_SYNTHETIC_INTELLIGENCE_OPENING_V2",
          brand: "Avantiqo",
          source: `avantiqo_synthetic_intelligence_opening_20260822_v2_take_${take}`,
          generator: "GEMINI_OMNI_FLASH",
          gateway: "RUNWAY_API",
          take,
          generated_video_only: true,
          ffmpeg_used: false,
          churchill_allowed: false,
          publication_authorized: false,
        },
        category: "AI",
      });

      return json({
        success: true,
        pending: result?.pending ?? null,
        provider: result?.provider || null,
        model: result?.model || null,
        provider_job_id: result?.provider_job_id || result?.output?.provider_job_id || null,
        provider_status: result?.provider_status || result?.output?.status || null,
        usage_id: result?.usage?.id || null,
        credential_id: result?.credential_id || null,
        started_at: result?.started_at || null,
        take,
        ffmpeg_used: false,
      });
    }

    if (action === "poll") {
      const providerJobId = text(url.searchParams.get("provider_job_id"));
      const usageId = text(url.searchParams.get("usage_id"));
      const credentialId = text(url.searchParams.get("credential_id")) || null;
      const startedAt = text(url.searchParams.get("started_at")) || null;
      if (!providerJobId || !usageId) {
        return json({ success: false, error: "Missing poll parameters" }, 400);
      }

      const result = await settlePendingService({
        organization_id: ORGANIZATION_ID,
        provider: PROVIDER,
        provider_job_id: providerJobId,
        usage_id: usageId,
        credential_id: credentialId,
        started_at: startedAt,
        provider_status_input: { model: MODEL },
        metadata: {
          module: "CREATIVE",
          operation: "AVANTIQO_SYNTHETIC_INTELLIGENCE_OPENING_V2_POLL",
          brand: "Avantiqo",
          take,
          ffmpeg_used: false,
          publication_authorized: false,
        },
      });

      if (result?.pending) {
        return json({
          success: true,
          pending: true,
          failed: false,
          provider_status: result?.provider_status || null,
          take,
          ffmpeg_used: false,
        });
      }
      if (result?.failed || result?.success === false) {
        return json({
          success: false,
          pending: false,
          failed: true,
          provider_status: result?.provider_status || null,
          error: result?.error || "Provider generation failed",
          take,
          ffmpeg_used: false,
        }, 502);
      }

      const providerUrl = mediaUrlFrom(result?.output || result);
      if (!providerUrl) {
        return json({
          success: false,
          pending: false,
          failed: true,
          error: "SYNTHETIC_OPENING_PROVIDER_VIDEO_URL_MISSING",
          take,
          ffmpeg_used: false,
        }, 502);
      }

      const stored = await ingestProviderVideo({
        providerUrl,
        take,
        providerJobId,
      });
      return json({
        success: true,
        pending: false,
        failed: false,
        provider_status: result?.provider_status || "completed",
        provider_job_id: providerJobId,
        take,
        ffmpeg_used: false,
        ...stored,
      });
    }

    if (action === "signed") {
      const outputPath = `${OUTPUT_DIR}/synthetic-intelligence-omni-take-${take}.mp4`;
      return json({
        success: true,
        take,
        ffmpeg_used: false,
        output_path: outputPath,
        signed_url: await signedUrl(outputPath),
      });
    }

    return json({ success: false, error: "Unsupported action" }, 400);
  } catch (error) {
    return json({ success: false, error: error?.message || String(error) }, 500);
  }
}
