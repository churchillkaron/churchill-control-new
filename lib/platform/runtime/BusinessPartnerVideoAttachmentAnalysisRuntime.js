import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import ffmpegStatic from "ffmpeg-static";

import { getServiceSupabase } from "@/lib/shared/supabase/service";
import {
  executeService,
  settlePendingService,
} from "@/lib/platform/service-runtime/execution/ServiceExecutionRuntime";

import {
  AVANTIQO_ATTACHMENT_ANALYSIS_VERSION,
} from "@/lib/platform/runtime/ConversationAttachmentAnalysisContract";

const FRAME_LIMIT = 6;
const MAX_WAIT_MS = 90_000;
const POLL_MS = 1500;
const supabaseAdmin = getServiceSupabase();

function text(value, maximum = 120000) {
  return String(value ?? "").trim().slice(0, maximum);
}
function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}
function list(value) { return Array.isArray(value) ? value : []; }
function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }
function safe(value) {
  return text(value, 200).replace(/[^A-Za-z0-9._-]+/g, "-") || "video";
}
function runProcess(command, args, timeoutMs = 45000) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { shell: false, stdio: ["ignore", "pipe", "pipe"] });
    const stdout = [];
    const stderr = [];
    const timer = setTimeout(() => child.kill("SIGKILL"), timeoutMs);
    child.stdout.on("data", (chunk) => stdout.push(chunk));
    child.stderr.on("data", (chunk) => stderr.push(chunk));
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      const output = { stdout: Buffer.concat(stdout).toString("utf8"), stderr: Buffer.concat(stderr).toString("utf8") };
      if (code === 0) resolve(output);
      else reject(new Error(output.stderr || `VIDEO_ANALYSIS_FFMPEG_EXIT_${code}`));
    });
  });
}

async function settle(initial, context) {
  if (!initial?.pending) return initial;
  const deadline = Date.now() + MAX_WAIT_MS;
  let current = initial;
  while (Date.now() < deadline) {
    await sleep(POLL_MS);
    current = await settlePendingService({
      organization_id: context.organizationId,
      provider: current.provider,
      provider_job_id: current.provider_job_id || current.output?.provider_job_id,
      usage_id: current.usage?.id,
      pricing: current.pricing || {},
      credential_id: current.credential_id || null,
      started_at: current.started_at || null,
      provider_status_input: { model: current.model || null },
      metadata: { module: "OPERATOR", operation: "BUSINESS_PARTNER_VIDEO_ANALYSIS_POLL" },
    });
    if (!current?.pending) return current;
  }
  throw new Error("BUSINESS_PARTNER_VIDEO_ANALYSIS_TIMEOUT");
}

function findText(value, depth = 0) {
  if (depth > 6 || value == null) return "";
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    for (const item of value) { const found = findText(item, depth + 1); if (found) return found; }
    return "";
  }
  if (typeof value !== "object") return "";
  for (const key of ["text", "output_text", "content", "message"]) {
    if (typeof value[key] === "string" && value[key].trim()) return value[key];
  }
  for (const key of ["output", "result", "data", "response", "raw"]) {
    const found = findText(value[key], depth + 1); if (found) return found;
  }
  return "";
}
function parseJson(value) {
  const source = text(value).replace(/^\uFEFF/, "");
  if (!source) return null;
  const first = source.indexOf("{");
  const last = source.lastIndexOf("}");
  const candidate = first >= 0 && last > first ? source.slice(first, last + 1) : source;
  try { return object(JSON.parse(candidate)); } catch { return null; }
}

async function downloadVideo(file, directory) {
  const response = await fetch(file.url, { cache: "no-store" });
  if (!response.ok) throw new Error(`VIDEO_ATTACHMENT_DOWNLOAD_FAILED:${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (!bytes.length) throw new Error("VIDEO_ATTACHMENT_EMPTY");
  const ext = path.extname(text(file.name, 240)) || ".mp4";
  const filePath = path.join(directory, `source${ext}`);
  await fs.writeFile(filePath, bytes);
  return filePath;
}

async function extractFrames(inputPath, directory) {
  const ffmpegPath = text(process.env.CREATIVE_MEDIA_FFMPEG_PATH, 1000) || ffmpegStatic;
  if (!ffmpegPath) throw new Error("VIDEO_ANALYSIS_FFMPEG_REQUIRED");
  const outputPattern = path.join(directory, "frame-%02d.jpg");
  await runProcess(ffmpegPath, [
    "-hide_banner", "-loglevel", "error", "-i", inputPath,
    "-vf", "thumbnail=48,scale=w='min(1280,iw)':h=-2",
    "-frames:v", String(FRAME_LIMIT), "-q:v", "3", outputPattern,
  ]);
  const files = (await fs.readdir(directory)).filter((name) => /^frame-\d+\.jpg$/i.test(name)).sort();
  return files.slice(0, FRAME_LIMIT).map((name) => path.join(directory, name));
}
async function temporaryFrameUrls({ organizationId, sha256, framePaths }) {
  const bucket = "uploads";
  const created = [];
  for (const [index, framePath] of framePaths.entries()) {
    const storagePath = [
      "operator-video-analysis",
      safe(organizationId),
      safe(sha256 || "no-sha"),
      `${Date.now()}-${index + 1}-${crypto.randomUUID()}.jpg`,
    ].join("/");
    const buffer = await fs.readFile(framePath);
    const { error: uploadError } = await supabaseAdmin.storage
      .from(bucket)
      .upload(storagePath, buffer, { contentType: "image/jpeg", upsert: false, cacheControl: "900" });
    if (uploadError) throw uploadError;
    const { data, error } = await supabaseAdmin.storage.from(bucket).createSignedUrl(storagePath, 15 * 60);
    if (error || !data?.signedUrl) throw error || new Error("VIDEO_ANALYSIS_FRAME_SIGNED_URL_REQUIRED");
    created.push({ bucket, storagePath, url: data.signedUrl });
  }
  return created;
}

async function cleanupFrames(created = []) {
  const grouped = new Map();
  for (const item of created) {
    if (!grouped.has(item.bucket)) grouped.set(item.bucket, []);
    grouped.get(item.bucket).push(item.storagePath);
  }
  for (const [bucket, paths] of grouped) {
    await supabaseAdmin.storage.from(bucket).remove(paths).catch(() => null);
  }
}
async function analyzeFrames({ frameUrls, file, context }) {
  const execution = await executeService({
    organization_id: context.organizationId,
    party_id: context.partyId || null,
    entity_id: context.entityId || null,
    service_id: "ai.image.analyze",
    capability: "ai.image.analyze",
    input: {
      capability: "ai.image.analyze",
      instruction: [
        "Analyze these representative frames as one video sequence.",
        "Return strict JSON with visual_summary, visible_text, people_and_roles, places, objects, actions, brand_or_asset_clues, safety_or_damage_clues, confidence.",
        "Describe only visible evidence. Do not infer identity, ownership, business meaning, or chronology beyond the supplied frame order.",
      ].join(" "),
      source_assets: frameUrls,
      quantity: frameUrls.length,
    },
    category: "BUSINESS_PARTNER_ATTACHMENT_ANALYSIS",
    provider_policy: { owned_only_required: true, external_provider_fallback_allowed: false },
    metadata: {
      module: "OPERATOR", operation: "CONVERSATION_ATTACHMENT_VIDEO_FRAME_ANALYSIS",
      attachment_name: file.name, attachment_sha256: file.sha256, authorization_effect: "NONE",
    },
  });
  const settled = await settle(execution, context);
  if (settled?.failed) throw new Error(settled.error || "VIDEO_FRAME_ANALYSIS_FAILED");
  const parsed = parseJson(findText(settled)) || object(settled?.output?.result || settled?.output?.output?.result);
  if (!Object.keys(parsed).length) throw new Error("VIDEO_FRAME_ANALYSIS_JSON_REQUIRED");
  return parsed;
}
async function extractAudioUpload(inputPath, directory) {
  const ffmpegPath = text(process.env.CREATIVE_MEDIA_FFMPEG_PATH, 1000) || ffmpegStatic;
  if (!ffmpegPath) return null;
  const audioPath = path.join(directory, "speech.wav");
  try {
    await runProcess(ffmpegPath, [
      "-hide_banner", "-loglevel", "error", "-i", inputPath,
      "-vn", "-ac", "1", "-ar", "16000", "-c:a", "pcm_s16le", audioPath,
    ]);
  } catch {
    return null;
  }
  const bytes = await fs.readFile(audioPath).catch(() => null);
  if (!bytes?.length) return null;
  return {
    name: "video-audio.wav",
    type: "audio/wav",
    size: bytes.length,
    async arrayBuffer() {
      return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    },
  };
}

async function transcribeAudio({ upload, file, context }) {
  if (!upload) return null;
  const execution = await executeService({
    organization_id: context.organizationId,
    party_id: context.partyId || null,
    entity_id: context.entityId || null,
    service_id: "ai.speech.to.text",
    capability: "ai.speech.to.text",
    input: { file: upload, file_name: upload.name, mime_type: upload.type, quantity: 1 },
    category: "BUSINESS_PARTNER_ATTACHMENT_ANALYSIS",
    provider_policy: { owned_only_required: true, external_provider_fallback_allowed: false },
    metadata: {
      module: "OPERATOR", operation: "CONVERSATION_ATTACHMENT_VIDEO_TRANSCRIPTION",
      attachment_name: file.name, attachment_sha256: file.sha256, authorization_effect: "NONE",
    },
  });
  const settled = await settle(execution, context);
  if (settled?.failed) return null;
  return text(findText(settled), 60000) || null;
}
async function mergeVideoEvidence({ visualEvidence, transcript, file, context }) {
  const prompt = [
    "Analyze this video only from the supplied owned visual and transcript evidence.",
    "Return one strict JSON object with: object_type, document_type, confidence, candidate_domains, key_fields, parties, dates, amounts, currency, identifiers, asset_details, duplicate_hints, clarification_required, clarification_question, video_summary.",
    "candidate_domains may include Finance, Supply Chain, People, Projects, Operations, Commercial, Documents, Creative, Administration, Compliance.",
    "For invoices and receipts, preserve visible supplier/customer identity, invoice_or_receipt_number, transaction_date, due_date, payment_status (PAID, UNPAID, UNKNOWN), payment_method, payment_reference, subtotal, tax_amount, total_amount, currency, and line_items when present. Never infer PAID merely because the document is called a receipt.",
    "Do not infer identity, ownership, location, transaction, or business purpose unless supported by the evidence. If multiple destinations remain plausible, set clarification_required=true and ask one short business question.",
    `VISUAL_EVIDENCE=${JSON.stringify(visualEvidence).slice(0, 30000)}`,
    `TRANSCRIPT=${text(transcript, 30000) || "none"}`,
  ].join("\n");
  const execution = await executeService({
    organization_id: context.organizationId,
    party_id: context.partyId || null,
    entity_id: context.entityId || null,
    service_id: "ai.text.generate",
    capability: "ai.text.generate",
    input: { prompt, max_output_tokens: 800, response_format: { type: "json_object" } },
    category: "BUSINESS_PARTNER_ATTACHMENT_ANALYSIS",
    provider_policy: { owned_only_required: true, external_provider_fallback_allowed: false },
    metadata: {
      module: "OPERATOR", operation: "CONVERSATION_ATTACHMENT_VIDEO_SEMANTIC_ANALYSIS",
      attachment_name: file.name, attachment_sha256: file.sha256, authorization_effect: "NONE",
    },
  });
  const settled = await settle(execution, context);
  if (settled?.failed) throw new Error(settled.error || "VIDEO_SEMANTIC_ANALYSIS_FAILED");
  const parsed = parseJson(findText(settled));
  if (!parsed || !Object.keys(parsed).length) throw new Error("VIDEO_SEMANTIC_ANALYSIS_JSON_REQUIRED");
  return parsed;
}
export async function analyzeBusinessPartnerVideoAttachment({ file = {}, context = {} } = {}) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "avantiqo-bp-video-"));
  let temporaryFrames = [];
  try {
    const inputPath = await downloadVideo(file, directory);
    const framePaths = await extractFrames(inputPath, directory);
    if (!framePaths.length) throw new Error("VIDEO_ANALYSIS_NO_REPRESENTATIVE_FRAMES");
    temporaryFrames = await temporaryFrameUrls({
      organizationId: context.organizationId,
      sha256: file.sha256,
      framePaths,
    });
    const visualEvidence = await analyzeFrames({
      frameUrls: temporaryFrames.map((item) => item.url),
      file,
      context,
    });
    const audioUpload = await extractAudioUpload(inputPath, directory);
    const transcript = await transcribeAudio({ upload: audioUpload, file, context });
    const evidence = await mergeVideoEvidence({ visualEvidence, transcript, file, context });
    return {
      ...file,
      analysis: {
        status: "ANALYZED",
        analysis_version: AVANTIQO_ATTACHMENT_ANALYSIS_VERSION,
        confidence: Number(evidence.confidence) || 0,
        candidate_domains: list(evidence.candidate_domains),
        evidence,
        requires_content_analysis: false,
        clarification_required: evidence.clarification_required === true,
        clarification_question: text(evidence.clarification_question, 700) || null,
        provider: "avantiqo-owned-media-pipeline",
        capability: "ai.video.analyze",
        perception_capabilities: ["ai.image.analyze", ...(transcript ? ["ai.speech.to.text"] : []), "ai.text.generate"],
        representative_frame_count: temporaryFrames.length,
        transcript_available: Boolean(transcript),
        authorization_effect: "NONE",
      },
    };
  } finally {
    await cleanupFrames(temporaryFrames);
    await fs.rm(directory, { recursive: true, force: true }).catch(() => null);
  }
}

export default analyzeBusinessPartnerVideoAttachment;
