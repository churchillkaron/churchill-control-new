export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 800;

import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";

import {
  executeService,
  settlePendingService,
} from "@/lib/platform/service-runtime/execution/ServiceExecutionRuntime";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { resolveCreativeFfmpegPath } from "@/lib/creative/media/runtime/CreativeMediaBinaryRuntime";

const ORGANIZATION_ID = "33336a72-acb5-474e-856b-8be0269360e2";
const TOKEN = "churchill-night-changes-v2-providerfix-20260821";
const COMMAND_IDENTITY = "CHURCHILL_THE_NIGHT_CHANGES_90S_V2";
const PROVIDER = "google-veo";
const MODEL = "veo-3.1-generate-preview";
const BUCKET = "creative-assets";
const DURATION = 8;

const A = Object.freeze({
  logo: "f2e57100-1b78-43c9-b080-1c7945fc4d23",
  entrance: "f0c96f1a-6719-4dc2-8b9a-d095864d273a",
  dinner: "8b4854e6-8c9c-4fc6-a3f5-7eaadc1d8d8b",
  carpaccio: "e767ad1c-e9ba-4bc3-aebc-525e963a8c78",
  pool: "797c9d16-5465-4e60-be93-a6c65707f7db",
  shuffleboard: "23756544-16cd-4d76-9e26-2e11bdde8c23",
  band: "cb027610-625c-4751-99a0-6a41b3597237",
});

const SHOTS = Object.freeze({
  entrance_to_dinner: {
    opening: A.entrance,
    closing: A.dinner,
    description:
      "Start exactly from the supplied real Churchill entrance frame and finish exactly on the supplied real Churchill dinner frame. Preserve Churchill architecture, warm practical light, plants, wood, brick and the real hospitality atmosphere. One slow premium forward camera move. A warm glass/reflection passes close to lens and naturally fills the frame; as it clears, the real dining room is revealed. Photorealistic feature-film hospitality cinematography. Do not invent signage, logos, architecture, faces, holograms, portals or cyberpunk effects. The future feeling comes only from the impossible but physically elegant reflection transition.",
  },
  food_to_pool: {
    opening: A.carpaccio,
    closing: A.pool,
    description:
      "Start exactly from the supplied real Churchill beef carpaccio frame and finish exactly on the supplied real Churchill pool-room frame. Keep the actual dish recognizable and appetizing. Macro camera glides across sauce, parmesan, greens and plate highlights. Steam and a circular polished highlight become the circular highlight of a cue ball, then resolve naturally into the authentic Churchill pool room. Preserve the real pool-table proportions and Churchill room identity. No fake food, no invented branding, no generic luxury lounge, no distorted table, no hologram and no sci-fi redesign.",
  },
  pool_to_shuffleboard: {
    opening: A.pool,
    closing: A.shuffleboard,
    description:
      "Start exactly from the supplied real Churchill pool-room frame and finish exactly on the supplied real Churchill shuffleboard frame. Preserve the actual pool table, warm lighting and real room. A real pool ball moves close to lens and creates a clean foreground occlusion; after the occlusion, the camera is tracking very low along the exact Churchill shuffleboard surface as the puck glides toward the real scoring area. Photorealistic, physically plausible, premium sports-bar cinematography. No invented logos, no warped tables, no fake venue, no sci-fi graphics and no traditional dartboard.",
  },
  darts_a: {
    opening: A.shuffleboard,
    closing: A.pool,
    description:
      "Start exactly from the supplied real Churchill shuffleboard frame and finish exactly on the supplied real Churchill pool/games-room frame. Track the shuffleboard puck toward the scoring end. Its final circular movement motivates a fast but controlled camera travel into Churchill's games room. The final frame is authoritative real Churchill venue evidence and must be reproduced exactly. If electronic dart machines are visible in that supplied final games-room frame, preserve their exact electronic target/cabinet/screen relationship; never replace them with a traditional, sisal, bristle or vintage dartboard. No generic pub darts wall, no cyberpunk redesign, no invented signage.",
  },
  darts_b: {
    opening: A.pool,
    closing: A.band,
    description:
      "Start exactly from the supplied real Churchill pool/games-room frame and finish exactly on the supplied real Churchill live-band frame. The opening games-room frame is authoritative Churchill equipment and architecture evidence. Hold long enough for the real electronic darts/game-room identity to register. A circular illuminated electronic-darts target/light becomes a bright practical stage spotlight; the camera follows that light into the real Churchill music world and resolves exactly on the supplied real band frame. Never show a traditional, sisal, bristle or vintage dartboard. Do not invent a different singer, band, stage, face, logo or venue. No holograms and no cyberpunk.",
  },
});

const NEGATIVES = Object.freeze([
  "traditional dartboard",
  "sisal dartboard",
  "bristle dartboard",
  "vintage dartboard",
  "generic pub darts wall",
  "generic restaurant",
  "generic luxury lounge",
  "invented architecture",
  "invented signage",
  "invented logo",
  "readable generated text",
  "face substitution",
  "identity drift",
  "replacement singer",
  "replacement band",
  "warped pool table",
  "warped shuffleboard",
  "fake food",
  "cyberpunk",
  "hologram",
  "camera shake",
]);

function text(value) {
  return String(value ?? "").trim();
}

function json(data, status = 200) {
  return Response.json(data, { status, headers: { "Cache-Control": "no-store, private" } });
}

function run(command, args, timeoutMs = 360000) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { shell: false, stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, OMP_NUM_THREADS: "1" } });
    const stdout = [], stderr = [];
    let settled = false;
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      if (!settled) { settled = true; reject(new Error("CHURCHILL_PROVIDERFIX_MEDIA_TIMEOUT")); }
    }, timeoutMs);
    child.stdout.on("data", (chunk) => stdout.push(chunk));
    child.stderr.on("data", (chunk) => stderr.push(chunk));
    child.on("error", (error) => {
      clearTimeout(timer);
      if (!settled) { settled = true; reject(error); }
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (settled) return;
      settled = true;
      const out = Buffer.concat(stdout).toString("utf8");
      const err = Buffer.concat(stderr).toString("utf8");
      if (code !== 0) reject(new Error(err.slice(-16000) || `MEDIA_EXIT_${code}`));
      else resolve({ stdout: out, stderr: err });
    });
  });
}

async function project() {
  const { data: mission, error: missionError } = await supabaseAdmin
    .from("creative_missions")
    .select("id")
    .eq("organization_id", ORGANIZATION_ID)
    .eq("metadata->>command_identity", COMMAND_IDENTITY)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (missionError) throw missionError;
  if (!mission?.id) throw new Error("CHURCHILL_PROVIDERFIX_PROJECT_NOT_PREPARED");
  const { data, error } = await supabaseAdmin
    .from("creative_projects")
    .select("*")
    .eq("organization_id", ORGANIZATION_ID)
    .eq("creative_mission_id", mission.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("CHURCHILL_PROVIDERFIX_PROJECT_NOT_PREPARED");
  return data;
}

function contract(key, p) {
  const shot = SHOTS[key];
  if (!shot) throw new Error("CHURCHILL_PROVIDERFIX_SHOT_INVALID");
  return {
    title: `Churchill — ${key}`,
    description: shot.description,
    intent: {
      story_purpose: "Create one authentic Churchill match-transition for the 90-second flagship night film.",
      visual_meaning: shot.description,
      emotional_tone: "premium, photoreal, warm, energetic, authentic",
      editorial_transition: "Exact supplied first and last frames define the transition endpoints.",
    },
    requirements: {
      visual_quality: "world-class photoreal feature-film hospitality commercial",
      authenticity: "Supplied first and last Churchill frames are authoritative. Preserve their identity and geometry.",
      negative_constraints: NEGATIVES,
    },
    shot_bible: {
      precision_control: {
        opening_frame_asset_id: shot.opening,
        closing_frame_asset_id: shot.closing,
        exact_last_frame_required: true,
      },
      frame_plan: {
        opening_frame: { asset_id: shot.opening },
        closing_frame: { asset_id: shot.closing },
      },
      output: {
        duration_seconds: DURATION,
        aspect_ratio: "16:9",
        resolution: "1080p",
      },
    },
    output_spec: { duration_seconds: DURATION, aspect_ratio: "16:9", resolution: "1080p" },
    provider_parameters: {
      first_frame_asset_id: shot.opening,
      last_frame_asset_id: shot.closing,
      aspect_ratio: "16:9",
      resolution: "1080p",
    },
    primary_source_asset_id: shot.opening,
    creative_project_id: p.id,
    creative_mission_id: p.creative_mission_id || null,
    quantity: DURATION,
    currency: "THB",
  };
}

function stateContainer(metadata) {
  return metadata?.churchill_night_changes_v2 || {};
}

function storeKey(key) {
  return key === "darts_a" || key === "darts_b" ? "darts_parts" : "shots";
}

async function patch(p, key, value, filmStatus = "GENERATING_TRANSITIONS") {
  const metadata = p.metadata || {};
  const current = stateContainer(metadata);
  const container = storeKey(key);
  const next = {
    ...current,
    status: filmStatus,
    [container]: {
      ...(current[container] || {}),
      [key]: value,
    },
    publication_authorized: false,
    provider_contract_repair: {
      mode: "VEO_FIRST_LAST_INTERPOLATION_ONLY",
      reference_images_combination_disabled: true,
      darts_midpoint_split: true,
      updated_at: new Date().toISOString(),
    },
    updated_at: new Date().toISOString(),
  };
  const { error } = await supabaseAdmin
    .from("creative_projects")
    .update({ metadata: { ...metadata, churchill_night_changes_v2: next }, updated_at: new Date().toISOString() })
    .eq("id", p.id)
    .eq("organization_id", ORGANIZATION_ID);
  if (error) throw error;
  return next;
}

async function start(key) {
  if (!SHOTS[key]) throw new Error("CHURCHILL_PROVIDERFIX_SHOT_INVALID");
  const p = await project();
  const currentFilm = stateContainer(p.metadata);
  const current = currentFilm[storeKey(key)]?.[key] || null;
  if (current?.provider_contract_repair === true && current?.status === "COMPLETED" && current?.output_reference) {
    return { success: true, reused: true, key, state: current };
  }
  if (current?.provider_contract_repair === true && current?.status === "PROCESSING" && current?.provider_job_id && current?.usage_id) {
    return { success: true, reused: true, key, state: current };
  }

  const result = await executeService({
    organization_id: ORGANIZATION_ID,
    bill_to_organization_id: ORGANIZATION_ID,
    service_id: "ai.video.generate",
    provider_id: PROVIDER,
    provider_policy: { allowed_providers: [PROVIDER], preferred_providers: [PROVIDER] },
    input: contract(key, p),
    metadata: {
      module: "CREATIVE",
      operation: `CHURCHILL_NIGHT_CHANGES_PROVIDERFIX_${key.toUpperCase()}`,
      command_identity: COMMAND_IDENTITY,
      creative_project_id: p.id,
      shot_key: key,
      provider_contract_repair: true,
      request_mode: "FIRST_LAST_INTERPOLATION",
      electronic_darts_midpoint: key === "darts_a" || key === "darts_b",
      traditional_dartboard_forbidden: true,
      publication_authorized: false,
    },
    category: "AI",
  });

  const state = {
    status: result?.pending ? "PROCESSING" : "COMPLETED",
    provider: result?.provider || PROVIDER,
    model: result?.model || MODEL,
    provider_job_id: result?.provider_job_id || null,
    provider_status: result?.provider_status || null,
    usage_id: result?.usage?.id || null,
    credential_id: result?.credential_id || null,
    pricing: result?.pricing || null,
    started_at: result?.started_at || new Date().toISOString(),
    opening_asset_id: SHOTS[key].opening,
    closing_asset_id: SHOTS[key].closing,
    duration_seconds: DURATION,
    output_reference: result?.pending ? null : (result?.output?.file_url || result?.output?.video_url || null),
    provider_contract_repair: true,
    request_mode: "FIRST_LAST_INTERPOLATION",
    electronic_darts_midpoint: key === "darts_a" || key === "darts_b",
    publication_authorized: false,
  };
  await patch(p, key, state);
  return { success: true, reused: false, key, state };
}

async function poll(key) {
  if (!SHOTS[key]) throw new Error("CHURCHILL_PROVIDERFIX_SHOT_INVALID");
  const p = await project();
  const current = stateContainer(p.metadata)[storeKey(key)]?.[key] || null;
  if (!current?.provider_contract_repair) throw new Error("CHURCHILL_PROVIDERFIX_SHOT_NOT_STARTED");
  if (current.status === "COMPLETED" && current.output_reference) {
    return { success: true, pending: false, reused: true, key, state: current };
  }
  if (!current.provider || !current.provider_job_id || !current.usage_id) {
    throw new Error("CHURCHILL_PROVIDERFIX_PENDING_STATE_INCOMPLETE");
  }
  const result = await settlePendingService({
    organization_id: ORGANIZATION_ID,
    provider: current.provider,
    provider_job_id: current.provider_job_id,
    usage_id: current.usage_id,
    pricing: current.pricing || {},
    credential_id: current.credential_id || null,
    started_at: current.started_at || null,
    provider_status_input: { creative_project_id: p.id, creative_mission_id: p.creative_mission_id || null },
    metadata: {
      module: "CREATIVE",
      operation: `CHURCHILL_NIGHT_CHANGES_PROVIDERFIX_${key.toUpperCase()}_POLL`,
      command_identity: COMMAND_IDENTITY,
      creative_project_id: p.id,
      shot_key: key,
      provider_contract_repair: true,
      request_mode: "FIRST_LAST_INTERPOLATION",
      traditional_dartboard_forbidden: true,
      publication_authorized: false,
    },
  });
  if (result?.failed) {
    const state = { ...current, status: "FAILED", provider_status: result.provider_status || "failed", error: result.error || "Veo generation failed", completed_at: new Date().toISOString() };
    await patch(p, key, state, "TRANSITION_REPAIR_REQUIRED");
    return { success: false, pending: false, failed: true, key, state };
  }
  if (result?.pending) {
    const state = { ...current, status: "PROCESSING", provider_status: result.provider_status || "processing", last_polled_at: new Date().toISOString() };
    await patch(p, key, state);
    return { success: true, pending: true, key, state };
  }
  const outputReference =
    result?.output?.url || result?.output?.file_url || result?.output?.video_url ||
    result?.output?.raw?.output?.storage_reference || result?.output?.raw?.output?.file_url || null;
  if (!outputReference) throw new Error("CHURCHILL_PROVIDERFIX_COMPLETED_OUTPUT_REQUIRED");
  const state = {
    ...current,
    status: "COMPLETED",
    provider_status: result.provider_status || "completed",
    output_reference: outputReference,
    settlement: result.settlement || null,
    pricing: result.pricing || current.pricing || null,
    completed_at: new Date().toISOString(),
    error: null,
  };
  await patch(p, key, state);
  return { success: true, pending: false, key, state };
}

function storagePath(reference) {
  const value = text(reference);
  const prefix = `storage://${BUCKET}/`;
  if (value.startsWith(prefix)) return value.slice(prefix.length);
  const needle = `/storage/v1/object/public/${BUCKET}/`;
  const index = value.indexOf(needle);
  if (index >= 0) return decodeURIComponent(value.slice(index + needle.length).split("?")[0]);
  return null;
}

async function signed(reference, seconds = 7200) {
  const p = storagePath(reference);
  if (!p) {
    if (/^https:\/\//i.test(text(reference))) return text(reference);
    throw new Error("CHURCHILL_PROVIDERFIX_STORAGE_REFERENCE_REQUIRED");
  }
  const { data, error } = await supabaseAdmin.storage.from(BUCKET).createSignedUrl(p, seconds);
  if (error) throw error;
  if (!data?.signedUrl) throw new Error("CHURCHILL_PROVIDERFIX_SIGNED_URL_MISSING");
  return data.signedUrl;
}

async function composeDarts() {
  const ffmpeg = resolveCreativeFfmpegPath();
  if (!ffmpeg) throw new Error("CHURCHILL_PROVIDERFIX_FFMPEG_NOT_READY");
  const p = await project();
  const film = stateContainer(p.metadata);
  const a = film.darts_parts?.darts_a;
  const b = film.darts_parts?.darts_b;
  if (a?.status !== "COMPLETED" || !a?.output_reference) throw new Error("CHURCHILL_DARTS_A_NOT_READY");
  if (b?.status !== "COMPLETED" || !b?.output_reference) throw new Error("CHURCHILL_DARTS_B_NOT_READY");
  const [urlA, urlB] = await Promise.all([signed(a.output_reference), signed(b.output_reference)]);
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "churchill-darts-midpoint-"));
  const output = path.join(directory, "churchill-shuffle-darts-stage.mp4");
  try {
    await run(ffmpeg, [
      "-y",
      "-ss", "3",
      "-i", urlA,
      "-i", urlB,
      "-filter_complex",
      "[0:v]trim=start=0:end=5,setpts=PTS-STARTPTS,fps=24,scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080,setsar=1,format=yuv420p[a];[1:v]trim=start=0:end=3,setpts=PTS-STARTPTS,fps=24,scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080,setsar=1,format=yuv420p[b];[a][b]concat=n=2:v=1:a=0[v]",
      "-map", "[v]",
      "-an",
      "-c:v", "libx264",
      "-preset", "veryfast",
      "-crf", "15",
      "-r", "24",
      "-vsync", "cfr",
      "-pix_fmt", "yuv420p",
      "-t", "8",
      "-movflags", "+faststart",
      output,
    ], 180000);
    const bytes = await fs.readFile(output);
    const checksum = crypto.createHash("sha256").update(bytes).digest("hex");
    const target = `${ORGANIZATION_ID}/${p.id}/churchill-night-changes-v2/transitions/shuffleboard-electric-darts-stage-v2.mp4`;
    const { error } = await supabaseAdmin.storage.from(BUCKET).upload(target, bytes, {
      contentType: "video/mp4",
      upsert: true,
      cacheControl: "3600",
      metadata: {
        organization_id: ORGANIZATION_ID,
        creative_project_id: p.id,
        command_identity: COMMAND_IDENTITY,
        exact_electric_darts_midpoint: "true",
        traditional_dartboard_forbidden: "true",
        checksum,
      },
    });
    if (error) throw error;
    const state = {
      status: "COMPLETED",
      provider: "COMPOSITE_GOOGLE_VEO_INTERPOLATION",
      model: MODEL,
      output_reference: `storage://${BUCKET}/${target}`,
      opening_asset_id: A.shuffleboard,
      darts_midpoint_asset_id: A.pool,
      closing_asset_id: A.band,
      source_parts: [a.output_reference, b.output_reference],
      duration_seconds: 8,
      darts_reference_lock: true,
      electronic_darts_only: true,
      traditional_dartboard_forbidden: true,
      provider_contract_repair: true,
      checksum,
      bytes: bytes.length,
      completed_at: new Date().toISOString(),
      publication_authorized: false,
    };
    const metadata = p.metadata || {};
    const current = stateContainer(metadata);
    const next = {
      ...current,
      status: "GENERATING_TRANSITIONS",
      shots: { ...(current.shots || {}), shuffleboard_to_stage: state },
      provider_contract_repair: {
        mode: "VEO_FIRST_LAST_INTERPOLATION_ONLY",
        reference_images_combination_disabled: true,
        darts_midpoint_split: true,
        darts_midpoint_asset_id: A.pool,
        updated_at: new Date().toISOString(),
      },
      publication_authorized: false,
      updated_at: new Date().toISOString(),
    };
    const { error: updateError } = await supabaseAdmin
      .from("creative_projects")
      .update({ metadata: { ...metadata, churchill_night_changes_v2: next }, updated_at: new Date().toISOString() })
      .eq("id", p.id)
      .eq("organization_id", ORGANIZATION_ID);
    if (updateError) throw updateError;
    return { success: true, state };
  } finally {
    await fs.rm(directory, { recursive: true, force: true }).catch(() => {});
  }
}

async function status() {
  const p = await project();
  const film = stateContainer(p.metadata);
  return {
    success: true,
    creative_project_id: p.id,
    shots: Object.fromEntries(Object.keys(SHOTS).map((key) => [key, film[storeKey(key)]?.[key] || { status: "NOT_STARTED" }])),
    composed_darts: film.shots?.shuffleboard_to_stage || { status: "NOT_COMPOSED" },
    provider_contract_repair: film.provider_contract_repair || null,
    publication_authorized: false,
  };
}

export async function GET(request) {
  try {
    const url = new URL(request.url);
    if (url.searchParams.get("token") !== TOKEN) return json({ success: false }, 404);
    const action = text(url.searchParams.get("action") || "status").toLowerCase();
    const key = text(url.searchParams.get("shot"));
    if (action === "status") return json(await status());
    if (action === "start") return json(await start(key));
    if (action === "poll") return json(await poll(key));
    if (action === "compose-darts") return json(await composeDarts());
    return json({ success: false, error: "Unsupported action" }, 400);
  } catch (error) {
    console.error("CHURCHILL_PROVIDERFIX_FAILED", { message: error?.message || String(error) });
    return json({ success: false, error: error?.message || String(error) }, 500);
  }
}
