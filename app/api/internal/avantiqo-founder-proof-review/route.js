export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import sharp from "sharp";

import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { runAIService } from "@/lib/platform/service-runtime/ai";
import { resolveCreativeFfmpegPath } from "@/lib/creative/media/runtime/CreativeMediaBinaryRuntime";

const ORGANIZATION_ID = "33336a72-acb5-474e-856b-8be0269360e2";
const ENTITY_ID = "073dc5f5-b6a8-4cae-8cda-fd7acb21ef50";
const TOKEN = "avq-founder-proof-review-20260819";
const BUCKET = "creative-assets";
const REFERENCE_PATH =
  "33336a72-acb5-474e-856b-8be0269360e2/unassigned/ca19f771-e2ad-4e62-ac50-19ff8efed996-avantiqo-founder-speaking-keyframe.jpg";
const PROOF_PATH =
  "33336a72-acb5-474e-856b-8be0269360e2/unassigned/31f8a88b-c15c-45c9-a60f-fbf9935a0aba-google-veo-i65zy6cjbtbq.mp4";
const FRAME_TIMES = [0.2, 1.35, 2.55, 3.8, 5.2, 6.8];

function json(data, status = 200) {
  return Response.json(data, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

function run(command, args, timeoutMs = 120000) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      shell: false,
      stdio: ["ignore", "ignore", "pipe"],
    });
    const stderr = [];
    let settled = false;
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      if (!settled) {
        settled = true;
        reject(new Error("FOUNDER_PROOF_FRAME_EXTRACTION_TIMEOUT"));
      }
    }, timeoutMs);
    child.stderr.on("data", (chunk) => stderr.push(chunk));
    child.on("error", (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (code !== 0) {
        reject(new Error(
          Buffer.concat(stderr).toString("utf8") ||
          `FOUNDER_PROOF_FRAME_EXTRACTION_EXIT_${code}`,
        ));
        return;
      }
      resolve();
    });
  });
}

async function download(storagePath, localPath) {
  const { data, error } = await supabaseAdmin.storage
    .from(BUCKET)
    .download(storagePath);
  if (error) throw error;
  if (!data) throw new Error(`FOUNDER_PROOF_DOWNLOAD_EMPTY:${storagePath}`);
  await fs.writeFile(localPath, Buffer.from(await data.arrayBuffer()));
}

async function makeContactSheet({ ffmpeg, directory }) {
  const referencePath = path.join(directory, "reference.jpg");
  const videoPath = path.join(directory, "proof.mp4");
  await download(REFERENCE_PATH, referencePath);
  await download(PROOF_PATH, videoPath);

  const framePaths = [];
  for (const [index, seconds] of FRAME_TIMES.entries()) {
    const framePath = path.join(directory, `frame-${index + 1}.jpg`);
    await run(ffmpeg, [
      "-y",
      "-ss", String(seconds),
      "-i", videoPath,
      "-frames:v", "1",
      "-q:v", "2",
      framePath,
    ]);
    framePaths.push(framePath);
  }

  const width = 1600;
  const height = 720;
  const referenceWidth = 460;
  const frameWidth = 360;
  const frameHeight = 203;
  const gutter = 18;
  const startX = referenceWidth + 28;
  const startY = 112;

  const reference = await sharp(referencePath, { failOn: "none" })
    .rotate()
    .resize(referenceWidth, height, {
      fit: "cover",
      position: "attention",
    })
    .jpeg({ quality: 91 })
    .toBuffer();

  const composites = [{ input: reference, left: 0, top: 0 }];
  for (const [index, framePath] of framePaths.entries()) {
    const frame = await sharp(framePath, { failOn: "none" })
      .rotate()
      .resize(frameWidth, frameHeight, {
        fit: "cover",
        position: "attention",
      })
      .jpeg({ quality: 90 })
      .toBuffer();
    const column = index % 3;
    const row = Math.floor(index / 3);
    composites.push({
      input: frame,
      left: startX + column * (frameWidth + gutter),
      top: startY + row * (frameHeight + gutter),
    });
  }

  const labels = `
    <svg width="${width}" height="${height}">
      <style>
        .title { fill: #f7f3ec; font: 700 28px Arial, sans-serif; }
        .small { fill: #d7d0c5; font: 600 18px Arial, sans-serif; }
        .num { fill: #ffffff; font: 700 18px Arial, sans-serif; }
      </style>
      <rect width="100%" height="100%" fill="#050608"/>
      <text x="24" y="42" class="title">APPROVED FOUNDER REFERENCE</text>
      <text x="${startX}" y="42" class="title">VEO 3.1 MOTION PROOF — SAMPLED FRAMES</text>
      ${FRAME_TIMES.map((seconds, index) => {
        const column = index % 3;
        const row = Math.floor(index / 3);
        const x = startX + column * (frameWidth + gutter) + 10;
        const y = startY + row * (frameHeight + gutter) + 26;
        return `<text x="${x}" y="${y}" class="num">${index + 1} · ${seconds.toFixed(2)}s</text>`;
      }).join("\n")}
      <text x="${startX}" y="690" class="small">Judge only visible identity continuity, motion quality, anatomy, mouth visibility and cinematic usability.</text>
    </svg>`;

  const outputPath = path.join(directory, "founder-proof-contact-sheet.jpg");
  await sharp({
    create: {
      width,
      height,
      channels: 3,
      background: "#050608",
    },
  })
    .composite([
      ...composites,
      { input: Buffer.from(labels), left: 0, top: 0 },
    ])
    .jpeg({ quality: 92, mozjpeg: true })
    .toFile(outputPath);

  return outputPath;
}

function unwrap(value = {}) {
  let current = value?.output || value;
  const seen = new Set();
  while (
    current &&
    typeof current === "object" &&
    current.output &&
    typeof current.output === "object" &&
    !seen.has(current)
  ) {
    seen.add(current);
    current = current.output;
  }
  return current || {};
}

function parseReview(value) {
  if (value && typeof value === "object" && !Array.isArray(value)) return value;
  const source = String(value || "")
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();
  return JSON.parse(source);
}

function reviewPrompt() {
  return `
You are the Avantiqo Creative Studio senior film dailies reviewer.
The LEFT image is the approved founder identity reference. The SIX numbered images on the RIGHT are sampled frames from one generated Google Veo 3.1 motion proof.
Do not identify the person by name. Compare visual identity only.

This is a release gate, not encouragement. A weak or uncertain result must FAIL.

Judge:
1. whether the same adult person from the approved reference is preserved in every sampled frame,
2. facial geometry, head shape, hairline, facial hair, skin tone, apparent age and body proportions,
3. whether identity drifts between sampled frames,
4. natural anatomy, hands, shoulders, neck and facial structure,
5. motion/performance plausibility inferred from frame progression,
6. clear unobstructed mouth/lower face for later exact lip sync,
7. premium cinematic usability and absence of obvious synthetic artifacts.

Release thresholds:
- identity_match_score >= 92
- identity_consistency_score >= 92
- anatomy_integrity_score >= 90
- mouth_visibility_score >= 92
- cinematic_quality_score >= 86
- synthetic_artifact_score >= 90, where 100 means artifact-free
- no severe issue may be present

Return STRICT JSON only:
{
  "contract":"AVANTIQO_FOUNDER_VEO_IDENTITY_PROOF_REVIEW_V1",
  "verdict":"PASS|FAIL",
  "identity_match_score":0,
  "identity_consistency_score":0,
  "anatomy_integrity_score":0,
  "motion_plausibility_score":0,
  "mouth_visibility_score":0,
  "cinematic_quality_score":0,
  "synthetic_artifact_score":0,
  "same_person_all_sampled_frames":true,
  "identity_drift_detected":false,
  "severe_issue_detected":false,
  "summary":"specific visible conclusion",
  "evidence":[],
  "issues":[],
  "repair_instructions":[]
}
`;
}

export async function GET(request) {
  const url = new URL(request.url);
  if (url.searchParams.get("token") !== TOKEN) {
    return json({ success: false }, 404);
  }

  const ffmpeg = resolveCreativeFfmpegPath();
  if (!ffmpeg) {
    return json({ success: false, error: "FFMPEG_NOT_READY" }, 503);
  }

  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "avantiqo-founder-proof-review-"));
  try {
    const contactSheet = await makeContactSheet({ ffmpeg, directory });
    const bytes = await fs.readFile(contactSheet);
    const storagePath = `${ORGANIZATION_ID}/founder-proof-review/20260819/founder-opening-veo-contact-sheet.jpg`;
    const { error: uploadError } = await supabaseAdmin.storage
      .from(BUCKET)
      .upload(storagePath, bytes, {
        contentType: "image/jpeg",
        cacheControl: "3600",
        upsert: true,
      });
    if (uploadError) throw uploadError;

    const { data: signed, error: signError } = await supabaseAdmin.storage
      .from(BUCKET)
      .createSignedUrl(storagePath, 3600);
    if (signError) throw signError;

    const execution = await runAIService.execute({
      organization_id: ORGANIZATION_ID,
      bill_to_organization_id: ORGANIZATION_ID,
      entity_id: ENTITY_ID,
      service_id: "ai.image.analyze",
      provider_id: "openai",
      input: {
        capability: "ai.image.analyze",
        model: "gpt-4.1-mini",
        image: signed?.signedUrl,
        quantity: 1,
        prompt: reviewPrompt(),
        temperature: 0,
        max_output_tokens: 3500,
      },
      metadata: {
        module: "CREATIVE",
        operation: "AVANTIQO_FOUNDER_VEO_IDENTITY_PROOF_REVIEW",
        brand: "Avantiqo",
        source: "avantiqo_founder_film_first_frame_v4_20260819",
        founder_reference_path: REFERENCE_PATH,
        proof_video_path: PROOF_PATH,
        evidence_path: storagePath,
      },
      category: "AI",
    });

    if (execution?.pending) {
      throw new Error("FOUNDER_PROOF_REVIEW_ASYNC_NOT_SUPPORTED");
    }

    const providerOutput = unwrap(execution);
    const raw =
      providerOutput?.text ||
      providerOutput?.content ||
      providerOutput?.result ||
      providerOutput;
    const review = parseReview(raw);

    const thresholdsPassed =
      review?.verdict === "PASS" &&
      Number(review.identity_match_score) >= 92 &&
      Number(review.identity_consistency_score) >= 92 &&
      Number(review.anatomy_integrity_score) >= 90 &&
      Number(review.mouth_visibility_score) >= 92 &&
      Number(review.cinematic_quality_score) >= 86 &&
      Number(review.synthetic_artifact_score) >= 90 &&
      review.same_person_all_sampled_frames === true &&
      review.identity_drift_detected !== true &&
      review.severe_issue_detected !== true;

    return json({
      success: true,
      release_gate_passed: thresholdsPassed,
      provider: execution?.provider || "openai",
      model: execution?.model || "gpt-4.1-mini",
      usage_id: execution?.usage?.id || null,
      pricing: execution?.pricing || null,
      evidence: {
        storage_path: storagePath,
        signed_url: signed?.signedUrl || null,
        frame_times_seconds: FRAME_TIMES,
      },
      review,
      next_action: thresholdsPassed
        ? "GENERATE_REMAINING_FOUNDER_MOTION_PLATES"
        : "REPAIR_OPENING_PROOF_ONLY",
    });
  } catch (error) {
    return json({
      success: false,
      error: error?.message || String(error),
    }, 500);
  } finally {
    await fs.rm(directory, { recursive: true, force: true }).catch(() => {});
  }
}
