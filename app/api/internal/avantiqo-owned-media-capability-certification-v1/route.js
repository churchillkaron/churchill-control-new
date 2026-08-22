export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

import sharp from "sharp";
import { getServiceSupabase } from "@/lib/shared/supabase/service";

const CONTRACT = "AVANTIQO_OWNED_MEDIA_CAPABILITY_CERTIFICATION_V1";
const RUNPOD_API_BASE = "https://api.runpod.ai/v2";
const BUCKET = "creative-assets";
const supabase = getServiceSupabase();

function text(value) {
  return String(value ?? "").trim();
}

function json(data, status = 200) {
  return Response.json(data, {
    status,
    headers: { "Cache-Control": "no-store, private" },
  });
}

function commitSha() {
  return text(process.env.VERCEL_GIT_COMMIT_SHA) || "unknown-commit";
}

function basePath() {
  return `platform-certification/owned-media-capabilities/${commitSha()}`;
}

function artifactPath(label, extension) {
  const safe = text(label).replace(/[^A-Za-z0-9_-]/g, "-");
  return `${basePath()}/${safe}.${extension}`;
}

function requireToken(request) {
  const expected = text(process.env.AVANTIQO_OWNED_CERTIFICATION_TOKEN);
  if (!expected) throw new Error("AVANTIQO_OWNED_CERTIFICATION_TOKEN_REQUIRED");
  const supplied = text(
    request.headers.get("x-avantiqo-certification-token") ||
      request.headers.get("authorization")?.replace(/^Bearer\s+/i, ""),
  );
  if (!supplied || supplied !== expected) throw new Error("CERTIFICATION_UNAUTHORIZED");
}

function requireEnvironment() {
  const required = [
    "RUNPOD_API_KEY",
    "RUNPOD_AVANTIQO_IMAGE_ENDPOINT_ID",
    "RUNPOD_AVANTIQO_VIDEO_ENDPOINT_ID",
  ];
  const missing = required.filter((name) => !text(process.env[name]));
  if (missing.length) throw new Error(`CERTIFICATION_ENV_MISSING:${missing.join(",")}`);
}

async function runSync(endpointId, input, timeoutMs = 285000) {
  const started = performance.now();
  const response = await fetch(`${RUNPOD_API_BASE}/${endpointId}/runsync`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${text(process.env.RUNPOD_API_KEY)}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({ input }),
    signal: AbortSignal.timeout(timeoutMs),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`RUNPOD_HTTP_${response.status}:${text(body?.error || body?.message)}`);
  }
  if (text(body?.status).toUpperCase() !== "COMPLETED") {
    throw new Error(`RUNPOD_NOT_COMPLETED:${text(body?.status) || "UNKNOWN"}`);
  }
  return { body, wallMs: Math.round(performance.now() - started) };
}

async function uploadBytes(path, bytes, contentType) {
  const { error } = await supabase.storage.from(BUCKET).upload(path, bytes, {
    contentType,
    cacheControl: "0",
    upsert: true,
  });
  if (error) throw new Error(`CERTIFICATION_SOURCE_UPLOAD_FAILED:${error.message}`);
}

async function signedUrl(path, expiresIn = 3600) {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, expiresIn);
  if (error || !data?.signedUrl) {
    throw new Error(`CERTIFICATION_SOURCE_SIGN_FAILED:${error?.message || "NO_SIGNED_URL"}`);
  }
  return data.signedUrl;
}

async function uploadTarget(path) {
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUploadUrl(path, { upsert: true });
  if (error || !data?.signedUrl) {
    throw new Error(`CERTIFICATION_UPLOAD_TARGET_FAILED:${error?.message || "NO_SIGNED_URL"}`);
  }
  return {
    path,
    signed_url: data.signedUrl,
    storage_reference: `storage://${BUCKET}/${path}`,
  };
}

async function storedBytes(path) {
  const { data, error } = await supabase.storage.from(BUCKET).download(path);
  if (error || !data) throw new Error(`CERTIFICATION_OUTPUT_MISSING:${path}`);
  return Buffer.from(await data.arrayBuffer()).length;
}

async function createImageFixtures() {
  const sourcePath = artifactPath("image-source", "png");
  const maskPath = artifactPath("image-mask", "png");
  const source = await sharp(Buffer.from(`
    <svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024">
      <rect width="1024" height="1024" fill="#090c10"/>
      <ellipse cx="512" cy="780" rx="260" ry="72" fill="#000" opacity="0.5"/>
      <rect x="342" y="250" width="340" height="500" rx="110" fill="#121820" stroke="#87919b" stroke-width="4"/>
      <rect x="382" y="300" width="110" height="360" rx="54" fill="#dce4ea" opacity="0.12"/>
    </svg>
  `)).png().toBuffer();
  const mask = await sharp(Buffer.from(`
    <svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024">
      <rect width="1024" height="1024" fill="#000"/>
      <ellipse cx="512" cy="470" rx="120" ry="120" fill="#fff"/>
    </svg>
  `)).png().toBuffer();
  await Promise.all([
    uploadBytes(sourcePath, source, "image/png"),
    uploadBytes(maskPath, mask, "image/png"),
  ]);
  return {
    source: await signedUrl(sourcePath),
    mask: await signedUrl(maskPath),
  };
}

async function imageSample({ capability, model, sourceAssets, instruction, outputSpec, seed }) {
  const endpointId = text(process.env.RUNPOD_AVANTIQO_IMAGE_ENDPOINT_ID);
  const upload = await uploadTarget(artifactPath(`image-${capability}-${Date.now()}`, "png"));
  const { body, wallMs } = await runSync(endpointId, {
    contract: "AVANTIQO_IMAGE_ENGINE_V1",
    capability,
    organization_id: "benchmark-only",
    organization_service_id: "benchmark-only",
    usage_id: `benchmark-${capability}-${seed}`,
    instruction,
    source_assets: sourceAssets,
    structured_specification: {
      output_spec: outputSpec,
      provider_parameters: { seed, inference_steps: 28 },
    },
    storage_upload: {
      signed_url: upload.signed_url,
      storage_reference: upload.storage_reference,
    },
  });
  const output = body.output || {};
  const verifiedBytes = await storedBytes(upload.path);
  return {
    capability,
    passed:
      text(output.capability) === capability &&
      text(output.foundation_model) === model &&
      text(output.foundation_model_source) === "runpod-cache" &&
      Number(output.size_bytes) > 10000 &&
      verifiedBytes > 10000 &&
      output.raw_reasoning_persisted === false,
    model: text(output.foundation_model),
    wall_ms: wallMs,
    generation_seconds: Number(output.generation_seconds) || null,
    width: Number(output.width) || null,
    height: Number(output.height) || null,
    preservation_mode: text(output.preservation_mode) || null,
    storage_reference: upload.storage_reference,
    verified_storage_size_bytes: verifiedBytes,
  };
}

async function benchmarkImageCapabilities() {
  const fixtures = await createImageFixtures();
  const editModel = text(process.env.AVANTIQO_IMAGE_EDIT_MODEL) || "Qwen/Qwen-Image-Edit";
  const inpaintModel = text(process.env.AVANTIQO_IMAGE_INPAINT_MODEL) || "Qwen/Qwen-Image-Edit-2511";
  const outpaintModel = text(process.env.AVANTIQO_IMAGE_OUTPAINT_MODEL) || inpaintModel;
  const observations = [
    await imageSample({
      capability: "ai.image.edit",
      model: editModel,
      sourceAssets: [fixtures.source],
      instruction: "Preserve object geometry and composition. Change only the material to premium smoked glass. No text.",
      outputSpec: { width: 1024, height: 1024 },
      seed: 71001,
    }),
    await imageSample({
      capability: "ai.image.inpaint",
      model: inpaintModel,
      sourceAssets: [fixtures.source, fixtures.mask],
      instruction: "Replace only the masked region with a subtle brushed-metal emblem without lettering.",
      outputSpec: { width: 1024, height: 1024 },
      seed: 71002,
    }),
    await imageSample({
      capability: "ai.image.outpaint",
      model: outpaintModel,
      sourceAssets: [fixtures.source],
      instruction: "Extend the same premium dark studio environment naturally beyond the original frame.",
      outputSpec: { width: 1344, height: 768 },
      seed: 71003,
    }),
  ];
  return {
    passed: observations.every((item) => item.passed),
    observations,
    certification_requirements: {
      human_visual_quality_review_required: true,
      masked_region_semantic_review_required: true,
      unmasked_pixel_preservation_review_required: true,
      outpaint_seam_review_required: true,
      measured_gpu_economics_required: true,
      activation_allowed: false,
    },
  };
}

async function createCinemaSourceVideo() {
  const endpointId = text(process.env.RUNPOD_AVANTIQO_VIDEO_ENDPOINT_ID);
  const upload = await uploadTarget(artifactPath(`cinema-source-${Date.now()}`, "mp4"));
  const { body } = await runSync(endpointId, {
    contract: "AVANTIQO_SYNTHETIC_VIDEO_ENGINE_V1",
    capability: "ai.video.generate",
    organization_id: "benchmark-only",
    organization_service_id: "benchmark-only",
    usage_id: "benchmark-cinema-edit-source",
    instruction: "Cinematic two-second locked shot of a sculptural black glass object on a dark reflective plinth, subtle moving soft light, no text, no logo.",
    duration_seconds: 2,
    fps: 16,
    aspect_ratio: "16:9",
    resolution: "720p",
    seed: 72001,
    quality_profile: "cinema",
    reference_images: [],
    storage_upload: {
      signed_url: upload.signed_url,
      storage_reference: upload.storage_reference,
    },
  });
  const output = body.output || {};
  if (text(output.capability) !== "ai.video.generate" || Number(output.size_bytes) <= 10000) {
    throw new Error("CINEMA_EDIT_SOURCE_GENERATION_FAILED");
  }
  return {
    url: await signedUrl(upload.path),
    storage_reference: upload.storage_reference,
  };
}

async function benchmarkCinemaEdit() {
  const endpointId = text(process.env.RUNPOD_AVANTIQO_VIDEO_ENDPOINT_ID);
  const source = await createCinemaSourceVideo();
  const editModel = text(process.env.AVANTIQO_VIDEO_EDIT_MODEL) ||
    text(process.env.AVANTIQO_VIDEO_V2V_MODEL) ||
    "Wan-AI/Wan2.1-VACE-14B-diffusers";
  const upload = await uploadTarget(artifactPath(`cinema-edit-${Date.now()}`, "mp4"));
  const { body, wallMs } = await runSync(endpointId, {
    contract: "AVANTIQO_SYNTHETIC_VIDEO_ENGINE_V1",
    capability: "ai.video.edit",
    certification_execution: true,
    organization_id: "benchmark-only",
    organization_service_id: "benchmark-only",
    usage_id: "benchmark-cinema-edit",
    instruction: "Preserve subject identity, framing and motion. Change only environment lighting to a refined warm luxury studio look. No text, no logo.",
    duration_seconds: 2,
    fps: 16,
    aspect_ratio: "16:9",
    resolution: "720p",
    seed: 72002,
    quality_profile: "cinema",
    source_videos: [source.url],
    storage_upload: {
      signed_url: upload.signed_url,
      storage_reference: upload.storage_reference,
    },
  });
  const output = body.output || {};
  const verifiedBytes = await storedBytes(upload.path);
  const passed =
    text(output.capability) === "ai.video.edit" &&
    text(output.foundation_model) === editModel &&
    text(output.foundation_model_source) === "runpod-cache" &&
    output.source_video_conditioning === true &&
    output.certification_execution === true &&
    Number(output.frame_count) >= 17 &&
    Number(output.size_bytes) > 10000 &&
    verifiedBytes > 10000 &&
    output.raw_reasoning_persisted === false;
  return {
    passed,
    observation: {
      capability: "ai.video.edit",
      model: text(output.foundation_model),
      wall_ms: wallMs,
      generation_seconds: Number(output.generation_seconds) || null,
      frame_count: Number(output.frame_count) || null,
      width: Number(output.width) || null,
      height: Number(output.height) || null,
      source_storage_reference: source.storage_reference,
      output_storage_reference: upload.storage_reference,
      verified_storage_size_bytes: verifiedBytes,
      certification_execution: output.certification_execution === true,
    },
    certification_requirements: {
      human_visual_quality_review_required: true,
      source_identity_preservation_review_required: true,
      temporal_consistency_review_required: true,
      instruction_adherence_review_required: true,
      measured_gpu_economics_required: true,
      activation_allowed: false,
    },
  };
}

async function persistEvidence(evidence) {
  const payload = Buffer.from(`${JSON.stringify(evidence, null, 2)}\n`);
  const { error } = await supabase.storage.from(BUCKET).upload(
    `${basePath()}/evidence.json`,
    payload,
    { contentType: "application/json", cacheControl: "0", upsert: true },
  );
  if (error) throw new Error(`CERTIFICATION_EVIDENCE_PERSIST_FAILED:${error.message}`);
}

export async function GET(request) {
  try {
    requireToken(request);
    requireEnvironment();
    return json({
      contract: CONTRACT,
      commit_sha: commitSha(),
      configured: true,
      supported_checks: [
        "ai.image.edit",
        "ai.image.inpaint",
        "ai.image.outpaint",
        "ai.video.edit",
      ],
      activation_allowed: false,
    });
  } catch (error) {
    return json({ success: false, error: text(error?.message || error) }, 401);
  }
}

export async function POST(request) {
  try {
    requireToken(request);
    requireEnvironment();
    const requested = await request.json().catch(() => ({}));
    const engine = text(requested.engine || "all").toLowerCase();
    if (!["all", "image", "cinema"].includes(engine)) {
      return json({ success: false, error: "CERTIFICATION_ENGINE_INVALID" }, 400);
    }
    const evidence = {
      contract: CONTRACT,
      commit_sha: commitSha(),
      created_at: new Date().toISOString(),
      image: engine === "all" || engine === "image" ? await benchmarkImageCapabilities() : null,
      cinema: engine === "all" || engine === "cinema" ? await benchmarkCinemaEdit() : null,
      economics_certified: false,
      human_quality_certified: false,
      pricing_status: "NOT_PRODUCTION_CERTIFIED",
      activation_allowed: false,
    };
    evidence.measured_passed =
      (!evidence.image || evidence.image.passed) &&
      (!evidence.cinema || evidence.cinema.passed);
    await persistEvidence(evidence);
    return json({ success: true, ...evidence });
  } catch (error) {
    return json({ success: false, error: text(error?.message || error) }, 500);
  }
}
