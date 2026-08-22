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
import { authorizeInvestorV9Render } from "@/lib/investor-film/InvestorV9RenderAuth";

const ORG = "33336a72-acb5-474e-856b-8be0269360e2";
const ENTITY = "073dc5f5-b6a8-4cae-8cda-fd7acb21ef50";
const PROJECT = "37ca49f2-210d-4665-af6b-6b5fa834f750";
const BUCKET = "creative-assets";
const V8 = `${ORG}/${PROJECT}/spatial-master-v8-micro/chunks`;

const ASSETS = Object.freeze({
  opening_01: { path: `${V8}/chunk-01.mp4`, duration: 317 / 24 },
  opening_02: { path: `${V8}/chunk-02.mp4`, duration: 403 / 24 },
  opening_03: { path: `${V8}/chunk-03.mp4`, duration: 373 / 24 },
  business_partner: { path: `${ORG}/avantiqo-investor-film-20260821/business-partner-digital-twin-v1-922f.mp4`, duration: 922 / 24 },
  communication: { path: `${ORG}/avantiqo-investor-film-20260821/communication-intelligence-v3-911f.mp4`, duration: 911 / 24 },
  cross_domain: { path: `${ORG}/avantiqo-investor-film-20260821/cross-domain-governance-v1-1174f.mp4`, duration: 1174 / 24 },
  studio_marketing: { path: `${ORG}/avantiqo-investor-film-20260821/studio-marketing-cinema-v1-881f.mp4`, duration: 881 / 24 },
  proof_17: { path: `${V8}/chunk-17.mp4`, duration: 190 / 24 },
  strategy_18: { path: `${V8}/chunk-18.mp4`, duration: 212 / 24 },
  founder_close_19: { path: `${V8}/chunk-19.mp4`, duration: 236 / 24 },
  logo_close_20: { path: `${V8}/chunk-20.mp4`, duration: 81 / 24 },
});

const FLOORS = Object.freeze({
  overall: 95,
  identity_continuity: 98,
  anatomy_and_object_integrity: 97,
  physics_and_contact: 96,
  reflections_shadows_and_object_permanence: 96,
  camera_plausibility: 96,
  motion_cadence: 96,
  performance_authenticity: 96,
  production_design_coherence: 96,
  environmental_coherence: 96,
  generated_text_integrity: 99,
  pacing_and_transitions: 95,
  brand_truth_and_claims: 98,
  repetitive_model_signatures: 98,
  detectable_synthetic_artifacts: 98,
});

const json = (value, status = 200) => Response.json(value, { status, headers: { "Cache-Control": "no-store, private" } });

function run(command, args, timeoutMs = 60000) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      shell: false,
      stdio: ["ignore", "ignore", "pipe"],
      env: { ...process.env, OMP_NUM_THREADS: "1", OPENBLAS_NUM_THREADS: "1", MKL_NUM_THREADS: "1" },
    });
    const stderr = [];
    const timer = setTimeout(() => { child.kill("SIGKILL"); reject(new Error("V9_FINISHING_QC_TIMEOUT")); }, timeoutMs);
    child.stderr.on("data", (chunk) => stderr.push(chunk));
    child.on("error", (error) => { clearTimeout(timer); reject(error); });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) resolve();
      else reject(new Error(Buffer.concat(stderr).toString("utf8").slice(-5000) || `V9_FINISHING_QC_FFMPEG_${code}`));
    });
  });
}

async function downloadAsset(storagePath, localPath) {
  const { data, error } = await supabaseAdmin.storage.from(BUCKET).download(storagePath);
  if (error) throw error;
  if (!data) throw new Error(`V9_FINISHING_QC_ASSET_EMPTY:${storagePath}`);
  await fs.writeFile(localPath, Buffer.from(await data.arrayBuffer()));
}

function broadTimes(duration) {
  return Array.from({ length: 12 }, (_, index) => Number((((index + 1) * duration) / 13).toFixed(3)));
}

function customTimes(value, duration) {
  const requested = String(value || "").split(",").map((item) => Number(item.trim())).filter(Number.isFinite);
  return requested.filter((seconds) => seconds >= 0 && seconds < duration).slice(0, 16);
}

function temporalWindows(duration) {
  return [0.22, 0.5, 0.78].map((ratio, index) => {
    const center = duration * ratio;
    const start = Math.max(0, Math.min(duration - 0.72, center - 0.36));
    const times = [0, 0.18, 0.36, 0.54].map((offset) => Number(Math.min(duration - 0.01, start + offset).toFixed(3)));
    return { index: index + 1, start_seconds: Number(start.toFixed(3)), times };
  });
}

function labelSvg(label) {
  return Buffer.from(`<svg width="320" height="180" xmlns="http://www.w3.org/2000/svg"><rect x="8" y="148" width="304" height="24" rx="6" fill="#030306" fill-opacity=".82"/><text x="16" y="165" fill="#f3deb0" font-family="Arial" font-size="11" font-weight="700">${String(label).replace(/&/g, "&amp;").replace(/</g, "&lt;")}</text></svg>`);
}

async function extractFrame(ffmpeg, sourcePath, dir, label, seconds, index) {
  const target = path.join(dir, `frame-${index}.jpg`);
  await run(ffmpeg, [
    "-y", "-threads", "1", "-ss", String(seconds), "-i", sourcePath,
    "-frames:v", "1", "-vf", "scale=320:180:force_original_aspect_ratio=increase,crop=320:180",
    "-q:v", "2", target,
  ], 30000);
  return sharp(target).composite([{ input: labelSvg(label), top: 0, left: 0 }]).jpeg({ quality: 84, mozjpeg: true }).toBuffer();
}

async function buildForensicSheet({ ffmpeg, sourcePath, dir, assetKey, duration, requestedTimes = [] }) {
  const overviewTimes = requestedTimes.length ? requestedTimes : broadTimes(duration);
  const windows = temporalWindows(duration);
  const overview = [];
  let fileIndex = 0;
  for (const seconds of overviewTimes) {
    overview.push(await extractFrame(ffmpeg, sourcePath, dir, `${assetKey} ${seconds.toFixed(2)}s`, seconds, fileIndex++));
  }

  const strips = [];
  for (const window of windows) {
    const stripFrames = [];
    for (const seconds of window.times) {
      stripFrames.push(await extractFrame(ffmpeg, sourcePath, dir, `TEMP ${window.index} ${seconds.toFixed(2)}s`, seconds, fileIndex++));
    }
    const strip = await sharp({ create: { width: 1292, height: 180, channels: 3, background: { r: 3, g: 3, b: 7 } } })
      .composite(stripFrames.map((input, index) => ({ input, left: index * 324, top: 0 })))
      .jpeg({ quality: 86, mozjpeg: true }).toBuffer();
    strips.push(strip);
  }

  const cols = Math.min(4, overview.length);
  const rows = Math.ceil(overview.length / cols);
  const gap = 4;
  const overviewWidth = cols * 320 + (cols - 1) * gap;
  const overviewHeight = rows * 180 + (rows - 1) * gap;
  const overviewSheet = await sharp({ create: { width: overviewWidth, height: overviewHeight, channels: 3, background: { r: 3, g: 3, b: 7 } } })
    .composite(overview.map((input, index) => ({ input, left: (index % cols) * 324, top: Math.floor(index / cols) * 184 })))
    .jpeg({ quality: 86, mozjpeg: true }).toBuffer();

  const parts = [overviewSheet, ...strips];
  const metadata = await Promise.all(parts.map((part) => sharp(part).metadata()));
  const width = Math.max(...metadata.map((item) => Number(item.width || 0)));
  const heights = metadata.map((item) => Number(item.height || 0));
  const sectionGap = 12;
  const height = heights.reduce((sum, value) => sum + value, 0) + sectionGap * (parts.length - 1);
  let top = 0;
  const composites = [];
  for (let index = 0; index < parts.length; index += 1) {
    composites.push({ input: parts[index], left: 0, top });
    top += heights[index] + sectionGap;
  }
  const sheet = await sharp({ create: { width, height, channels: 3, background: { r: 2, g: 2, b: 5 } } })
    .composite(composites)
    .jpeg({ quality: 90, chromaSubsampling: "4:4:4" })
    .toBuffer();
  return { sheet, width, height, overviewTimes, windows };
}

function unwrap(value = {}) {
  let current = value?.output || value;
  const seen = new Set();
  while (current && typeof current === "object" && current.output && typeof current.output === "object" && !seen.has(current)) {
    seen.add(current);
    current = current.output;
  }
  return current || {};
}

function parseReview(value) {
  if (value && typeof value === "object" && !Array.isArray(value)) return value;
  return JSON.parse(String(value || "").replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim());
}

function reviewPrompt(assetKey) {
  return `
You are Avantiqo Creative Studio's accountable senior film finishing and VFX quality director.
Review the forensic contact sheet for the investor/promo film section "${assetKey}". The top area samples the full section. The lower three strips are adjacent-frame temporal windows and must be judged for continuity, not as isolated stills.

This film must look like a world-class high-budget technology brand film, not an AI demo. A technically valid but visibly synthetic shot FAILS.

ABSOLUTE RELEASE BLOCKERS:
- a person appears from or passes through a wall, furniture, counter, glass panel, screen, or other impossible geometry;
- an iPad, tablet, phone, laptop, utensil, glass, plate, tool, or physical object floats without believable support/contact;
- hands, faces, limbs, clothing, furniture, architecture, screens or branded objects morph, duplicate, melt, intersect or disappear unnaturally;
- unstable reflections/shadows, texture boiling, object permanence failure, rubbery motion, impossible acceleration, camera teleportation or visible frame-to-frame drift;
- generic neon sci-fi/HUD treatment, cheap hologram gimmicks, or UI that looks pasted on rather than intentionally integrated;
- generated or malformed logos/text. Brand marks and readable UI must be deterministic and exact;
- lip-sync/identity/performance that looks artificial where a speaking person is visible.

IMPORTANT DESIGN DISTINCTION: premium spatial glass/holographic UI is allowed and desirable when clearly intentional, optically coherent, physically/spatially anchored, restrained, and distinct from real hardware. A literal physical tablet/iPad floating in mid-air is NOT acceptable.

WORLD-CLASS TARGET:
- luxury graphite/titanium/black materials, restrained champagne-gold/white light;
- believable high-end cinematography, lensing, depth, reflections and practical lighting;
- future-facing but plausible environments;
- editorial cuts/match cuts/occlusion/reflection transitions rather than obvious AI morphing;
- authentic Avantiqo/product proof where UI is shown;
- every retained shot must be agency-grade. Do not average away one bad shot: weakest-link governs release.

Score 0-100 for each dimension. Floors: ${JSON.stringify(FLOORS)}.
Return STRICT JSON only:
{
  "contract":"AVANTIQO_INVESTOR_V9_FORENSIC_SECTION_REVIEW_V1",
  "asset":"${assetKey}",
  "verdict":"PASS|FAIL",
  "overall_score":0,
  "weakest_dimension":"",
  "weakest_score":0,
  "scores":{
    "identity_continuity":0,
    "anatomy_and_object_integrity":0,
    "physics_and_contact":0,
    "reflections_shadows_and_object_permanence":0,
    "camera_plausibility":0,
    "motion_cadence":0,
    "performance_authenticity":0,
    "production_design_coherence":0,
    "environmental_coherence":0,
    "generated_text_integrity":0,
    "pacing_and_transitions":0,
    "brand_truth_and_claims":0,
    "repetitive_model_signatures":0,
    "detectable_synthetic_artifacts":0
  },
  "severe_issue_detected":false,
  "impossible_human_geometry_detected":false,
  "unsupported_physical_device_detected":false,
  "visible_ai_morph_or_drift_detected":false,
  "premium_spatial_ui_used_correctly":true,
  "summary":"specific visual conclusion",
  "failures":[{"timestamp_seconds":0,"dimension":"","evidence":"","repair":""}],
  "strengths":[]
}
`;
}

function passesFloors(review) {
  if (review?.verdict !== "PASS" || review?.severe_issue_detected === true) return false;
  if (review?.impossible_human_geometry_detected === true || review?.unsupported_physical_device_detected === true || review?.visible_ai_morph_or_drift_detected === true) return false;
  if (Number(review?.overall_score) < FLOORS.overall) return false;
  return Object.entries(FLOORS).filter(([key]) => key !== "overall").every(([key, floor]) => Number(review?.scores?.[key]) >= floor);
}

export async function GET(request) {
  try {
    if (!(await authorizeInvestorV9Render(request))) return json({ success: false, error: "UNAUTHORIZED" }, 401);
    const url = new URL(request.url);
    const assetKey = String(url.searchParams.get("asset") || "").trim();
    const asset = ASSETS[assetKey];
    if (!asset) return json({ success: false, error: "ASSET_NOT_ALLOWED", allowed_assets: Object.keys(ASSETS) }, 400);
    const action = String(url.searchParams.get("action") || "sheet").toLowerCase();
    const ffmpeg = resolveCreativeFfmpegPath();
    if (!ffmpeg) throw new Error("V9_FINISHING_QC_FFMPEG_NOT_READY");
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "avantiqo-v9-finishing-qc-"));
    try {
      const sourcePath = path.join(dir, "source.mp4");
      await downloadAsset(asset.path, sourcePath);
      const requestedTimes = customTimes(url.searchParams.get("times"), asset.duration);
      const forensic = await buildForensicSheet({ ffmpeg, sourcePath, dir, assetKey, duration: asset.duration, requestedTimes });

      if (action !== "review") {
        return json({
          success: true,
          contract: "AVANTIQO_INVESTOR_V9_FINISHING_QC_V2",
          asset: assetKey,
          storage_path: asset.path,
          duration_seconds: asset.duration,
          overview_times_seconds: forensic.overviewTimes,
          temporal_windows: forensic.windows,
          width: forensic.width,
          height: forensic.height,
          jpeg_base64: forensic.sheet.toString("base64"),
        });
      }

      const evidencePath = `${ORG}/${PROJECT}/v9-finishing-qc/${assetKey}-forensic-v2.jpg`;
      const { error: uploadError } = await supabaseAdmin.storage.from(BUCKET).upload(evidencePath, forensic.sheet, {
        contentType: "image/jpeg", cacheControl: "3600", upsert: true,
      });
      if (uploadError) throw uploadError;
      const signed = await supabaseAdmin.storage.from(BUCKET).createSignedUrl(evidencePath, 3600);
      if (signed.error) throw signed.error;

      const execution = await runAIService.execute({
        organization_id: ORG,
        bill_to_organization_id: ORG,
        entity_id: ENTITY,
        service_id: "ai.image.analyze",
        provider_id: "openai",
        input: {
          capability: "ai.image.analyze",
          model: "gpt-4.1-mini",
          image: signed.data?.signedUrl,
          quantity: 1,
          prompt: reviewPrompt(assetKey),
          temperature: 0,
          max_output_tokens: 5500,
        },
        metadata: {
          module: "CREATIVE",
          operation: "AVANTIQO_INVESTOR_V9_FORENSIC_SECTION_REVIEW",
          creative_project_id: PROJECT,
          asset: assetKey,
          source_path: asset.path,
          evidence_path: evidencePath,
          evidence_contract: "AVANTIQO_INVESTOR_V9_FORENSIC_SECTION_REVIEW_V1",
        },
        category: "AI",
      });
      if (execution?.pending) throw new Error("V9_FINISHING_QC_ASYNC_NOT_SUPPORTED");
      const providerOutput = unwrap(execution);
      const raw = providerOutput?.text || providerOutput?.content || providerOutput?.result || providerOutput;
      const review = parseReview(raw);
      const releaseGatePassed = passesFloors(review);

      return json({
        success: true,
        contract: "AVANTIQO_INVESTOR_V9_FINISHING_QC_V2",
        asset: assetKey,
        release_gate_passed: releaseGatePassed,
        floors: FLOORS,
        evidence: {
          storage_path: evidencePath,
          signed_url: signed.data?.signedUrl || null,
          overview_times_seconds: forensic.overviewTimes,
          temporal_windows: forensic.windows,
        },
        provider: execution?.provider || "openai",
        model: execution?.model || "gpt-4.1-mini",
        usage_id: execution?.usage?.id || null,
        pricing: execution?.pricing || null,
        review,
        next_action: releaseGatePassed ? "KEEP_SECTION" : "REPAIR_OR_REPLACE_FAILED_WINDOWS_ONLY",
      });
    } finally {
      await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
    }
  } catch (error) {
    return json({ success: false, error: error?.message || String(error) }, 500);
  }
}
