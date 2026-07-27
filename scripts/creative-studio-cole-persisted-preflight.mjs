#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import fsp from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import process from "node:process";
import { spawn } from "node:child_process";
import nextEnv from "@next/env";

const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd());

const ORGANIZATION_ID =
  process.env.COLE_PREFLIGHT_ORGANIZATION_ID ||
  "9550b843-b83c-4d15-b02d-a0b5ca23346e";
const BASE_URL = process.env.COLE_PREFLIGHT_BASE_URL || "http://127.0.0.1:3011";
const SOURCE_PORT = Number(process.env.COLE_PREFLIGHT_SOURCE_PORT || 43871);
const PREFLIGHT_KEY =
  process.env.COLE_PREFLIGHT_KEY || "cole-ley-live-showreel-v1";
const DOWNLOADS = path.join(process.env.HOME || "", "Downloads");
const STATE_PATH =
  process.env.COLE_PREFLIGHT_STATE ||
  path.join(DOWNLOADS, "COLE_LEY_PERSISTED_PREFLIGHT_STATE.json");
const REPORT_PATH =
  process.env.COLE_PREFLIGHT_REPORT ||
  path.join(
    DOWNLOADS,
    `COLE_LEY_PERSISTED_PREFLIGHT_${new Date()
      .toISOString()
      .replace(/[-:]/g, "")
      .replace(/\..+$/, "")}.json`,
  );

const SOURCES = [
  { name: "IMG_0013.MOV", kind: "video", mime: "video/quicktime" },
  { name: "IMG_0021.MOV", kind: "video", mime: "video/quicktime" },
  { name: "IMG_0023.MOV", kind: "video", mime: "video/quicktime" },
  { name: "IMG_0973.MOV", kind: "video", mime: "video/quicktime" },
  { name: "IMG_0974.MOV", kind: "video", mime: "video/quicktime" },
  { name: "IMG_0975.MOV", kind: "video", mime: "video/quicktime" },
  { name: "IMG_2622.MOV", kind: "video", mime: "video/quicktime" },
  { name: "IMG_2628.MOV", kind: "video", mime: "video/quicktime" },
  { name: "cole-logo1.png", kind: "logo", mime: "image/png" },
].map((source) => ({ ...source, file: path.join(DOWNLOADS, source.name) }));

function text(value) {
  return String(value ?? "").trim();
}

function required(name) {
  const value = text(process.env[name]);
  if (!value) throw new Error(`${name} required`);
  return value;
}

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function exists(filePath) {
  try {
    await fsp.access(filePath, fs.constants.R_OK);
    return true;
  } catch {
    return false;
  }
}

async function loadState() {
  try {
    return JSON.parse(await fsp.readFile(STATE_PATH, "utf8"));
  } catch {
    return {
      version: 1,
      preflight_key: PREFLIGHT_KEY,
      organization_id: ORGANIZATION_ID,
      sources: {},
      events: [],
    };
  }
}

async function saveState(state) {
  state.updated_at = new Date().toISOString();
  await fsp.mkdir(path.dirname(STATE_PATH), { recursive: true });
  await fsp.writeFile(STATE_PATH, JSON.stringify(state, null, 2));
}

function event(state, type, data = {}) {
  state.events.push({
    at: new Date().toISOString(),
    type,
    ...data,
  });
}

function authHeaders(extra = {}) {
  const headers = {
    accept: "application/json",
    "content-type": "application/json",
    "x-avantiqo-local-preflight-token": required(
      "CREATIVE_LOCAL_SOURCE_PREFLIGHT_TOKEN",
    ),
    ...extra,
  };
  const bearer = text(process.env.CREATIVE_SMOKE_BEARER_TOKEN);
  const cookie = text(process.env.CREATIVE_SMOKE_COOKIE);
  if (bearer) headers.authorization = `Bearer ${bearer}`;
  if (cookie) headers.cookie = cookie;
  if (!bearer && !cookie) {
    throw new Error(
      "CREATIVE_SMOKE_BEARER_TOKEN or CREATIVE_SMOKE_COOKIE required",
    );
  }
  return headers;
}

async function post(body) {
  const response = await fetch(
    new URL("/api/creative/preflight/local", BASE_URL),
    {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ organization_id: ORGANIZATION_ID, ...body }),
    },
  );
  const raw = await response.text();
  let payload;
  try {
    payload = raw ? JSON.parse(raw) : {};
  } catch {
    payload = { raw };
  }
  if (!response.ok || payload.success === false) {
    const error = new Error(
      `${body.action} failed (${response.status}): ` +
      `${payload.error || payload.message || raw || response.statusText}`,
    );
    error.payload = payload;
    throw error;
  }
  return payload;
}

function run(command, args, { capture = true } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      shell: false,
      stdio: capture ? ["ignore", "pipe", "pipe"] : "inherit",
    });
    const stdout = [];
    const stderr = [];
    if (capture) {
      child.stdout.on("data", (chunk) => stdout.push(chunk));
      child.stderr.on("data", (chunk) => stderr.push(chunk));
    }
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(
          capture
            ? Buffer.concat(stderr).toString("utf8") || `${command} exited ${code}`
            : `${command} exited ${code}`,
        ));
        return;
      }
      resolve({
        stdout: capture ? Buffer.concat(stdout).toString("utf8") : "",
        stderr: capture ? Buffer.concat(stderr).toString("utf8") : "",
      });
    });
  });
}

async function sha256(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash("sha256");
    const stream = fs.createReadStream(filePath);
    stream.on("error", reject);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("end", () => resolve(hash.digest("hex")));
  });
}

async function probe(filePath, kind, mime) {
  const stat = await fsp.stat(filePath);
  const checksum = await sha256(filePath);
  if (kind === "logo") {
    return {
      media_kind: "image",
      mime_type: mime,
      file_size_bytes: stat.size,
      checksum_sha256: checksum,
      checksum,
      original_file_name: path.basename(filePath),
    };
  }

  const ffprobe =
    process.env.CREATIVE_MEDIA_FFPROBE_PATH ||
    process.env.FFPROBE_PATH ||
    "ffprobe";
  const { stdout } = await run(ffprobe, [
    "-v", "error",
    "-show_format",
    "-show_streams",
    "-of", "json",
    filePath,
  ]);
  const parsed = JSON.parse(stdout);
  const streams = Array.isArray(parsed.streams) ? parsed.streams : [];
  const video = streams.find((stream) => stream.codec_type === "video") || {};
  const audio = streams.find((stream) => stream.codec_type === "audio") || {};
  const duration = Number(
    parsed.format?.duration ?? video.duration ?? audio.duration,
  );
  if (!Number.isFinite(duration) || duration <= 0) {
    throw new Error(`VIDEO_DURATION_INVALID:${path.basename(filePath)}`);
  }

  return {
    media_kind: "video",
    mime_type: mime,
    file_size_bytes: stat.size,
    checksum_sha256: checksum,
    checksum,
    original_file_name: path.basename(filePath),
    duration_seconds: duration,
    width: Number(video.width || 0) || null,
    height: Number(video.height || 0) || null,
    frame_rate: video.avg_frame_rate || video.r_frame_rate || null,
    video_codec: video.codec_name || null,
    pixel_format: video.pix_fmt || null,
    audio_codec: audio.codec_name || null,
    sample_rate: Number(audio.sample_rate || 0) || null,
    channels: Number(audio.channels || 0) || null,
    stream_count: streams.length,
  };
}

function sourceUrl(source) {
  return `http://127.0.0.1:${SOURCE_PORT}/${encodeURIComponent(source.name)}`;
}

function contentType(fileName) {
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".mov")) return "video/quicktime";
  if (lower.endsWith(".mp4")) return "video/mp4";
  return "application/octet-stream";
}

function createSourceServer() {
  const allowed = new Map(SOURCES.map((source) => [source.name, source.file]));
  return http.createServer(async (request, response) => {
    try {
      const url = new URL(request.url || "/", `http://127.0.0.1:${SOURCE_PORT}`);
      const name = decodeURIComponent(url.pathname.replace(/^\//, ""));
      const filePath = allowed.get(name);
      if (!filePath) {
        response.writeHead(404).end("Not found");
        return;
      }
      const stat = await fsp.stat(filePath);
      const range = request.headers.range;
      response.setHeader("Accept-Ranges", "bytes");
      response.setHeader("Content-Type", contentType(name));
      response.setHeader("Cache-Control", "no-store");

      if (range) {
        const match = /^bytes=(\d*)-(\d*)$/.exec(range);
        if (!match) {
          response.writeHead(416).end();
          return;
        }
        const start = match[1] ? Number(match[1]) : 0;
        const end = match[2]
          ? Math.min(Number(match[2]), stat.size - 1)
          : stat.size - 1;
        if (start > end || start >= stat.size) {
          response.writeHead(416, { "Content-Range": `bytes */${stat.size}` }).end();
          return;
        }
        response.writeHead(206, {
          "Content-Length": end - start + 1,
          "Content-Range": `bytes ${start}-${end}/${stat.size}`,
        });
        fs.createReadStream(filePath, { start, end }).pipe(response);
        return;
      }

      response.writeHead(200, { "Content-Length": stat.size });
      fs.createReadStream(filePath).pipe(response);
    } catch (error) {
      response.writeHead(500).end(error?.message || String(error));
    }
  });
}

async function listen(server) {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(SOURCE_PORT, "127.0.0.1", () => {
      server.removeListener("error", reject);
      resolve();
    });
  });
}

async function close(server) {
  return new Promise((resolve) => server.close(() => resolve()));
}

async function assertAppReady() {
  for (let attempt = 1; attempt <= 60; attempt += 1) {
    try {
      const response = await fetch(BASE_URL, { redirect: "manual" });
      if (response.status < 500) return;
    } catch {
      // Continue until timeout.
    }
    await sleep(1000);
  }
  throw new Error(`Avantiqo server not ready at ${BASE_URL}`);
}

function missionIntent() {
  return [
    "Create a three-minute premium Cole Ley live-performance showreel from the registered real performance videos and logo.",
    "Analyse every complete source video, detect musical section boundaries, and persist verified source ranges before production.",
    "Cole Ley must be visibly central and actively performing in every selected moment.",
    "Preserve original live audio and exact lip synchronisation.",
    "Build a deliberate three-act progression with premium subject-aware reframing and no generic blurred vertical backgrounds.",
    "This preflight must not start paid production. Production requires a separate explicit resume command.",
  ].join("\n\n");
}

async function main() {
  required("CREATIVE_LOCAL_SOURCE_PREFLIGHT_TOKEN");
  for (const source of SOURCES) {
    if (!(await exists(source.file))) {
      throw new Error(`SOURCE_FILE_MISSING:${source.file}`);
    }
  }
  await assertAppReady();

  const state = await loadState();
  if (state.preflight_key !== PREFLIGHT_KEY) {
    throw new Error("PREFLIGHT_STATE_KEY_MISMATCH");
  }

  const sourceServer = createSourceServer();
  await listen(sourceServer);
  console.log(`LOCAL_SOURCE_SERVER=http://127.0.0.1:${SOURCE_PORT}`);

  try {
    if (!state.creative_mission_id || !state.creative_project_id) {
      const initialized = await post({
        action: "INIT",
        preflight_key: PREFLIGHT_KEY,
        title: "Cole Ley — Three-Minute Live Performance Showreel",
        intent: missionIntent(),
        production_type: "MASTER_VIDEO",
        target_duration: 180,
        target_languages: ["en"],
        channels: ["website", "youtube", "facebook"],
        quality_profile: "world_class_live_artist_showreel",
        desired_outcome:
          "Customers understand Cole Ley's vocal quality, repertoire, stage presence and suitability for premium live events.",
        communication_goal:
          "Demonstrate authentic live singing across several songs and moods while keeping Cole visibly central.",
        call_to_action: "Book Cole Ley for live events",
        tone: "premium, authentic, warm, dynamic and musically intelligent",
        emotion: "confidence, connection, joy and memorable live atmosphere",
        metadata: {
          forensic_smoke_test: true,
          live_showreel: true,
          original_audio_required: true,
          exact_lip_sync_required: true,
          paid_production_authorized: false,
        },
      });
      state.creative_mission_id = initialized.creative_mission_id;
      state.creative_project_id = initialized.creative_project_id;
      state.creative_brief_id = initialized.creative_brief_id;
      event(state, "MISSION_PROJECT_PERSISTED", {
        creative_mission_id: state.creative_mission_id,
        creative_project_id: state.creative_project_id,
      });
      await saveState(state);
    }

    console.log(`MISSION_ID=${state.creative_mission_id}`);
    console.log(`PROJECT_ID=${state.creative_project_id}`);

    for (const source of SOURCES) {
      const sourceState = state.sources[source.name] || {};
      let technical = sourceState.technical;
      if (!technical) {
        console.log(`HASHING_AND_PROBING=${source.name}`);
        technical = await probe(source.file, source.kind, source.mime);
        state.sources[source.name] = {
          ...sourceState,
          technical,
          probed_at: new Date().toISOString(),
        };
        event(state, "SOURCE_PROBED", {
          source: source.name,
          checksum_sha256: technical.checksum_sha256,
          duration_seconds: technical.duration_seconds || null,
        });
        await saveState(state);
      }

      if (!state.sources[source.name].asset_node_id) {
        console.log(`REGISTERING=${source.name}`);
        const registered = await post({
          action: "REGISTER",
          preflight_key: PREFLIGHT_KEY,
          creative_mission_id: state.creative_mission_id,
          creative_project_id: state.creative_project_id,
          source: {
            name: source.name,
            media_kind: source.kind,
            asset_type: source.kind,
            mime_type: source.mime,
            url: sourceUrl(source),
            checksum_sha256: technical.checksum_sha256,
            file_size_bytes: technical.file_size_bytes,
            duration_seconds: technical.duration_seconds || null,
            technical,
          },
        });
        state.sources[source.name] = {
          ...state.sources[source.name],
          asset_id: registered.asset?.id || null,
          asset_node_id: registered.asset_node?.id || null,
          registered_at: new Date().toISOString(),
        };
        if (!state.sources[source.name].asset_node_id) {
          throw new Error(`REGISTER_DID_NOT_RETURN_NODE:${source.name}`);
        }
        event(state, "SOURCE_REGISTERED", {
          source: source.name,
          asset_id: state.sources[source.name].asset_id,
          asset_node_id: state.sources[source.name].asset_node_id,
        });
        await saveState(state);
      }
    }

    for (const source of SOURCES.filter((item) => item.kind === "video")) {
      const sourceState = state.sources[source.name];
      if (sourceState.analysis_status === "COMPLETE") {
        console.log(`ANALYSIS_REUSED_FROM_CHECKPOINT=${source.name}`);
        continue;
      }

      console.log(`ANALYSING_COMPLETE_SOURCE=${source.name}`);
      const analysed = await post({
        action: "ANALYSE",
        creative_mission_id: state.creative_mission_id,
        creative_project_id: state.creative_project_id,
        parent_asset_node_id: sourceState.asset_node_id,
        source_url: sourceUrl(source),
        policy: {
          version: "persisted-local-performance-v1",
          requested_subject: "primary lead vocalist",
          minimum_usable_sections: 1,
          minimum_verified_samples: 2,
          minimum_quality_score: 55,
          minimum_primary_performer_ratio: 0.5,
          minimum_vocalist_ratio: 0.5,
          minimum_section_seconds: 8,
          maximum_section_seconds: 20,
          minimum_boundary_silence_seconds: 1.2,
          silence_noise_db: -32,
          silence_duration_seconds: 1.2,
          sample_fractions: [0.2, 0.5, 0.8],
          output_width: 1920,
          output_height: 1080,
          frame_rate: 30,
          video_codec: "libx264",
          video_preset: "medium",
          video_crf: 20,
          audio_codec: "aac",
          audio_bitrate: "192k",
        },
      });
      state.sources[source.name] = {
        ...sourceState,
        analysis_status: "COMPLETE",
        analysis_identity: analysed.analysis_identity,
        verified_moment_count: analysed.verified_moment_count,
        verified_moment_ids: analysed.verified_moment_ids,
        analysed_at: new Date().toISOString(),
      };
      event(state, "SOURCE_ANALYSIS_PERSISTED", {
        source: source.name,
        analysis_identity: analysed.analysis_identity,
        verified_moment_count: analysed.verified_moment_count,
        verified_moment_ids: analysed.verified_moment_ids,
      });
      await saveState(state);
      console.log(
        `SOURCE_ANALYSIS_PERSISTED=${source.name} MOMENTS=${analysed.verified_moment_count}`,
      );
    }

    const status = await post({
      action: "STATUS",
      creative_mission_id: state.creative_mission_id,
      creative_project_id: state.creative_project_id,
    });
    state.final_status = status;
    event(state, "PREFLIGHT_STATUS", status);
    await saveState(state);

    const report = {
      generated_at: new Date().toISOString(),
      mode: "PERSISTED_PREFLIGHT_ONLY",
      paid_production_authorized: false,
      production_started: false,
      state_path: STATE_PATH,
      ...status,
      sources: state.sources,
    };
    await fsp.writeFile(REPORT_PATH, JSON.stringify(report, null, 2));

    console.log("");
    console.log("============================================================");
    console.log("COLE LEY PERSISTED PREFLIGHT RESULT");
    console.log("============================================================");
    console.log("PAID_PRODUCTION_AUTHORIZED=NO");
    console.log("PRODUCTION_STARTED=NO");
    console.log(`MISSION_ID=${status.creative_mission_id}`);
    console.log(`PROJECT_ID=${status.creative_project_id}`);
    console.log(`SOURCE_VIDEO_COUNT=${status.source_video_count}`);
    console.log(`VERIFIED_MOMENT_COUNT=${status.verified_moment_count}`);
    console.log(`VERIFIED_SOURCE_COUNT=${status.verified_source_count}`);
    console.log(`VERIFIED_DURATION_SECONDS=${status.verified_duration_seconds}`);
    console.log(`TARGET_DURATION_SECONDS=${status.target_duration_seconds}`);
    console.log(`READY_TO_RESUME=${status.ready_to_resume ? "YES" : "NO"}`);
    console.log(`STATE=${STATE_PATH}`);
    console.log(`REPORT=${REPORT_PATH}`);
  } finally {
    await close(sourceServer);
  }
}

main().catch(async (error) => {
  console.error(error?.stack || error?.message || String(error));
  if (error?.payload) {
    console.error(JSON.stringify(error.payload, null, 2));
  }
  process.exitCode = 1;
});
