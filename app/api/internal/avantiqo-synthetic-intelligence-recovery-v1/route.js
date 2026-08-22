export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

import crypto from "node:crypto";

import {
  executeService,
  settlePendingService,
} from "@/lib/platform/service-runtime/execution/ServiceExecutionRuntime";
import { getRunwayTaskStatus } from "@/lib/platform/service-runtime/providers/runway/RunwayProvider";
import { getServiceSupabase } from "@/lib/shared/supabase/service";

const TOKEN = "avq-synthetic-intelligence-recovery-20260822-v1";
const ORGANIZATION_ID = "33336a72-acb5-474e-856b-8be0269360e2";
const ENTITY_ID = "073dc5f5-b6a8-4cae-8cda-fd7acb21ef50";
const PROVIDER = "runway";
const FALLBACK_MODEL = "gen4.5";
const DURATION_SECONDS = 8;
const BUCKET = "creative-assets";
const OUTPUT_DIR = `${ORGANIZATION_ID}/avantiqo-investor-film-20260822/opening-recovery-v1`;
const RUNWAY_API_BASE = "https://api.dev.runwayml.com";
const RUNWAY_API_VERSION = "2024-11-06";

const STALLED = Object.freeze({
  "59dbab7f-5b10-4019-97b6-379ef1ad70e5": {
    usage_id: "31c34527-a8a2-4c1c-b3ed-65cb81a724d5",
    started_at: "2026-08-22T07:44:14.356Z",
    label: "omni-take-1",
  },
  "f8038ae2-1a3d-42e4-8e61-609a8654c7e3": {
    usage_id: "eced70dc-f519-4a90-806c-1c365c413ca2",
    started_at: "2026-08-22T07:53:01.732Z",
    label: "omni-take-2",
  },
  "8af63f71-c1db-4da3-96ae-219160387003": {
    usage_id: "e9baa217-558e-416e-bdad-a5862d672acf",
    started_at: "2026-08-22T07:54:12.175Z",
    label: "omni-take-3",
  },
  "7c87d5b2-6f78-4cb4-b74a-5ed2ba0701a2": {
    usage_id: "c08ccd08-1796-41da-ae94-ba29f807d5ed",
    started_at: "2026-08-22T08:16:09.435Z",
    label: "omni-recovery-misroute",
  },
});

const supabase = getServiceSupabase();

function json(data, status = 200) {
  return Response.json(data, {
    status,
    headers: { "Cache-Control": "no-store, private" },
  });
}

function text(value) {
  return String(value ?? "").trim();
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

function mediaUrlFrom(value, seen = new Set()) {
  if (!value) return null;
  if (typeof value === "string") return /^https:\/\//i.test(value) ? value : null;
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

function taskSummary(raw = {}) {
  const source = object(raw);
  const output = list(source.output);
  return {
    id: text(source.id) || null,
    status: text(source.status) || null,
    progress: source.progress ?? source.progressRatio ?? source.percentage ?? null,
    created_at: source.createdAt || source.created_at || null,
    updated_at: source.updatedAt || source.updated_at || null,
    failure_code: source.failureCode || source.failure_code || null,
    failure: source.failure || source.error || null,
    output_count: output.length,
    has_output: output.length > 0 || Boolean(mediaUrlFrom(source)),
  };
}

function runwayApiKey() {
  const key = text(process.env.RUNWAY_API_KEY || process.env.RUNWAYML_API_SECRET);
  if (!key) throw new Error("RUNWAY_CREDENTIAL_REQUIRED");
  return key;
}

async function cancelRunwayTask(jobId) {
  const response = await fetch(`${RUNWAY_API_BASE}/v1/tasks/${encodeURIComponent(jobId)}`, {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${runwayApiKey()}`,
      "X-Runway-Version": RUNWAY_API_VERSION,
    },
  });
  const rawText = await response.text();
  let payload = {};
  try { payload = rawText ? JSON.parse(rawText) : {}; } catch { payload = {}; }
  if (!response.ok) {
    throw new Error(`RUNWAY_CANCEL_FAILED:${response.status}:${text(payload?.error || payload?.message || rawText).slice(0, 300)}`);
  }
  return { status: response.status, payload: taskSummary(payload) };
}

function generationContract(take) {
  const prompt = [
    "World-class eight-second cinematic technology launch film for Avantiqo. No humans, no software UI, no logos and no voice-over.",
    "Begin almost black: restrained volumetric light awakens across smoked glass and dark platinum metal with real cinematic depth and slow parallax.",
    "Intelligence physically converges in three-dimensional space; elegant microscopic energy filaments organize with deliberate purpose, never cyberpunk or gaming.",
    "At the climax, the exact words SYNTHETIC INTELLIGENCE become the single hero object: physically dimensional premium lettering with true thickness, bevels, smoked glass, dark platinum and restrained champagne-gold edge reflections. Exact spelling only and no other readable words.",
    "Hold the title with authority, then let it elegantly collapse and dissolve into a calm near-black final frame ready for the Avantiqo reveal.",
    `Unique cinematic take ${take}. Prestige global technology launch quality. No blue tunnel, no cheap hologram, no particle storm, no glitch, no flat 2D title card, no extra text, no misspelling.`,
  ].join(" ");

  return {
    model: FALLBACK_MODEL,
    prompt,
    description: prompt,
    title: `Avantiqo Synthetic Intelligence recovery take ${take}`,
    quantity: DURATION_SECONDS,
    currency: "THB",
    generation: {
      model: FALLBACK_MODEL,
      output_spec: { duration_seconds: DURATION_SECONDS, aspect_ratio: "16:9" },
      provider_parameters: { duration: DURATION_SECONDS, aspect_ratio: "16:9" },
    },
    output_spec: { duration_seconds: DURATION_SECONDS, aspect_ratio: "16:9" },
    provider_parameters: { duration: DURATION_SECONDS, aspect_ratio: "16:9" },
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
  if (!response.ok) throw new Error(`RECOVERY_PROVIDER_VIDEO_DOWNLOAD_FAILED:${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (!bytes.length) throw new Error("RECOVERY_PROVIDER_VIDEO_EMPTY");

  const outputPath = `${OUTPUT_DIR}/synthetic-intelligence-gen45-take-${take}.mp4`;
  const { error } = await supabase.storage.from(BUCKET).upload(outputPath, bytes, {
    contentType: text(response.headers.get("content-type")) || "video/mp4",
    cacheControl: "3600",
    upsert: true,
    metadata: {
      organization_id: ORGANIZATION_ID,
      investor_film: "20260822",
      generator: "RUNWAY_GEN4_5",
      provider_job_id: providerJobId,
      take: String(take),
      generated_video_only: "true",
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

    if (action === "status") {
      const requested = text(url.searchParams.get("provider_job_id"));
      const jobIds = requested ? [requested] : Object.keys(STALLED);
      for (const jobId of jobIds) {
        if (!STALLED[jobId]) return json({ success: false, error: "JOB_NOT_ALLOWED" }, 403);
      }
      const tasks = [];
      for (const jobId of jobIds) {
        try {
          const raw = await getRunwayTaskStatus({ provider_job_id: jobId });
          tasks.push({ label: STALLED[jobId].label, ...taskSummary(raw) });
        } catch (error) {
          tasks.push({ label: STALLED[jobId].label, id: jobId, status: "STATUS_ERROR", error: error?.message || String(error) });
        }
      }
      return json({ success: true, tasks, secret_value_exposed: false });
    }

    if (action === "cancel") {
      const jobId = text(url.searchParams.get("provider_job_id"));
      if (!STALLED[jobId]) return json({ success: false, error: "JOB_NOT_ALLOWED" }, 403);
      const canceled = await cancelRunwayTask(jobId);
      return json({ success: true, provider_job_id: jobId, canceled, secret_value_exposed: false });
    }

    if (action === "start") {
      const take = Math.max(1, Math.min(9, Number(url.searchParams.get("take") || 1) || 1));
      const result = await executeService({
        organization_id: ORGANIZATION_ID,
        bill_to_organization_id: ORGANIZATION_ID,
        entity_id: ENTITY_ID,
        service_id: "ai.video.generate",
        provider_id: null,
        provider_policy: {
          allowed_providers: [PROVIDER],
          preferred_models: [FALLBACK_MODEL],
          weights: { preference: 100 },
        },
        input: generationContract(take),
        metadata: {
          module: "CREATIVE",
          operation: "AVANTIQO_SYNTHETIC_INTELLIGENCE_RECOVERY_V1",
          brand: "Avantiqo",
          source: `avantiqo_synthetic_intelligence_recovery_20260822_take_${take}`,
          generator: "RUNWAY_GEN4_5",
          take,
          generated_video_only: true,
          ffmpeg_used: false,
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
      const take = Math.max(1, Math.min(9, Number(url.searchParams.get("take") || 1) || 1));
      if (!providerJobId || !usageId) return json({ success: false, error: "Missing poll parameters" }, 400);

      const result = await settlePendingService({
        organization_id: ORGANIZATION_ID,
        provider: PROVIDER,
        provider_job_id: providerJobId,
        usage_id: usageId,
        credential_id: credentialId,
        started_at: startedAt,
        provider_status_input: { model: FALLBACK_MODEL },
        metadata: {
          module: "CREATIVE",
          operation: "AVANTIQO_SYNTHETIC_INTELLIGENCE_RECOVERY_V1_POLL",
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
          provider_task: taskSummary(result?.output || {}),
          take,
          ffmpeg_used: false,
        });
      }
      if (result?.failed || result?.success === false) {
        return json({ success: false, pending: false, failed: true, provider_status: result?.provider_status || null, error: result?.error || "Provider generation failed", take, ffmpeg_used: false }, 502);
      }

      const providerUrl = mediaUrlFrom(result?.output || result);
      if (!providerUrl) return json({ success: false, pending: false, failed: true, error: "RECOVERY_PROVIDER_VIDEO_URL_MISSING", take, ffmpeg_used: false }, 502);
      const stored = await ingestProviderVideo({ providerUrl, take, providerJobId });
      return json({ success: true, pending: false, failed: false, provider_status: result?.provider_status || "completed", provider_job_id: providerJobId, model: FALLBACK_MODEL, take, ffmpeg_used: false, ...stored });
    }

    if (action === "signed") {
      const take = Math.max(1, Math.min(9, Number(url.searchParams.get("take") || 1) || 1));
      const outputPath = `${OUTPUT_DIR}/synthetic-intelligence-gen45-take-${take}.mp4`;
      return json({ success: true, take, ffmpeg_used: false, output_path: outputPath, signed_url: await signedUrl(outputPath) });
    }

    return json({ success: false, error: "Unsupported action" }, 400);
  } catch (error) {
    return json({ success: false, error: error?.message || String(error), secret_value_exposed: false }, 500);
  }
}