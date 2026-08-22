export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";

import {
  executeService,
  settlePendingService,
} from "@/lib/platform/service-runtime/execution/ServiceExecutionRuntime";
import { getServiceSupabase } from "@/lib/shared/supabase/service";
import { resolveCreativeFfmpegPath } from "@/lib/creative/media/runtime/CreativeMediaBinaryRuntime";

const supabase = getServiceSupabase();

const TOKEN = "avq-synthetic-intelligence-opening-20260822-v1";
const ORGANIZATION_ID = "33336a72-acb5-474e-856b-8be0269360e2";
const ENTITY_ID = "073dc5f5-b6a8-4cae-8cda-fd7acb21ef50";
const PROVIDER = "veo";
const MODEL = "fal-ai/veo3.1/fast";
const DURATION_SECONDS = 8;
const BUCKET = "creative-assets";
const APPROVED_LOGO_PATH = `${ORGANIZATION_ID}/unassigned/df1cdd49-68e2-4a77-956e-6c9565c0074d-google-veo-6c9upygjkui2.mp4`;
const OUTPUT_DIR = `${ORGANIZATION_ID}/avantiqo-investor-film-20260822/opening-v1`;
const FINAL_PATH = `${OUTPUT_DIR}/avantiqo-synthetic-intelligence-plus-logo-16s-v1.mp4`;

function json(data, status = 200) {
  return Response.json(data, {
    status,
    headers: { "Cache-Control": "no-store, private" },
  });
}

function text(value) {
  return String(value ?? "").trim();
}

function generationContract() {
  const description =
    "Create an eight-second world-class cinematic technology launch film. Begin almost completely black. In the first two seconds, a restrained intelligent presence awakens in darkness through elegant volumetric light, microscopic energy filaments, subtle glass-and-metal reflections and controlled spatial movement. It must feel like a premium global technology brand film, not a game, not cyberpunk, not a dashboard, not a network diagram. From seconds two to five, the intelligence converges in real three-dimensional space with deep perspective, parallax, atmosphere and a slow confident camera move. Between seconds four to six, the exact words SYNTHETIC INTELLIGENCE emerge as the central hero object, physically dimensional and cinematic: polished smoked glass, dark platinum metal, subtle champagne-gold edge reflections, true thickness, bevels, realistic specular highlights, volumetric light, depth and elegant perspective. The spelling must be exactly SYNTHETIC INTELLIGENCE and there must be no other readable words, logos or symbols. Hold the title with authority for a brief moment. From seconds six to eight, the title disintegrates or collapses elegantly into a narrow field of light and darkness so the final frame is clean, dark and calm, ready for a direct cut into an existing Avantiqo logo film. The overall feeling is luxury automotive launch film, prestige cinema title design and next-generation intelligence. Extremely restrained, expensive, sophisticated and believable. No humans. No screens. No Churchill branding. No restaurant imagery. No generic corporate footage. No fake UI. No neon tunnel. No explosive particle storm. No glitch text. No spelling errors. No extra typography. No voice-over.";

  return {
    model: MODEL,
    title: "Avantiqo investor film — Synthetic Intelligence awakening",
    description,
    intent: {
      story_purpose: "announce a new category before the Avantiqo identity reveal",
      emotional_tone: "powerful, intelligent, luxurious, cinematic, restrained",
      title_text: "SYNTHETIC INTELLIGENCE",
    },
    requirements: {
      visual_quality: "world-class feature-film and luxury technology launch quality",
      dimensionality: "true 3D/5D spatial depth, material thickness, parallax, reflections and volumetric light",
      camera_language: "slow controlled cinematic push with subtle opposing parallax; no shake",
      typography: "exactly SYNTHETIC INTELLIGENCE, physically dimensional, centered and premium",
      palette: "near-black, smoked glass, dark platinum, restrained champagne-gold edge light",
      negative_constraints: [
        "no Churchill",
        "no restaurant",
        "no people",
        "no dashboard",
        "no UI",
        "no diagrams",
        "no cyberpunk neon",
        "no gaming aesthetic",
        "no cheap hologram",
        "no glitch typography",
        "no extra words",
        "no misspelling",
        "no flat 2D title card",
        "no image slideshow"
      ],
    },
    generation: {
      model: MODEL,
      provider_parameters: {
        duration: "8s",
        aspect_ratio: "16:9",
        resolution: "1080p",
        generate_audio: false,
        auto_fix: false,
        safety_tolerance: "4",
      },
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
      duration: "8s",
      aspect_ratio: "16:9",
      resolution: "1080p",
      generate_audio: false,
      auto_fix: false,
      safety_tolerance: "4",
    },
  };
}

async function signedUrl(storagePath, seconds = 86400) {
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(storagePath, seconds);
  if (error) throw error;
  return data?.signedUrl || null;
}

async function download(storagePath, localPath) {
  const { data, error } = await supabase.storage.from(BUCKET).download(storagePath);
  if (error) throw error;
  if (!data) throw new Error(`SYNTHETIC_OPENING_SOURCE_EMPTY:${storagePath}`);
  await fs.writeFile(localPath, Buffer.from(await data.arrayBuffer()));
}

async function run(command, args, timeoutMs = 285000) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      shell: false,
      stdio: ["ignore", "ignore", "pipe"],
      env: { ...process.env, OMP_NUM_THREADS: "1" },
    });
    const stderr = [];
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error("SYNTHETIC_OPENING_FFMPEG_TIMEOUT"));
    }, timeoutMs);
    child.stderr.on("data", (chunk) => stderr.push(chunk));
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        reject(new Error(Buffer.concat(stderr).toString("utf8").slice(-12000) || `FFMPEG_EXIT_${code}`));
        return;
      }
      resolve();
    });
  });
}

async function assemble(generatedPath) {
  if (!generatedPath.startsWith(`${ORGANIZATION_ID}/`) || generatedPath.includes("..")) {
    throw new Error("SYNTHETIC_OPENING_GENERATED_PATH_INVALID");
  }

  const ffmpeg = resolveCreativeFfmpegPath();
  if (!ffmpeg) throw new Error("CREATIVE_MEDIA_FFMPEG_NOT_READY");

  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "avantiqo-synthetic-opening-"));
  try {
    const generated = path.join(directory, "synthetic.mp4");
    const logo = path.join(directory, "approved-logo.mp4");
    const normalizedGenerated = path.join(directory, "synthetic-normalized.mp4");
    const normalizedLogo = path.join(directory, "logo-normalized.mp4");
    const concatFile = path.join(directory, "concat.txt");
    const final = path.join(directory, "opening-16s.mp4");

    await Promise.all([
      download(generatedPath, generated),
      download(APPROVED_LOGO_PATH, logo),
    ]);

    const normalize = async (source, output) => {
      await run(ffmpeg, [
        "-y",
        "-i", source,
        "-t", "8",
        "-an",
        "-vf", "scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080,fps=24,format=yuv420p",
        "-c:v", "libx264",
        "-preset", "veryfast",
        "-crf", "17",
        "-r", "24",
        "-movflags", "+faststart",
        output,
      ]);
    };

    await normalize(generated, normalizedGenerated);
    await normalize(logo, normalizedLogo);

    await fs.writeFile(
      concatFile,
      `file '${normalizedGenerated.replace(/'/g, "'\\''")}'\nfile '${normalizedLogo.replace(/'/g, "'\\''")}'\n`,
      "utf8",
    );

    await run(ffmpeg, [
      "-y",
      "-f", "concat",
      "-safe", "0",
      "-i", concatFile,
      "-an",
      "-c", "copy",
      "-movflags", "+faststart",
      final,
    ]);

    const bytes = await fs.readFile(final);
    const { error } = await supabase.storage.from(BUCKET).upload(FINAL_PATH, bytes, {
      contentType: "video/mp4",
      cacheControl: "3600",
      upsert: true,
      metadata: {
        organization_id: ORGANIZATION_ID,
        investor_film: "20260822",
        opening_version: "synthetic-intelligence-v1",
        approved_logo_unchanged: "true",
      },
    });
    if (error) throw error;

    return {
      output_path: FINAL_PATH,
      signed_url: await signedUrl(FINAL_PATH),
      bytes: bytes.length,
      sha256: crypto.createHash("sha256").update(bytes).digest("hex"),
      duration_seconds: 16,
    };
  } finally {
    await fs.rm(directory, { recursive: true, force: true }).catch(() => {});
  }
}

export async function GET(request) {
  try {
    const url = new URL(request.url);
    if (url.searchParams.get("token") !== TOKEN) return json({ success: false }, 404);
    const action = text(url.searchParams.get("action") || "status").toLowerCase();

    if (action === "status") {
      return json({
        success: true,
        provider: PROVIDER,
        model: MODEL,
        duration_seconds: DURATION_SECONDS,
        approved_logo_path: APPROVED_LOGO_PATH,
        final_path: FINAL_PATH,
      });
    }

    if (action === "start") {
      const contract = generationContract();
      const result = await executeService({
        organization_id: ORGANIZATION_ID,
        bill_to_organization_id: ORGANIZATION_ID,
        entity_id: ENTITY_ID,
        service_id: "ai.video.generate",
        provider_id: PROVIDER,
        provider_policy: {
          allowed_providers: [PROVIDER],
          preferred_providers: [PROVIDER],
        },
        input: {
          ...contract,
          quantity: DURATION_SECONDS,
          currency: "THB",
        },
        metadata: {
          module: "CREATIVE",
          operation: "AVANTIQO_SYNTHETIC_INTELLIGENCE_OPENING_V1",
          brand: "Avantiqo",
          source: "avantiqo_synthetic_intelligence_opening_20260822_v1",
          generated_video_only: true,
          churchill_allowed: false,
          approved_logo_unchanged: true,
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
        output: result?.output || null,
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
        metadata: {
          module: "CREATIVE",
          operation: "AVANTIQO_SYNTHETIC_INTELLIGENCE_OPENING_V1_POLL",
          brand: "Avantiqo",
          source: "avantiqo_synthetic_intelligence_opening_20260822_v1",
        },
      });

      const generatedPath = text(
        result?.output?.raw?.output?.storage_path ||
        result?.output?.raw?.storage_path ||
        result?.output?.storage_path,
      ) || null;

      return json({
        success: result?.success !== false,
        pending: result?.pending ?? null,
        failed: result?.failed ?? null,
        provider_status: result?.provider_status || null,
        generated_path: generatedPath,
        result,
      });
    }

    if (action === "assemble") {
      const generatedPath = text(url.searchParams.get("generated_path"));
      if (!generatedPath) return json({ success: false, error: "generated_path required" }, 400);
      return json({ success: true, ...(await assemble(generatedPath)) });
    }

    if (action === "signed") {
      return json({ success: true, signed_url: await signedUrl(FINAL_PATH), path: FINAL_PATH });
    }

    return json({ success: false, error: "Unsupported action" }, 400);
  } catch (error) {
    return json({ success: false, error: error?.message || String(error) }, 500);
  }
}
