export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

import "@/lib/platform/service-runtime/providers/gemini/ManagedGeminiCredentialRegistration.js";

import { resolveProviderCredential } from "@/lib/platform/service-runtime/providers/ProviderCredentialRuntime";
import { getServiceSupabase } from "@/lib/shared/supabase/service";

const TOKEN = "avq-synthetic-intelligence-google-veo-20260822-v1";
const ORGANIZATION_ID = "33336a72-acb5-474e-856b-8be0269360e2";
const PROVIDER = "google-veo";
const MODEL = "veo-3.1-generate-preview";
const DURATION_SECONDS = 8;
const API_BASE = "https://generativelanguage.googleapis.com/v1beta";
const JOB_PREFIX = "google-veo-opening:v1:";
const BUCKET = "creative-assets";
const OUTPUT_DIR = `${ORGANIZATION_ID}/avantiqo-investor-film-20260822/google-veo-opening-v1`;

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

function promptForTake(take = 1) {
  return [
    "Create an eight-second world-class cinematic technology launch film announcing a new category called SYNTHETIC INTELLIGENCE.",
    `Creative take ${take}: use a distinct premium composition and camera path.`,
    "0.0-2.0 seconds: begin almost completely black. A restrained intelligent presence awakens through elegant volumetric light, microscopic energy filaments, smoked-glass reflections and dark-platinum depth. Real cinematic parallax, expensive optics, controlled movement.",
    "2.0-4.8 seconds: intelligence converges physically in deep three-dimensional space. The camera makes a slow confident push while dark platinum matter, glass and light organize with deliberate purpose.",
    "4.8-6.6 seconds: the exact words SYNTHETIC INTELLIGENCE become the hero object. Physically dimensional lettering with true thickness and bevels, polished smoked glass, dark platinum metal, restrained champagne-gold edge reflections, realistic specular highlights and volumetric depth. Exact spelling only. No other readable words or logos. Hold with authority.",
    "6.6-8.0 seconds: the dimensional title elegantly collapses, dissolves or disassembles back into darkness and a narrow controlled field of light. End on a calm black frame ready for the Avantiqo reveal.",
    "Overall feeling: global luxury technology launch, prestige cinema title design, powerful, intelligent, sophisticated, believable, restrained and expensive.",
    "ABSOLUTE NEGATIVES: no humans, no Churchill, no restaurant, no screens, no dashboards, no software UI, no network diagram, no data globe, no cyberpunk neon, no gaming aesthetic, no cheap hologram, no blue sci-fi tunnel, no particle explosion, no glitch typography, no additional text, no misspelling, no flat 2D title card, no slideshow, no voice-over.",
  ].join("\n\n");
}

async function googleApiKey() {
  const credential = await resolveProviderCredential({
    organization_id: ORGANIZATION_ID,
    provider: PROVIDER,
  });
  const key = text(credential?.api_key);
  if (!key) throw new Error("GOOGLE_VEO_MANAGED_CREDENTIAL_REQUIRED");
  return {
    key,
    credential_id: credential?.credential_id || null,
  };
}

async function requestJson(url, key, options = {}) {
  const response = await fetch(url, {
    ...options,
    cache: "no-store",
    headers: {
      "x-goog-api-key": key,
      Accept: "application/json",
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(options.headers || {}),
    },
  });
  const raw = await response.text();
  let result = {};
  if (raw) {
    try { result = JSON.parse(raw); } catch { result = {}; }
  }
  if (!response.ok) {
    const message = text(result?.error?.message || result?.message || raw || response.statusText);
    throw new Error(`GOOGLE_VEO_API_ERROR:${response.status}:${message.slice(0, 500)}`);
  }
  return result;
}

function encodeJob(operationName) {
  const name = text(operationName);
  if (!name) throw new Error("GOOGLE_VEO_OPERATION_NAME_REQUIRED");
  return `${JOB_PREFIX}${Buffer.from(name, "utf8").toString("base64url")}`;
}

function decodeJob(jobId) {
  const value = text(jobId);
  if (!value.startsWith(JOB_PREFIX)) throw new Error("GOOGLE_VEO_JOB_ID_INVALID");
  const name = Buffer.from(value.slice(JOB_PREFIX.length), "base64url").toString("utf8");
  if (!name || name.includes("..")) throw new Error("GOOGLE_VEO_OPERATION_NAME_INVALID");
  return name;
}

function generatedVideoUri(result = {}) {
  const sample = result?.response?.generateVideoResponse?.generatedSamples?.[0];
  return text(
    sample?.video?.uri ||
    sample?.uri ||
    result?.response?.generatedVideos?.[0]?.video?.uri,
  ) || null;
}

function filteredReason(result = {}) {
  const response = result?.response?.generateVideoResponse || {};
  const reasons = Array.isArray(response.raiMediaFilteredReasons)
    ? response.raiMediaFilteredReasons.map(text).filter(Boolean)
    : [];
  return reasons[0] || null;
}

function trustedGoogleUrl(value) {
  const parsed = new URL(value);
  const host = parsed.hostname.toLowerCase();
  if (parsed.protocol !== "https:") throw new Error("GOOGLE_VEO_DOWNLOAD_PROTOCOL_INVALID");
  if (!(
    host === "generativelanguage.googleapis.com" ||
    host.endsWith(".googleapis.com") ||
    host.endsWith(".googleusercontent.com")
  )) {
    throw new Error("GOOGLE_VEO_DOWNLOAD_HOST_INVALID");
  }
  return parsed;
}

async function downloadVideo(uri, key) {
  let current = trustedGoogleUrl(uri);
  for (let redirect = 0; redirect <= 3; redirect += 1) {
    const includeKey = current.hostname.toLowerCase().endsWith("googleapis.com");
    const response = await fetch(current, {
      method: "GET",
      cache: "no-store",
      redirect: "manual",
      headers: includeKey ? { "x-goog-api-key": key } : {},
    });
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location || redirect === 3) throw new Error("GOOGLE_VEO_DOWNLOAD_REDIRECT_INVALID");
      current = trustedGoogleUrl(new URL(location, current).toString());
      continue;
    }
    if (!response.ok) throw new Error(`GOOGLE_VEO_DOWNLOAD_FAILED:${response.status}`);
    const bytes = Buffer.from(await response.arrayBuffer());
    if (!bytes.length) throw new Error("GOOGLE_VEO_OUTPUT_EMPTY");
    return bytes;
  }
  throw new Error("GOOGLE_VEO_DOWNLOAD_REDIRECT_LIMIT");
}

async function persistVideo(bytes, take, providerJobId) {
  const outputPath = `${OUTPUT_DIR}/synthetic-intelligence-google-veo-take-${take}.mp4`;
  const { error } = await supabase.storage.from(BUCKET).upload(outputPath, bytes, {
    contentType: "video/mp4",
    cacheControl: "3600",
    upsert: true,
    metadata: {
      organization_id: ORGANIZATION_ID,
      investor_film: "20260822",
      generator: "GOOGLE_VEO_3_1_DIRECT",
      model: MODEL,
      provider_job_id: providerJobId,
      take: String(take),
      generated_video_only: "true",
      ffmpeg_used: "false",
      publication_authorized: "false",
    },
  });
  if (error) throw error;
  const signed = await supabase.storage.from(BUCKET).createSignedUrl(outputPath, 86400);
  if (signed.error) throw signed.error;
  return {
    output_path: outputPath,
    signed_url: signed.data?.signedUrl || null,
    bytes: bytes.length,
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
        mode: "DIRECT_GOOGLE_VEO_MANAGED_CREDENTIAL_AI_VIDEO_ONLY",
        invalid_person_generation_parameter_removed: true,
        ffmpeg_used: false,
      });
    }

    if (action === "start") {
      const credential = await googleApiKey();
      const result = await requestJson(
        `${API_BASE}/models/${encodeURIComponent(MODEL)}:predictLongRunning`,
        credential.key,
        {
          method: "POST",
          body: JSON.stringify({
            instances: [{ prompt: promptForTake(take) }],
            parameters: {
              durationSeconds: DURATION_SECONDS,
              aspectRatio: "16:9",
              resolution: "1080p",
            },
          }),
        },
      );
      const operationName = text(result?.name);
      if (!operationName) throw new Error("GOOGLE_VEO_OPERATION_NAME_REQUIRED");
      return json({
        success: true,
        pending: true,
        provider: PROVIDER,
        model: MODEL,
        provider_job_id: encodeJob(operationName),
        provider_operation_name: operationName,
        provider_status: "processing",
        credential_id: credential.credential_id,
        take,
        ffmpeg_used: false,
      });
    }

    if (action === "poll") {
      const providerJobId = text(url.searchParams.get("provider_job_id"));
      if (!providerJobId) return json({ success: false, error: "Missing provider_job_id" }, 400);
      const operationName = decodeJob(providerJobId);
      const credential = await googleApiKey();
      const result = await requestJson(`${API_BASE}/${operationName}`, credential.key, { method: "GET" });

      if (result?.error) {
        return json({
          success: false,
          pending: false,
          failed: true,
          provider: PROVIDER,
          model: MODEL,
          provider_job_id: providerJobId,
          provider_status: "failed",
          error: text(result?.error?.message || result?.error),
          take,
          ffmpeg_used: false,
        }, 502);
      }

      if (result?.done !== true) {
        return json({
          success: true,
          pending: true,
          failed: false,
          provider: PROVIDER,
          model: MODEL,
          provider_job_id: providerJobId,
          provider_status: "processing",
          take,
          ffmpeg_used: false,
        });
      }

      const uri = generatedVideoUri(result);
      if (!uri) {
        return json({
          success: false,
          pending: false,
          failed: true,
          provider: PROVIDER,
          model: MODEL,
          provider_job_id: providerJobId,
          provider_status: filteredReason(result) ? "filtered" : "failed",
          error: filteredReason(result) || "GOOGLE_VEO_COMPLETED_VIDEO_URI_REQUIRED",
          take,
          ffmpeg_used: false,
        }, 502);
      }

      const bytes = await downloadVideo(uri, credential.key);
      const stored = await persistVideo(bytes, take, providerJobId);
      return json({
        success: true,
        pending: false,
        failed: false,
        provider: PROVIDER,
        model: MODEL,
        provider_job_id: providerJobId,
        provider_status: "completed",
        take,
        ffmpeg_used: false,
        ...stored,
      });
    }

    if (action === "signed") {
      const outputPath = `${OUTPUT_DIR}/synthetic-intelligence-google-veo-take-${take}.mp4`;
      const signed = await supabase.storage.from(BUCKET).createSignedUrl(outputPath, 86400);
      if (signed.error) throw signed.error;
      return json({ success: true, output_path: outputPath, signed_url: signed.data?.signedUrl || null, take });
    }

    return json({ success: false, error: "Unsupported action" }, 400);
  } catch (error) {
    return json({ success: false, error: error?.message || String(error) }, 500);
  }
}
