#!/usr/bin/env node

import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";

const RATE = 16000;
const WINDOW_SECONDS = 0.1;
const WINDOW = Math.round(RATE * WINDOW_SECONDS);
const MIN_RUN_SECONDS = 1.8;
const MIN_VISUAL_SCORE = 55;
const TARGET_PERFORMANCE_SECONDS = 72;
const FREQUENCIES = [80, 120, 180, 260, 380, 550, 800, 1150, 1700, 2500, 3600, 5200, 7000];

const text = (value) => String(value ?? "").trim();
const finite = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const clamp = (value, minimum = 0, maximum = 1) => Math.max(minimum, Math.min(maximum, finite(value, minimum)));
const average = (values, fallback = 0) => values.length ? values.reduce((total, value) => total + value, 0) / values.length : fallback;
const sum = (values) => Number(values.reduce((total, value) => total + finite(value), 0).toFixed(6));
const safe = (value) => text(value).replace(/[^a-zA-Z0-9._-]+/g, "-");
const escapeHtml = (value) => String(value ?? "")
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;");

function run(command, args, { allowFailure = false } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: process.cwd(),
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
      shell: false,
    });
    const stdout = [];
    const stderr = [];
    child.stdout.on("data", (chunk) => stdout.push(chunk));
    child.stderr.on("data", (chunk) => stderr.push(chunk));
    child.on("error", reject);
    child.on("close", (code, signal) => {
      const result = {
        code: Number.isInteger(code) ? code : 1,
        signal,
        stdout: Buffer.concat(stdout),
        stderr: Buffer.concat(stderr).toString("utf8"),
      };
      if (!allowFailure && (signal || result.code !== 0)) {
        reject(new Error(result.stderr || `${command} failed with ${signal || result.code}`));
        return;
      }
      resolve(result);
    });
  });
}

async function latestAudioPackage() {
  const desktop = path.join(os.homedir(), "Desktop");
  const entries = await fs.readdir(desktop, { withFileTypes: true });
  const matches = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (!entry.name.startsWith("AVANTIQO_COLE_EDITORIAL_APPROVAL_")) continue;
    if (!entry.name.includes("_AUDIO_REFINED_")) continue;
    if (entry.name.includes("_MUSIC_ONLY_")) continue;
    const directory = path.join(desktop, entry.name);
    const stats = await fs.stat(directory);
    matches.push({ directory, modified_at: stats.mtimeMs });
  }
  matches.sort((left, right) => right.modified_at - left.modified_at);
  return matches[0]?.directory || null;
}

function pcm(buffer) {
  const values = new Float64Array(Math.floor(buffer.length / 2));
  for (let index = 0; index < values.length; index += 1) {
    values[index] = buffer.readInt16LE(index * 2) / 32768;
  }
  return values;
}

function percentile(values, fraction) {
  const ordered = [...values].sort((left, right) => left - right);
  if (!ordered.length) return 0;
  return ordered[Math.round((ordered.length - 1) * fraction)];
}

function goertzel(samples, start, length, frequency) {
  const omega = 2 * Math.PI * frequency / RATE;
  const coefficient = 2 * Math.cos(omega);
  let previous = 0;
  let previousPrevious = 0;
  for (let index = 0; index < length; index += 1) {
    const current = (samples[start + index] || 0) + coefficient * previous - previousPrevious;
    previousPrevious = previous;
    previous = current;
  }
  return Math.max(
    0,
    previousPrevious * previousPrevious +
    previous * previous -
    coefficient * previous * previousPrevious,
  );
}

function autocorrelation(values, minimumLag, maximumLag) {
  if (values.length < maximumLag + 3) return 0;
  const mean = average(values);
  const centered = values.map((value) => value - mean);
  let maximum = 0;
  for (let lag = minimumLag; lag <= maximumLag; lag += 1) {
    let numerator = 0;
    let leftEnergy = 0;
    let rightEnergy = 0;
    for (let index = 0; index + lag < centered.length; index += 1) {
      const left = centered[index];
      const right = centered[index + lag];
      numerator += left * right;
      leftEnergy += left * left;
      rightEnergy += right * right;
    }
    const denominator = Math.sqrt(leftEnergy * rightEnergy);
    if (denominator > 1e-12) maximum = Math.max(maximum, numerator / denominator);
  }
  return clamp(maximum);
}

function features(samples) {
  const frames = [];
  for (let start = 0; start + WINDOW <= samples.length; start += WINDOW) {
    let square = 0;
    for (let index = 0; index < WINDOW; index += 1) {
      const value = samples[start + index] || 0;
      square += value * value;
    }
    const rms = Math.sqrt(square / WINDOW);
    const db = rms > 0 ? 20 * Math.log10(rms) : -120;
    const powers = FREQUENCIES.map((frequency) => goertzel(samples, start, WINDOW, frequency));
    const total = powers.reduce((accumulator, value) => accumulator + value, 0);
    const bands = total > 0 ? powers.map((value) => value / total) : powers.map(() => 0);
    frames.push({
      time_seconds: start / RATE,
      db,
      low_ratio: bands.slice(0, 4).reduce((accumulator, value) => accumulator + value, 0),
      vocal_ratio: bands.slice(3, 10).reduce((accumulator, value) => accumulator + value, 0),
      high_ratio: bands.slice(10).reduce((accumulator, value) => accumulator + value, 0),
      occupied_bands: bands.filter((value) => value >= 0.035).length,
    });
  }
  return frames;
}

function analyse(samples) {
  const frames = features(samples);
  if (!frames.length) {
    return {
      classification: "NO_AUDIO",
      music_score: 0,
      speech_dominance_ratio: 1,
      usable_range: null,
      reasons: ["NO_AUDIO"],
    };
  }

  const noiseFloor = percentile(frames.map((frame) => frame.db), 0.2);
  const threshold = Math.min(-24, Math.max(-42, noiseFloor + 8));
  const active = frames.filter((frame) => frame.db >= threshold);
  const activeRatio = active.length / frames.length;
  const lowBedRatio = active.filter((frame) => frame.low_ratio >= 0.2).length / Math.max(1, active.length);
  const highPresenceRatio = active.filter((frame) => frame.high_ratio >= 0.045).length / Math.max(1, active.length);
  const polyBandRatio = active.filter((frame) => frame.occupied_bands >= 6).length / Math.max(1, active.length);
  const balancedRatio = active.filter((frame) =>
    frame.low_ratio >= 0.16 &&
    frame.high_ratio >= 0.035 &&
    frame.occupied_bands >= 5
  ).length / Math.max(1, active.length);
  const speechDominanceRatio = active.filter((frame) =>
    frame.vocal_ratio >= 0.82 &&
    frame.low_ratio < 0.2 &&
    frame.high_ratio < 0.055
  ).length / Math.max(1, active.length);

  const envelope = frames.map((frame) => Math.max(0, frame.db - threshold));
  const onset = envelope.map((value, index) => index === 0 ? 0 : Math.max(0, value - envelope[index - 1]));
  const rhythmicity = autocorrelation(onset, 3, 12);

  const localMusic = frames.map((frame) => {
    if (frame.db < threshold) return false;
    const broad = frame.occupied_bands >= 5 && frame.high_ratio >= 0.03;
    const lowBed = frame.low_ratio >= 0.16;
    const speechOnly = frame.vocal_ratio >= 0.84 && frame.low_ratio < 0.18 && frame.high_ratio < 0.045;
    return broad && lowBed && !speechOnly;
  });

  const runWindow = Math.max(1, Math.round(MIN_RUN_SECONDS / WINDOW_SECONDS));
  let first = null;
  let last = null;
  for (let start = 0; start + runWindow <= localMusic.length; start += 1) {
    const ratio = localMusic.slice(start, start + runWindow).filter(Boolean).length / runWindow;
    if (ratio >= 0.72) {
      first = start;
      break;
    }
  }
  if (first !== null) {
    last = first + runWindow;
    let misses = 0;
    for (let index = last; index < localMusic.length; index += 1) {
      if (localMusic[index]) misses = 0;
      else misses += 1;
      if (misses >= 8) break;
      last = index + 1;
    }
  }

  const rawScore = 100 * (
    0.22 * clamp((activeRatio - 0.55) / 0.4) +
    0.24 * clamp((lowBedRatio - 0.18) / 0.55) +
    0.18 * clamp((highPresenceRatio - 0.18) / 0.55) +
    0.16 * clamp((polyBandRatio - 0.2) / 0.55) +
    0.10 * clamp((balancedRatio - 0.15) / 0.6) +
    0.10 * clamp((rhythmicity - 0.08) / 0.35) -
    0.25 * clamp((speechDominanceRatio - 0.25) / 0.6)
  );
  const score = Number(Math.max(0, Math.min(100, rawScore)).toFixed(3));
  const usableRange = first === null ? null : {
    start_seconds: Number(Math.max(0, first * WINDOW_SECONDS - 0.08).toFixed(3)),
    end_seconds: Number(Math.min(samples.length / RATE, last * WINDOW_SECONDS).toFixed(3)),
    duration_seconds: Number((
      Math.min(samples.length / RATE, last * WINDOW_SECONDS) -
      Math.max(0, first * WINDOW_SECONDS - 0.08)
    ).toFixed(3)),
  };

  const reasons = [];
  if (activeRatio < 0.65) reasons.push("INSUFFICIENT_SUSTAINED_AUDIO");
  if (lowBedRatio < 0.28) reasons.push("NO_PERSISTENT_LOW_FREQUENCY_MUSIC_BED");
  if (highPresenceRatio < 0.25) reasons.push("NO_PERSISTENT_HIGH_FREQUENCY_INSTRUMENT_CONTENT");
  if (polyBandRatio < 0.28) reasons.push("SPECTRUM_TOO_NARROW_FOR_MUSIC");
  if (speechDominanceRatio > 0.48) reasons.push("SPEECH_DOMINANT");
  if (!usableRange || usableRange.duration_seconds < MIN_RUN_SECONDS) reasons.push("NO_SUSTAINED_MUSIC_RUN");
  if (score < 58) reasons.push("MUSIC_SCORE_BELOW_58");

  return {
    classification: reasons.length === 0
      ? "MUSIC_BED_CONFIRMED"
      : speechDominanceRatio > 0.48
        ? "TALK_OR_STAGE_PREP"
        : "MUSIC_NOT_CONFIRMED",
    music_score: score,
    usable_range: reasons.length === 0 ? usableRange : null,
    active_ratio: Number(activeRatio.toFixed(3)),
    low_bed_ratio: Number(lowBedRatio.toFixed(3)),
    high_presence_ratio: Number(highPresenceRatio.toFixed(3)),
    poly_band_ratio: Number(polyBandRatio.toFixed(3)),
    balanced_ratio: Number(balancedRatio.toFixed(3)),
    speech_dominance_ratio: Number(speechDominanceRatio.toFixed(3)),
    rhythmicity: Number(rhythmicity.toFixed(3)),
    noise_floor_dbfs: Number(noiseFloor.toFixed(2)),
    activity_threshold_dbfs: Number(threshold.toFixed(2)),
    reasons,
  };
}

async function decode(filePath) {
  const result = await run("ffmpeg", [
    "-hide_banner", "-loglevel", "error",
    "-i", filePath,
    "-vn", "-ac", "1", "-ar", String(RATE),
    "-f", "s16le", "pipe:1",
  ], { allowFailure: true });
  return result.code === 0 ? pcm(result.stdout) : new Float64Array(0);
}

async function trim(input, range, output) {
  await run("ffmpeg", [
    "-hide_banner", "-loglevel", "error",
    "-ss", String(range.start_seconds),
    "-i", input,
    "-t", String(range.duration_seconds),
    "-c:v", "libx264", "-preset", "veryfast", "-crf", "23", "-pix_fmt", "yuv420p",
    "-c:a", "aac", "-b:a", "128k", "-movflags", "+faststart", "-y", output,
  ]);
}

function timeline(moments) {
  const ranked = [...moments].sort((left, right) => right.production_priority - left.production_priority);
  const targets = [0, 8, 4, 18, 8, 14, 18, 2];
  const titles = ["Cold open", "First glimpse", "Journey", "First chorus", "Story turn", "Second build", "Climax", "Resolution"];
  let cursor = 0;
  let total = 0;
  const sections = targets.map((target, index) => {
    let remaining = target;
    const cuts = [];
    while (remaining > 0.001 && cursor < ranked.length) {
      const moment = ranked[cursor];
      cursor += 1;
      const duration = Math.min(
        6,
        remaining,
        finite(moment.music_gate?.usable_range?.duration_seconds),
      );
      if (duration < 1.5) continue;
      cuts.push({
        moment_id: moment.id,
        review_number: moment.review_number,
        candidate_rank: moment.candidate_rank,
        duration_seconds: Number(duration.toFixed(3)),
        role: finite(moment.hero_duration_seconds) > 0 ? "HERO_PERFORMANCE" : "PERFORMANCE",
      });
      remaining -= duration;
      total += duration;
    }
    return {
      section: index + 1,
      title: titles[index],
      target_performance_seconds: target,
      allocated_performance_seconds: Number((target - remaining).toFixed(3)),
      shortfall_seconds: Number(Math.max(0, remaining).toFixed(3)),
      cuts,
    };
  });
  const allocated = Math.min(TARGET_PERFORMANCE_SECONDS, total);
  return {
    status: allocated >= TARGET_PERFORMANCE_SECONDS - 0.001
      ? "READY_FOR_HUMAN_REVIEW"
      : "INSUFFICIENT_MUSIC_CONFIRMED_COVERAGE",
    target_performance_seconds: TARGET_PERFORMANCE_SECONDS,
    allocated_performance_seconds: Number(allocated.toFixed(3)),
    allocated_narrative_seconds: Number((180 - allocated).toFixed(3)),
    shortfall_seconds: Number(Math.max(0, TARGET_PERFORMANCE_SECONDS - allocated).toFixed(3)),
    sections,
  };
}

function page(manifest) {
  const eligible = manifest.moments.map((moment) => `
    <article>
      <div class="media"><img src="${escapeHtml(moment.thumbnail_relative_path)}"><video controls src="${escapeHtml(moment.preview_clip_relative_path)}"></video></div>
      <h3>Range ${moment.review_number} | Candidate ${moment.candidate_rank}</h3>
      <p>Visual ${finite(moment.editorial_score).toFixed(1)} | Music ${moment.music_gate.music_score.toFixed(1)} | Speech dominance ${(moment.music_gate.speech_dominance_ratio * 100).toFixed(0)}% | Usable ${moment.music_gate.usable_range.duration_seconds.toFixed(2)}s</p>
      <label><input type="radio" name="decision-${escapeHtml(moment.id)}" value="APPROVE"> Approve</label>
      <label><input type="radio" name="decision-${escapeHtml(moment.id)}" value="HOLD" checked> Hold</label>
      <label><input type="radio" name="decision-${escapeHtml(moment.id)}" value="REJECT"> Reject</label>
      <textarea placeholder="Editorial notes"></textarea><code>${escapeHtml(moment.id)}</code>
    </article>`).join("");
  const excluded = manifest.excluded_moments.map((moment) => `
    <article class="excluded">
      <div class="media"><img src="${escapeHtml(moment.thumbnail_relative_path)}"><video controls src="${escapeHtml(moment.archive_clip_relative_path)}"></video></div>
      <h3>Archive range ${moment.review_number}</h3>
      <p>${escapeHtml(moment.music_gate.classification)} | Music ${moment.music_gate.music_score.toFixed(1)} | Speech dominance ${(moment.music_gate.speech_dominance_ratio * 100).toFixed(0)}%</p>
      <p>${escapeHtml(moment.exclusion_reasons.join(", "))}</p>
    </article>`).join("");
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Cole music-only review</title><style>body{margin:0;background:#050506;color:#f5ecdf;font:300 15px Arial}header,main{padding:32px 5vw}h1,h2{font-weight:300}.gold{color:#d6a66a}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(360px,1fr));gap:20px}article{background:#111115;border:1px solid #30271f;border-radius:16px;overflow:hidden;padding-bottom:18px}article>*:not(.media){margin-left:18px;margin-right:18px}.excluded{opacity:.62}.media{display:grid;grid-template-columns:1fr 1fr;background:#000}.media img,.media video{width:100%;height:220px;object-fit:contain}textarea{display:block;width:calc(100% - 36px);min-height:60px;background:#08080a;color:#fff;border:1px solid #30271f;margin-top:12px}code{display:block;color:#8b8178;font-size:10px;margin-top:8px;overflow-wrap:anywhere}.notice{border:1px solid #d6a66a;padding:15px;border-radius:12px}@media(max-width:700px){.media{grid-template-columns:1fr}}</style></head><body><header><h1>Cole Ley <span class="gold">Music-Only Review</span></h1><p>Speech-only and stage-preparation clips are excluded unless a sustained music bed is confirmed.</p><p>Eligible ${manifest.moments.length} | Archived ${manifest.excluded_moments.length} | Confirmed coverage ${manifest.music_confirmed_duration_seconds.toFixed(1)}s | Proposed performance ${manifest.timeline.allocated_performance_seconds.toFixed(1)}s</p></header><main><div class="notice">This strict local gate requires persistent low-frequency accompaniment, high-frequency instrument content, broad spectral occupancy and a sustained music run. Production remains locked.</div><h2>Music confirmed</h2><div class="grid">${eligible || "<p>No clips passed the strict gate.</p>"}</div><h2>Talk / ambiguous archive</h2><div class="grid">${excluded}</div></main></body></html>`;
}

const requestedPackage = text(process.env.COLE_AUDIO_REFINED_PACKAGE_DIR || process.argv[2]);
const sourcePackage = requestedPackage
  ? path.resolve(requestedPackage)
  : await latestAudioPackage();
if (!sourcePackage) {
  throw new Error("COLE_AUDIO_REFINED_PACKAGE_DIR_REQUIRED_OR_NO_LATEST_PACKAGE_FOUND");
}
if ((await run("ffmpeg", ["-version"], { allowFailure: true })).code !== 0) {
  throw new Error("FFMPEG_REQUIRED");
}

const sourceManifest = JSON.parse(
  await fs.readFile(path.join(sourcePackage, "manifest.json"), "utf8"),
);
if (!Array.isArray(sourceManifest.moments) || !sourceManifest.moments.length) {
  throw new Error("SOURCE_MANIFEST_MOMENTS_REQUIRED");
}
if (sourceManifest.production_started === true) {
  throw new Error("PRODUCTION_MUST_REMAIN_LOCKED");
}

const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
const output = path.resolve(
  text(process.env.COLE_MUSIC_GATE_OUTPUT_DIR) ||
  `${sourcePackage}_MUSIC_ONLY_${timestamp}`,
);
const previewDirectory = path.join(output, "preview-clips");
const archiveDirectory = path.join(output, "archive-clips");
const cardDirectory = path.join(output, "cards");
await Promise.all([
  fs.mkdir(previewDirectory, { recursive: true }),
  fs.mkdir(archiveDirectory, { recursive: true }),
  fs.mkdir(cardDirectory, { recursive: true }),
]);

const eligible = [];
const excluded = [];
const audit = [];
for (const moment of sourceManifest.moments) {
  const input = path.resolve(sourcePackage, moment.preview_clip_relative_path);
  const thumbnail = path.resolve(sourcePackage, moment.thumbnail_relative_path);
  const gate = analyse(await decode(input));
  const reasons = [];
  if (finite(moment.editorial_score) < MIN_VISUAL_SCORE) {
    reasons.push("VISUAL_SCORE_BELOW_55");
  }
  if (gate.classification !== "MUSIC_BED_CONFIRMED") {
    reasons.push(gate.classification);
  }
  reasons.push(...gate.reasons);
  const uniqueReasons = [...new Set(reasons)];
  const pass = uniqueReasons.length === 0;
  const stem = `${String(moment.review_number).padStart(2, "0")}-${safe(moment.id)}`;
  const cardOutput = path.join(cardDirectory, `${stem}.jpg`);
  await fs.copyFile(thumbnail, cardOutput);

  if (pass) {
    const previewOutput = path.join(previewDirectory, `${stem}.mp4`);
    await trim(input, gate.usable_range, previewOutput);
    eligible.push({
      ...moment,
      thumbnail_relative_path: path.relative(output, cardOutput),
      preview_clip_relative_path: path.relative(output, previewOutput),
      music_gate: gate,
      production_priority: Number((
        finite(moment.editorial_score) * 0.5 +
        gate.music_score * 0.4 +
        (finite(moment.hero_duration_seconds) > 0 ? 10 : 0)
      ).toFixed(3)),
      human_decision: "HOLD",
      production_started: false,
    });
  } else {
    const archiveOutput = path.join(archiveDirectory, `${stem}.mp4`);
    await fs.copyFile(input, archiveOutput);
    excluded.push({
      ...moment,
      thumbnail_relative_path: path.relative(output, cardOutput),
      archive_clip_relative_path: path.relative(output, archiveOutput),
      music_gate: gate,
      exclusion_reasons: uniqueReasons,
      human_decision: "REJECT",
      production_started: false,
    });
  }

  audit.push({
    moment_id: moment.id,
    review_number: moment.review_number,
    candidate_rank: moment.candidate_rank,
    editorial_score: moment.editorial_score,
    music_gate: gate,
    production_eligible: pass,
    exclusion_reasons: uniqueReasons,
  });
  console.log(
    `MUSIC_GATE_RANGE=${moment.review_number} ` +
    `STATUS=${pass ? "ELIGIBLE" : "EXCLUDED"} ` +
    `CLASS=${gate.classification} ` +
    `MUSIC=${gate.music_score.toFixed(1)} ` +
    `SPEECH=${(gate.speech_dominance_ratio * 100).toFixed(0)}%`,
  );
}

eligible.sort((left, right) => right.production_priority - left.production_priority);
excluded.sort((left, right) => finite(left.review_number) - finite(right.review_number));
const proposedTimeline = timeline(eligible);
const manifest = {
  package_version: "cole-music-bed-gated-editorial-package-v1",
  generated_at: new Date().toISOString(),
  source_package_dir: sourcePackage,
  organization_id: sourceManifest.organization_id,
  creative_project_id: sourceManifest.creative_project_id,
  project_name: sourceManifest.project_name,
  project_shortlist_identity: sourceManifest.project_shortlist_identity,
  dense_semantic_plan_identity: sourceManifest.dense_semantic_plan_identity,
  review_status: "AWAITING_MUSIC_GATED_HUMAN_APPROVAL",
  human_approval_required: true,
  production_started: false,
  provider_calls_executed: 0,
  wallet_charges_created: 0,
  database_writes: 0,
  classifier_scope: "LOCAL_STRICT_MUSIC_BED_CONFIRMATION_NOT_SEMANTIC_SONG_RECOGNITION",
  source_moment_count: sourceManifest.moments.length,
  eligible_moment_count: eligible.length,
  excluded_moment_count: excluded.length,
  music_confirmed_duration_seconds: sum(
    eligible.map((moment) => moment.music_gate.usable_range.duration_seconds),
  ),
  moments: eligible,
  excluded_moments: excluded,
  timeline: proposedTimeline,
};
const decisions = {
  package_version: manifest.package_version,
  creative_project_id: manifest.creative_project_id,
  status: "DRAFT",
  approved_by: null,
  approved_at: null,
  overall_decision: "HOLD",
  story_structure_decision: "HOLD",
  production_authorized: false,
  notes: "",
  range_decisions: eligible.map((moment) => ({
    moment_id: moment.id,
    review_number: moment.review_number,
    candidate_rank: moment.candidate_rank,
    decision: "HOLD",
    allowed_roles: [],
    notes: "",
  })),
};

await Promise.all([
  fs.writeFile(
    path.join(output, "manifest.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
  ),
  fs.writeFile(
    path.join(output, "approval-decisions.json"),
    `${JSON.stringify(decisions, null, 2)}\n`,
  ),
  fs.writeFile(
    path.join(output, "music-gate-audit.json"),
    `${JSON.stringify(audit, null, 2)}\n`,
  ),
  fs.writeFile(
    path.join(output, "story-timeline-proposal.json"),
    `${JSON.stringify(proposedTimeline, null, 2)}\n`,
  ),
  fs.writeFile(path.join(output, "index.html"), page(manifest)),
]);

console.log("============================================================");
console.log("COLE STRICT MUSIC-BED PACKAGE COMPLETE");
console.log("============================================================");
console.log(`SOURCE_PACKAGE_DIR=${sourcePackage}`);
console.log(`PACKAGE_DIR=${output}`);
console.log(`INDEX_HTML=${path.join(output, "index.html")}`);
console.log(`SOURCE_RANGE_COUNT=${sourceManifest.moments.length}`);
console.log(`MUSIC_CONFIRMED_RANGE_COUNT=${eligible.length}`);
console.log(`TALK_OR_AMBIGUOUS_ARCHIVE_COUNT=${excluded.length}`);
console.log(`MUSIC_CONFIRMED_DURATION_SECONDS=${manifest.music_confirmed_duration_seconds}`);
console.log(`PROPOSED_PERFORMANCE_SECONDS=${proposedTimeline.allocated_performance_seconds}`);
console.log(`PROPOSED_NARRATIVE_SECONDS=${proposedTimeline.allocated_narrative_seconds}`);
console.log(`PERFORMANCE_SHORTFALL_SECONDS=${proposedTimeline.shortfall_seconds}`);
console.log(`TIMELINE_STATUS=${proposedTimeline.status}`);
console.log("HUMAN_APPROVAL_REQUIRED=YES");
console.log("PROVIDER_CALLS_EXECUTED=0");
console.log("WALLET_CHARGES_CREATED=0");
console.log("DATABASE_WRITES=0");
console.log("PRODUCTION_STARTED=NO");
console.log("============================================================");

if (
  process.platform === "darwin" &&
  process.env.COLE_MUSIC_GATE_AUTO_OPEN !== "NO"
) {
  const opener = spawn("open", [path.join(output, "index.html")], {
    detached: true,
    stdio: "ignore",
  });
  opener.unref();
}
