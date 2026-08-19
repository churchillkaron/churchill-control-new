export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

import fs from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";

import sharp from "sharp";

import { executeService } from "@/lib/platform/service-runtime/execution/ServiceExecutionRuntime";
import { materializeMedia } from "@/lib/creative/media/runtime/CreativeMediaInspectionRuntime";
import { resolveCreativeFfmpegPath } from "@/lib/creative/media/runtime/CreativeMediaBinaryRuntime";
import { uploadCreativeAsset } from "@/lib/creative/assets/storage/uploadCreativeAsset";

const ORGANIZATION_ID = "33336a72-acb5-474e-856b-8be0269360e2";
const ENTITY_ID = "073dc5f5-b6a8-4cae-8cda-fd7acb21ef50";
const TOKEN = "avq-livefilm-20260818-b9c17e4a";

const SHOT_01_VIDEO = "storage://creative-assets/33336a72-acb5-474e-856b-8be0269360e2/unassigned/861ad08e-d788-46f4-8077-3894a3d83aa2-avantiqo-investor-manager-8755f761-d2f3-4e0f-9132-c018d3d13acb.mp4";
const CONTINUITY_FRAME_SECOND = 4.55;

const SHOT = {
  title: "Avantiqo investor film — Shot 02 continuity replacement — Fragmented Systems",
  description:
    "Continue directly from the supplied approved final continuity frame of Shot 01. The supplied frame is the exact environment, operator, desk, lighting, wardrobe, camera position and production design that must continue into this shot. Do not redesign, relocate, restyle or reinterpret the office. Do not change the operator's identity, apparent age, hair, wardrobe or body proportions. Begin from the exact supplied frame and continue the same physical scene naturally. The operator is seated at the same desk. He looks from the laptop to the smartphone in his hand, briefly checks a second information source beside the laptop such as a restrained printed operational note or existing secondary device, then returns attention to the laptop while still holding the phone. His movements are efficient and slightly quicker than before, communicating that he is manually reconciling disconnected business information. Keep the camera in the same visual axis and continue the restrained slow push already established in Shot 01. The visual message is that the human operator is the integration layer between separate systems. No dialogue, no generated voice-over, no music; preserve natural office ambience and restrained device sounds only.",
  intent: {
    story_purpose:
      "Make fragmented systems visually explicit without breaking continuity from Shot 01.",
    emotional_tone:
      "premium, intelligent, operationally credible, calm but increasingly interrupted",
    story_state_change:
      "the operator actively compares separate information sources himself",
  },
  continuity: {
    source: "SHOT_01_APPROVED_FINAL_FRAME",
    immutable:
      "operator identity, office architecture, desk geometry, background operation, lighting, wardrobe, lens feel and camera axis",
    camera:
      "continue the same restrained push and perspective from the supplied frame; no reset to a different angle or different room",
  },
  requirements: {
    visual_quality:
      "world-class photoreal premium enterprise technology film with feature-film restraint",
    realism:
      "natural human movement, realistic anatomy and physics, exact continuity with the supplied frame",
    action:
      "laptop to phone to second information source and back to laptop while still holding phone",
    screen_policy:
      "Every visible phone, tablet, laptop or monitor remains deep charcoal to near-black with subtle low-contrast placeholder blocks only. No white interface, no bright browser page, no readable generated software text, no invented logos, no colorful generic dashboard and no fake Avantiqo UI.",
    audio_policy:
      "preserve natural office ambience and restrained device sounds only; no dialogue, no voice-over, no music",
    negative_constraints: [
      "no environment change",
      "no office redesign",
      "no different actor",
      "no wardrobe change",
      "no camera-axis reset",
      "no fake software interface",
      "no white screens",
      "no readable generated UI text",
      "no invented logos",
      "no floating graphics",
      "no sci-fi holograms",
      "no exaggerated frustration",
      "no warped hands",
      "no distorted devices",
      "no synthetic skin",
      "no text overlays"
    ],
  },
  editorial: {
    voiceover_reference:
      "Sales in one place. Operations in another. Finance somewhere else.",
    visual_message:
      "the owner is manually connecting the company",
  },
  output_spec: {
    duration_seconds: 5,
    aspect_ratio: "16:9",
  },
};

function json(data, status = 200) {
  return Response.json(data, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

function runFfmpeg(binary, args) {
  const result = spawnSync(binary, args, {
    encoding: "utf8",
    maxBuffer: 20 * 1024 * 1024,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`SHOT_02_CONTINUITY_FRAME_EXTRACTION_FAILED:${String(result.stderr || result.status).trim()}`);
  }
}

async function buildContinuityFrame() {
  const materialized = await materializeMedia({
    url: SHOT_01_VIDEO,
    organization_id: ORGANIZATION_ID,
    policy: {
      max_bytes: 250 * 1024 * 1024,
      timeout_ms: 120000,
      max_redirects: 5,
    },
  });

  try {
    const ffmpeg = resolveCreativeFfmpegPath();
    if (!ffmpeg) throw new Error("SHOT_02_CONTINUITY_FFMPEG_NOT_CONFIGURED");

    const outputPath = path.join(
      path.dirname(materialized.file_path),
      "avantiqo-investor-shot-01-continuity.jpg",
    );

    runFfmpeg(ffmpeg, [
      "-y",
      "-loglevel", "error",
      "-ss", String(CONTINUITY_FRAME_SECOND),
      "-i", materialized.file_path,
      "-frames:v", "1",
      "-q:v", "2",
      outputPath,
    ]);

    const normalized = await sharp(outputPath, { failOn: "error" })
      .rotate()
      .jpeg({ quality: 92, chromaSubsampling: "4:4:4" })
      .toBuffer();

    if (!normalized.length) {
      throw new Error("SHOT_02_CONTINUITY_FRAME_EMPTY");
    }

    return uploadCreativeAsset({
      file: {
        buffer: normalized,
        name: "avantiqo-investor-shot-01-continuity.jpg",
        type: "image/jpeg",
      },
      organizationId: ORGANIZATION_ID,
      uploadedBy: null,
    });
  } finally {
    await materialized.cleanup();
  }
}

export async function GET(request) {
  try {
    const url = new URL(request.url);
    if (url.searchParams.get("token") !== TOKEN) {
      return json({ success: false }, 404);
    }

    const frame = await buildContinuityFrame();

    const result = await executeService({
      organization_id: ORGANIZATION_ID,
      bill_to_organization_id: ORGANIZATION_ID,
      entity_id: ENTITY_ID,
      service_id: "ai.video.generate",
      provider_id: "gemini",
      input: {
        ...SHOT,
        quantity: SHOT.output_spec.duration_seconds,
        currency: "THB",
        provider_parameters: {
          aspect_ratio: "16:9",
          visual_derived_frame_approved: true,
          visual_derived_frame_url: frame.file_url,
          visual_derived_frame_review_task_id: "USER_APPROVED_SHOT_01_CONTINUITY_20260819",
        },
      },
      metadata: {
        module: "CREATIVE",
        operation: "AVANTIQO_INVESTOR_FILM_SHOT_02_CONTINUITY",
        brand: "Avantiqo",
        source: "avantiqo_investor_film_shot_02_continuity_20260819_v1",
        continuity_source_storage: SHOT_01_VIDEO,
        continuity_frame_second: CONTINUITY_FRAME_SECOND,
        continuity_frame_storage: frame.file_url,
      },
      category: "AI",
    });

    const output = result?.output || null;
    const providerOutput = output?.output || {};

    return json({
      success: true,
      shot: "02-continuity",
      title: SHOT.title,
      continuity_frame: {
        file_url: frame.file_url,
        inspection_url: frame.inspection_url,
        inspection_url_expires_in_seconds: frame.inspection_url_expires_in_seconds,
        source_second: CONTINUITY_FRAME_SECOND,
      },
      pending: result?.pending ?? null,
      provider: result?.provider || null,
      model: result?.model || null,
      provider_job_id: result?.provider_job_id || null,
      provider_status: result?.provider_status || null,
      interaction_id:
        result?.interaction_id ||
        output?.interaction_id ||
        providerOutput?.interaction_id ||
        null,
      usage_id: result?.usage?.id || null,
      pricing: result?.pricing || null,
      started_at: result?.started_at || null,
      output,
    });
  } catch (error) {
    return json(
      {
        success: false,
        error: error?.message || String(error),
      },
      500,
    );
  }
}
