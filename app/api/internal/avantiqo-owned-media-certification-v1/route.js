export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

import sharp from "sharp";

import { getServiceSupabase } from "@/lib/shared/supabase/service";

const CONTRACT = "AVANTIQO_OWNED_MEDIA_VERCEL_CERTIFICATION_V1";
const TOKEN = process.env.AVANTIQO_OWNED_CERTIFICATION_TOKEN || "avq-owned-cert-vercel-v1-20260823-a6e1f71c";
const RUNPOD_API_BASE = "https://api.runpod.ai/v2";
const BUCKET = "creative-assets";
const supabase = getServiceSupabase();

const ENGINE_CONFIG = Object.freeze({
  image: Object.freeze({
    required_env: Object.freeze([
      "RUNPOD_API_KEY",
      "RUNPOD_AVANTIQO_IMAGE_ENDPOINT_ID",
    ]),
  }),
  cinema: Object.freeze({
    required_env: Object.freeze([
      "RUNPOD_API_KEY",
      "RUNPOD_AVANTIQO_VIDEO_ENDPOINT_ID",
    ]),
  }),
});

function text(value) {
  return String(value ?? "").trim();
}

function json(data, status = 200) {
  return Response.json(data, {
    status,
    headers: { "Cache-Control": "no-store, private" },
  });
}

function percentile(values, fraction) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return null;
  return sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * fraction))];
}

function commitSha() {
  return text(process.env.VERCEL_GIT_COMMIT_SHA) || "unknown-commit";
}

function evidenceBase() {
  return `platform-certification/owned-media/${commitSha()}`;
}

function evidencePath(engine) {
  return `${evidenceBase()}/${engine}.json`;
}

function lockPath(engine) {
  return `${evidenceBase()}/${engine}.lock.json`;
}

function artifactPath(engine, label, extension) {
  const safeLabel = text(label).replace(/[^A-Za-z0-9_-]/g, "-");
  return `${evidenceBase()}/${engine}-${safeLabel}.${extension}`;
}

function configuration(engine) {
  const definition = ENGINE_CONFIG[engine];
  const presence = Object.fromEntries(
    definition.required_env.map((name) => [name, Boolean(text(process.env[name]))]),
  );
  const missing = Object.entries(presence)
    .filter(([, configured]) => !configured)
    .map(([name]) => name);
  return {
    engine,
    configured: missing.length === 0,
    presence,
    missing,
  };
}

function safeError(error) {
  let message = text(error?.message || error).slice(0, 1000);
  const apiKey = text(process.env.RUNPOD_API_KEY);
  if (apiKey) message = message.replaceAll(apiKey, "[REDACTED]");
  return message || "UNKNOWN_CERTIFICATION_ERROR";
}

async function readCachedEvidence(engine) {
  try {
    const { data, error } = await supabase.storage.from(BUCKET).download(evidencePath(engine));
    if (error || !data) return null;
    return JSON.parse(await data.text());
  } catch {
    return null;
  }
}

async function acquireLock(engine) {
  const payload = Buffer.from(JSON.stringify({
    contract: CONTRACT,
    engine,
    commit_sha: commitSha(),
    started_at: new Date().toISOString(),
  }));
  const { error } = await supabase.storage.from(BUCKET).upload(lockPath(engine), payload, {
    contentType: "application/json",
    cacheControl: "0",
    upsert: false,
  });
  return !error;
}

async function persistEvidence(engine, evidence) {
  const payload = Buffer.from(`${JSON.stringify(evidence, null, 2)}\n`);
  const { error } = await supabase.storage.from(BUCKET).upload(evidencePath(engine), payload, {
    contentType: "application/json",
    cacheControl: "0",
    upsert: true,
  });
  if (error) throw new Error(`MEDIA_CERTIFICATION_EVIDENCE_PERSIST_FAILED:${error.message}`);
}

async function createUploadTarget(path) {
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUploadUrl(path, { upsert: true });
  if (error || !data?.signedUrl) {
    throw new Error(`MEDIA_CERTIFICATION_UPLOAD_TICKET_FAILED:${error?.message || "NO_SIGNED_URL"}`);
  }
  return {
    path,
    signed_url: data.signedUrl,
    storage_reference: `storage://${BUCKET}/${path}`,
  };
}

async function storedBytes(path) {
  const { data, error } = await supabase.storage.from(BUCKET).download(path);
  if (error || !data) {
    throw new Error(`MEDIA_CERTIFICATION_OUTPUT_MISSING:${error?.message || "NO_FILE"}`);
  }
  return Buffer.from(await data.arrayBuffer()).length;
}

async function runSync(endpointId, input, timeoutMs = 285000) {
  const apiKey = text(process.env.RUNPOD_API_KEY);
  const started = performance.now();
  const response = await fetch(`${RUNPOD_API_BASE}/${endpointId}/runsync`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({ input }),
    signal: AbortSignal.timeout(timeoutMs),
  });
  const body = await response.json().catch(() => ({}));
  const wallMs = Math.round(performance.now() - started);
  if (!response.ok) {
    throw new Error(`RUNPOD_HTTP_${response.status}:${text(body?.error || body?.message)}`);
  }
  if (text(body?.status).toUpperCase() !== "COMPLETED") {
    throw new Error(`RUNPOD_NOT_COMPLETED:${text(body?.status) || "UNKNOWN"}`);
  }
  return { body, wallMs };
}

async function runImageBenchmark() {
  const endpointId = text(process.env.RUNPOD_AVANTIQO_IMAGE_ENDPOINT_ID);
  const model = text(process.env.AVANTIQO_IMAGE_FOUNDATION_MODEL) || "Qwen/Qwen-Image";
  const upload = await createUploadTarget(artifactPath("image", `generated-${Date.now()}`, "png"));
  const { body, wallMs } = await runSync(endpointId, {
    contract: "AVANTIQO_IMAGE_ENGINE_V1",
    capability: "ai.image.generate",
    foundation_model: model,
    organization_id: "benchmark-only",
    organization_service_id: "benchmark-only",
    usage_id: "benchmark-image-vercel",
    instruction: "Premium cinematic product photograph of a sculptural black glass object on a dark reflective surface, precise studio lighting, realistic material detail, no text, no logo.",
    structured_specification: {
      output_spec: { aspect_ratio: "1:1" },
      provider_parameters: {
        seed: 51001,
        inference_steps: 28,
        guidance_scale: 4.0,
      },
    },
    storage_upload: {
      signed_url: upload.signed_url,
      storage_reference: upload.storage_reference,
    },
  });

  const output = body.output || {};
  const verifiedBytes = await storedBytes(upload.path);
  const passed =
    text(output.capability) === "ai.image.generate" &&
    text(output.foundation_model) === model &&
    Number(output.width) === 1024 &&
    Number(output.height) === 1024 &&
    Number(output.size_bytes) > 10000 &&
    verifiedBytes > 10000 &&
    output.raw_reasoning_persisted === false;

  return {
    passed,
    status: passed ? "MEASURED_PENDING_CERTIFICATION" : "BENCHMARK_FAILED",
    model: {
      provider: "avantiqo-image",
      foundation_model: model,
      capability: "ai.image.generate",
    },
    summary: {
      runs: 1,
      wall_ms: wallMs,
      worker_generation_seconds: Number(output.generation_seconds) || null,
      width: Number(output.width) || null,
      height: Number(output.height) || null,
      reported_size_bytes: Number(output.size_bytes) || null,
      verified_storage_size_bytes: verifiedBytes,
    },
    benchmark_media: {
      storage_reference: upload.storage_reference,
      mime_type: "image/png",
    },
    certification_requirements: {
      human_visual_quality_review_required: true,
      measured_gpu_economics_required: true,
      image_edit_certified: false,
      inpaint_certified: false,
      outpaint_certified: false,
      upscale_certified: false,
    },
  };
}

async function createCinemaSourceImage() {
  const sourcePath = artifactPath("cinema", "i2v-source", "png");
  const svg = Buffer.from(`
    <svg xmlns="http://www.w3.org/2000/svg" width="1280" height="704" viewBox="0 0 1280 704">
      <defs>
        <radialGradient id="glow" cx="50%" cy="44%" r="60%">
          <stop offset="0" stop-color="#c7d3df" stop-opacity="0.72"/>
          <stop offset="0.35" stop-color="#566270" stop-opacity="0.24"/>
          <stop offset="1" stop-color="#05070a" stop-opacity="0"/>
        </radialGradient>
        <linearGradient id="floor" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#171b20"/>
          <stop offset="1" stop-color="#030405"/>
        </linearGradient>
      </defs>
      <rect width="1280" height="704" fill="#05070a"/>
      <rect width="1280" height="704" fill="url(#glow)"/>
      <path d="M0 510 L1280 470 L1280 704 L0 704 Z" fill="url(#floor)"/>
      <ellipse cx="640" cy="542" rx="250" ry="42" fill="#000" opacity="0.55"/>
      <path d="M520 500 C520 358 570 244 640 222 C710 244 760 358 760 500 C700 540 580 540 520 500 Z" fill="#11161d" stroke="#6c7886" stroke-width="3"/>
      <path d="M552 478 C560 356 594 278 640 260 C686 278 720 356 728 478 C678 504 602 504 552 478 Z" fill="#27303a" opacity="0.72"/>
      <ellipse cx="610" cy="330" rx="34" ry="86" fill="#d9e2ea" opacity="0.18"/>
    </svg>
  `);
  const png = await sharp(svg).png().toBuffer();
  const { error: uploadError } = await supabase.storage.from(BUCKET).upload(sourcePath, png, {
    contentType: "image/png",
    cacheControl: "0",
    upsert: true,
  });
  if (uploadError) {
    throw new Error(`CINEMA_CERTIFICATION_SOURCE_UPLOAD_FAILED:${uploadError.message}`);
  }
  const { data: signed, error: signError } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(sourcePath, 3600);
  if (signError || !signed?.signedUrl) {
    throw new Error(`CINEMA_CERTIFICATION_SOURCE_SIGN_FAILED:${signError?.message || "NO_SIGNED_URL"}`);
  }
  return {
    path: sourcePath,
    signed_url: signed.signedUrl,
    storage_reference: `storage://${BUCKET}/${sourcePath}`,
    byte_length: png.length,
  };
}

async function runCinemaBenchmark() {
  const endpointId = text(process.env.RUNPOD_AVANTIQO_VIDEO_ENDPOINT_ID);
  const genericModel = text(process.env.AVANTIQO_VIDEO_FOUNDATION_MODEL);
  const t2vModel = text(process.env.AVANTIQO_VIDEO_T2V_MODEL) || genericModel || "Wan-AI/Wan2.2-T2V-A14B-Diffusers";
  const i2vModel = text(process.env.AVANTIQO_VIDEO_I2V_MODEL) || genericModel || "Wan-AI/Wan2.2-I2V-A14B-Diffusers";
  const source = await createCinemaSourceImage();
  const observations = [];

  const samples = [
    {
      mode: "t2v",
      capability: "ai.video.generate",
      foundation_model: t2vModel,
      instruction: "Cinematic slow dolly through a refined dark architectural space, soft volumetric light, physically realistic materials, subtle motion, no text, no logo.",
      references: [],
      seed: 62001,
    },
    {
      mode: "i2v",
      capability: "ai.video.image_to_video",
      foundation_model: i2vModel,
      instruction: "Preserve the reference composition and object identity. Add a subtle cinematic camera push, natural parallax and physically plausible light movement. No redesign, no text.",
      references: [source.signed_url],
      seed: 62002,
    },
  ];

  for (const sample of samples) {
    const upload = await createUploadTarget(
      artifactPath("cinema", `${sample.mode}-${Date.now()}`, "mp4"),
    );
    const { body, wallMs } = await runSync(endpointId, {
      contract: "AVANTIQO_SYNTHETIC_VIDEO_ENGINE_V1",
      capability: sample.capability,
      foundation_model: sample.foundation_model,
      organization_id: "benchmark-only",
      organization_service_id: "benchmark-only",
      usage_id: `benchmark-cinema-${sample.mode}-vercel`,
      instruction: sample.instruction,
      duration_seconds: 2,
      fps: 16,
      aspect_ratio: "16:9",
      resolution: "720p",
      seed: sample.seed,
      quality_profile: "cinema",
      reference_images: sample.references,
      storage_upload: {
        signed_url: upload.signed_url,
        storage_reference: upload.storage_reference,
      },
    });
    const output = body.output || {};
    const verifiedBytes = await storedBytes(upload.path);
    observations.push({
      mode: sample.mode,
      capability: sample.capability,
      foundation_model: text(output.foundation_model),
      wall_ms: wallMs,
      worker_generation_seconds: Number(output.generation_seconds) || null,
      duration_seconds: Number(output.duration_seconds) || null,
      fps: Number(output.fps) || null,
      frame_count: Number(output.frame_count) || null,
      width: Number(output.width) || null,
      height: Number(output.height) || null,
      reported_size_bytes: Number(output.size_bytes) || null,
      verified_storage_size_bytes: verifiedBytes,
      storage_reference: upload.storage_reference,
      passed:
        text(output.capability) === sample.capability &&
        text(output.foundation_model) === sample.foundation_model &&
        Number(output.width) === 1280 &&
        Number(output.height) === 704 &&
        Number(output.size_bytes) > 10000 &&
        verifiedBytes > 10000 &&
        Number(output.frame_count) >= 17 &&
        output.raw_reasoning_persisted === false,
    });
  }

  const wall = observations.map((item) => item.wall_ms);
  const passed = observations.length === 2 && observations.every((item) => item.passed);
  return {
    passed,
    status: passed ? "MEASURED_PENDING_CERTIFICATION" : "BENCHMARK_FAILED",
    models: {
      t2v: t2vModel,
      i2v: i2vModel,
    },
    summary: {
      runs: observations.length,
      t2v_passed: Boolean(observations.find((item) => item.mode === "t2v")?.passed),
      i2v_passed: Boolean(observations.find((item) => item.mode === "i2v")?.passed),
      p50_wall_ms: percentile(wall, 0.5),
      p95_wall_ms: percentile(wall, 0.95),
    },
    source_media: {
      storage_reference: source.storage_reference,
      byte_length: source.byte_length,
      generated_locally: true,
      provider_called: false,
    },
    observations,
    certification_requirements: {
      human_visual_quality_review_required: true,
      identity_preservation_review_required: true,
      measured_gpu_economics_required: true,
      video_to_video_certified: false,
      video_edit_certified: false,
      lipsync_certified: false,
    },
  };
}

async function runEngine(engine) {
  if (engine === "image") return runImageBenchmark();
  if (engine === "cinema") return runCinemaBenchmark();
  throw new Error(`MEDIA_CERTIFICATION_ENGINE_UNSUPPORTED:${engine}`);
}

export async function GET(request) {
  const url = new URL(request.url);
  if (!TOKEN || url.searchParams.get("token") !== TOKEN) {
    return json({ success: false }, 404);
  }

  const action = text(url.searchParams.get("action")) || "readiness";
  const engine = text(url.searchParams.get("engine")).toLowerCase();

  if (action === "readiness") {
    return json({
      success: true,
      contract: CONTRACT,
      execution_environment: "VERCEL_RUNTIME_ENV_ONLY",
      commit_sha: commitSha(),
      engines: Object.keys(ENGINE_CONFIG).map(configuration),
      benchmark_upload_urls_from_environment_required: false,
      cinema_source_url_from_environment_required: false,
      secrets_exported: false,
      github_secrets_required: false,
      activation_allowed: false,
      pricing_activation_performed: false,
      provider_selection_changed: false,
    });
  }

  if (!ENGINE_CONFIG[engine]) {
    return json({ success: false, error: "ENGINE_REQUIRED" }, 400);
  }

  const cached = await readCachedEvidence(engine);
  if (cached) {
    return json({ success: true, cached: true, evidence: cached });
  }

  if (action === "cached") {
    return json({ success: true, cached: false, engine, evidence: null });
  }

  if (action !== "run") {
    return json({ success: false, error: "ACTION_UNSUPPORTED" }, 400);
  }

  const config = configuration(engine);
  if (!config.configured) {
    return json({
      success: true,
      cached: false,
      evidence: {
        contract: CONTRACT,
        engine,
        commit_sha: commitSha(),
        status: "BLOCKED",
        passed: false,
        blockers: config.missing.map((name) => `${name}_NOT_CONFIGURED_IN_VERCEL`),
        activation_allowed: false,
      },
    });
  }

  const locked = await acquireLock(engine);
  if (!locked) {
    const afterLockEvidence = await readCachedEvidence(engine);
    if (afterLockEvidence) {
      return json({ success: true, cached: true, evidence: afterLockEvidence });
    }
    return json({
      success: false,
      engine,
      status: "IN_PROGRESS_OR_PREVIOUS_ATTEMPT_LOCKED",
      activation_allowed: false,
    }, 409);
  }

  let measured;
  try {
    measured = await runEngine(engine);
  } catch (error) {
    measured = {
      passed: false,
      status: "BENCHMARK_FAILED",
      error: safeError(error),
    };
  }

  const evidence = {
    contract: CONTRACT,
    generated_at: new Date().toISOString(),
    execution_environment: "VERCEL_RUNTIME_ENV_ONLY",
    engine,
    commit_sha: commitSha(),
    ...measured,
    benchmark_certified: measured.passed === true,
    economics_certified: false,
    human_quality_certified: false,
    pricing_status: "NOT_PRODUCTION_CERTIFIED",
    secrets_exported: false,
    github_secrets_required: false,
    activation_allowed: false,
    pricing_activation_performed: false,
    provider_selection_changed: false,
    production_deploy_performed_by_certification: false,
  };

  await persistEvidence(engine, evidence);
  return json({ success: true, cached: false, evidence });
}
