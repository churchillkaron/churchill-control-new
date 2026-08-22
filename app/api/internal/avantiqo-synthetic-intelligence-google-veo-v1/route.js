export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

import {
  executeService,
  settlePendingService,
} from "@/lib/platform/service-runtime/execution/ServiceExecutionRuntime";

const TOKEN = "avq-synthetic-intelligence-google-veo-20260822-v1";
const ORGANIZATION_ID = "33336a72-acb5-474e-856b-8be0269360e2";
const ENTITY_ID = "073dc5f5-b6a8-4cae-8cda-fd7acb21ef50";
const PROVIDER = "google-veo";
const MODEL = "veo-3.1-generate-preview";
const DURATION_SECONDS = 8;

function json(data, status = 200) {
  return Response.json(data, {
    status,
    headers: { "Cache-Control": "no-store, private" },
  });
}

function text(value) {
  return String(value ?? "").trim();
}

function contract(take = 1) {
  const description = [
    "Create an eight-second world-class cinematic technology launch film announcing a new category called SYNTHETIC INTELLIGENCE.",
    `Creative take ${take}: use a distinct premium composition and camera path.`,
    "0.0-2.0 seconds: begin almost completely black. A restrained intelligent presence awakens through elegant volumetric light, microscopic energy filaments, smoked-glass reflections and dark-platinum depth. Real cinematic parallax, expensive optics, controlled movement.",
    "2.0-4.8 seconds: intelligence converges physically in deep three-dimensional space. The camera makes a slow confident push while dark platinum matter, glass and light organize with deliberate purpose.",
    "4.8-6.6 seconds: the exact words SYNTHETIC INTELLIGENCE become the hero object. Physically dimensional lettering with true thickness and bevels, polished smoked glass, dark platinum metal, restrained champagne-gold edge reflections, realistic specular highlights and volumetric depth. Exact spelling only. No other readable words or logos. Hold with authority.",
    "6.6-8.0 seconds: the dimensional title elegantly collapses, dissolves or disassembles back into darkness and a narrow controlled field of light. End on a calm black frame ready for the Avantiqo reveal.",
    "Overall feeling: global luxury technology launch, prestige cinema title design, powerful, intelligent, sophisticated, believable, restrained and expensive.",
    "ABSOLUTE NEGATIVES: no humans, no Churchill, no restaurant, no screens, no dashboards, no software UI, no network diagram, no data globe, no cyberpunk neon, no gaming aesthetic, no cheap hologram, no blue sci-fi tunnel, no particle explosion, no glitch typography, no additional text, no misspelling, no flat 2D title card, no slideshow, no voice-over.",
  ].join("\n\n");

  return {
    title: `Avantiqo Synthetic Intelligence Opening — Google Veo Take ${take}`,
    description,
    requirements: {
      visual_quality: "world-class photoreal cinematic 3D title cinematography",
      dimensionality: "true physical extrusion, bevels, material depth, perspective and reflections",
      exact_text: "SYNTHETIC INTELLIGENCE",
      negative_constraints: [
        "no humans",
        "no Churchill",
        "no restaurant",
        "no software UI",
        "no network diagrams",
        "no cyberpunk neon",
        "no blue sci-fi tunnel",
        "no cheap hologram",
        "no extra text",
        "no misspelling",
        "no flat 2D title card",
      ],
    },
    shot_bible: {
      output: {
        duration_seconds: DURATION_SECONDS,
        aspect_ratio: "16:9",
        resolution: "1080p",
      },
    },
    output_spec: {
      duration_seconds: DURATION_SECONDS,
      aspect_ratio: "16:9",
      resolution: "1080p",
    },
    provider_parameters: {
      aspect_ratio: "16:9",
      resolution: "1080p",
      generate_audio: false,
    },
    quantity: DURATION_SECONDS,
    currency: "THB",
  };
}

export async function GET(request) {
  try {
    const url = new URL(request.url);
    if (url.searchParams.get("token") !== TOKEN) return json({ success: false }, 404);
    const action = text(url.searchParams.get("action") || "status").toLowerCase();
    const take = Math.max(1, Math.min(9, Number(url.searchParams.get("take") || 1) || 1));

    if (action === "status") {
      return json({
        success: true,
        provider: PROVIDER,
        model: MODEL,
        duration_seconds: DURATION_SECONDS,
        mode: "DIRECT_GOOGLE_VEO_AI_GENERATED_VIDEO_ONLY",
        ffmpeg_used: false,
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
          weights: { preference: 100 },
        },
        input: contract(take),
        metadata: {
          module: "CREATIVE",
          operation: "AVANTIQO_SYNTHETIC_INTELLIGENCE_GOOGLE_VEO_V1",
          brand: "Avantiqo",
          source: `avantiqo_synthetic_intelligence_google_veo_20260822_take_${take}`,
          generator: "GOOGLE_VEO_3_1_DIRECT",
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
        provider_job_id: result?.provider_job_id || null,
        provider_status: result?.provider_status || null,
        usage_id: result?.usage?.id || null,
        credential_id: result?.credential_id || null,
        started_at: result?.started_at || null,
        pricing: result?.pricing || null,
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
          operation: "AVANTIQO_SYNTHETIC_INTELLIGENCE_GOOGLE_VEO_V1_POLL",
          brand: "Avantiqo",
          source: `avantiqo_synthetic_intelligence_google_veo_20260822_take_${take}`,
          generator: "GOOGLE_VEO_3_1_DIRECT",
          take,
          ffmpeg_used: false,
          publication_authorized: false,
        },
      });

      return json({
        success: result?.success !== false,
        pending: Boolean(result?.pending),
        failed: Boolean(result?.failed),
        provider: PROVIDER,
        model: MODEL,
        provider_job_id: providerJobId,
        provider_status: result?.provider_status || null,
        take,
        ffmpeg_used: false,
        output: result?.output || null,
        usage: result?.usage || null,
        error: result?.error || null,
      }, result?.failed ? 502 : 200);
    }

    return json({ success: false, error: "Unsupported action" }, 400);
  } catch (error) {
    return json({ success: false, error: error?.message || String(error) }, 500);
  }
}
