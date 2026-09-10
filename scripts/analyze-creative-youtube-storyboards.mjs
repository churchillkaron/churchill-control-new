import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputPath = path.join(root, "audits/results/creative-reference-storyboard-benchmark.json");
const REFERENCES = [
  { id: "sitXeGjm4Mc", role: "MYSTERY_REVEAL_EFFECTS" },
  { id: "5wjBHDogyko", role: "LUXURY_CONTINUITY_REVEAL" },
  { id: "vr8NwCFjGa0", role: "ENGINEERED_MOTION_SCALE" },
  { id: "Slz3lJcqfd4", role: "TACTILE_MECHANICAL_DETAIL" },
  { id: "lnjSaGxfZ1g", role: "DOCUMENTARY_TRUTH_PLACE_HUMANITY" },
];

async function youtubePlayer(id) {
  const response = await fetch(`https://www.youtube.com/watch?v=${id}`, {
    headers: { "user-agent": "Mozilla/5.0" },
  });
  if (!response.ok) throw new Error(`YOUTUBE_PAGE_${response.status}`);
  const html = await response.text();
  const match = html.match(/ytInitialPlayerResponse\s*=\s*({.+?});\s*<\/script>/s);
  if (!match) throw new Error("YOUTUBE_PLAYER_RESPONSE_MISSING");
  return JSON.parse(match[1]);
}function storyboardLevel(player) {
  const spec = player.storyboards?.playerStoryboardSpecRenderer?.spec;
  if (!spec) throw new Error("YOUTUBE_STORYBOARD_SPEC_MISSING");
  const parts = spec.split("|");
  const base = parts.shift();
  const levels = parts.reverse();
  const L = levels.length - 1;
  const parsed = levels.map((value, index) => {
    const args = value.split("#");
    if (args.length !== 8) throw new Error("YOUTUBE_STORYBOARD_LEVEL_MALFORMED");
    const [width, height, frameCount, cols, rows, intervalMs] = args.slice(0, 6).map(Number);
    const [name, sigh] = args.slice(6);
    const url = `${base.replace("$L", String(L - index)).replace("$N", name)}&sigh=${sigh}`;
    return { width, height, frameCount, cols, rows, intervalMs, url };
  });
  return parsed.sort((a, b) => b.width - a.width)[0];
}

async function tileData(sprite, left, top, width, height) {
  const { data } = await sharp(sprite)
    .extract({ left, top, width, height })
    .resize(64, 36, { fit: "fill" })
    .greyscale()
    .raw()
    .toBuffer({ resolveWithObject: true });
  let sum = 0;
  for (const value of data) sum += value;
  const mean = sum / data.length;
  let variance = 0;
  for (const value of data) variance += (value - mean) ** 2;
  return { pixels: data, mean, stdev: Math.sqrt(variance / data.length) };
}

function difference(left, right) {
  let sum = 0;
  for (let index = 0; index < left.length; index += 1) sum += Math.abs(left[index] - right[index]);
  return sum / left.length;
}async function storyboardFrames(level) {
  const frames = [];
  const perSprite = level.cols * level.rows;
  const spriteCount = Math.ceil(level.frameCount / perSprite);
  for (let spriteIndex = 0; spriteIndex < spriteCount; spriteIndex += 1) {
    const url = level.url.replace("$M", String(spriteIndex));
    const response = await fetch(url, { headers: { "user-agent": "Mozilla/5.0" } });
    if (!response.ok) throw new Error(`YOUTUBE_STORYBOARD_SPRITE_${response.status}`);
    const sprite = Buffer.from(await response.arrayBuffer());
    for (let tileIndex = 0; tileIndex < perSprite && frames.length < level.frameCount; tileIndex += 1) {
      const column = tileIndex % level.cols;
      const row = Math.floor(tileIndex / level.cols);
      frames.push(await tileData(sprite, column * level.width, row * level.height, level.width, level.height));
    }
  }
  return frames;
}

function percentile(sorted, ratio) {
  if (!sorted.length) return null;
  const index = (sorted.length - 1) * ratio;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return sorted[lower];
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (index - lower);
}

function numericSummary(values) {
  if (!values.length) return { count: 0, min: null, max: null, mean: null, median: null, stdev: null, p25: null, p75: null, p90: null };
  const sorted = [...values].sort((a, b) => a - b);
  const mean = sorted.reduce((sum, value) => sum + value, 0) / sorted.length;
  const variance = sorted.reduce((sum, value) => sum + (value - mean) ** 2, 0) / sorted.length;
  return {
    count: sorted.length,
    min: Number(sorted[0].toFixed(3)),
    max: Number(sorted.at(-1).toFixed(3)),
    mean: Number(mean.toFixed(3)),
    median: Number(percentile(sorted, 0.5).toFixed(3)),
    stdev: Number(Math.sqrt(variance).toFixed(3)),
    p25: Number(percentile(sorted, 0.25).toFixed(3)),
    p75: Number(percentile(sorted, 0.75).toFixed(3)),
    p90: Number(percentile(sorted, 0.9).toFixed(3)),
  };
}

async function analyzeReference(reference) {
  const player = await youtubePlayer(reference.id);
  const level = storyboardLevel(player);
  const frames = await storyboardFrames(level);
  const brightness = frames.map((frame) => frame.mean);
  const contrast = frames.map((frame) => frame.stdev);
  const changes = frames.slice(1).map((frame, index) => difference(frames[index].pixels, frame.pixels));
  const sortedChanges = [...changes].sort((a, b) => a - b);
  const threshold = percentile(sortedChanges, 0.75) ?? 0;
  const strongChanges = changes.map((value, index) => ({ value, at_seconds: (index + 1) * level.intervalMs / 1000 })).filter((item) => item.value >= threshold && item.value >= 18);
  const blackFrames = brightness.map((value, index) => ({ value, at_seconds: index * level.intervalMs / 1000 })).filter((item) => item.value <= 18);
  const lowChangeThreshold = 8;
  let currentLowChangeRun = 0;
  let longestLowChangeRun = 0;
  for (const value of changes) {
    currentLowChangeRun = value < lowChangeThreshold ? currentLowChangeRun + 1 : 0;
    longestLowChangeRun = Math.max(longestLowChangeRun, currentLowChangeRun);
  }
  let darkToBrightTransitions = 0;
  for (let index = 1; index < brightness.length; index += 1) {
    if (brightness[index - 1] <= 20 && brightness[index] >= 45) darkToBrightTransitions += 1;
  }
  return {
    ...reference,
    title: player.videoDetails?.title || null,
    duration_seconds: Number(player.videoDetails?.lengthSeconds || 0),
    source_kind: "YOUTUBE_PUBLIC_STORYBOARD",
    evidence_grade: "PARTIAL_VISUAL_2S_SAMPLING",
    sample_interval_seconds: level.intervalMs / 1000,
    sample_count: frames.length,
    brightness: numericSummary(brightness),
    contrast: numericSummary(contrast),
    adjacent_visual_change: numericSummary(changes),
    strong_visual_change_count: strongChanges.length,
    strong_visual_changes: strongChanges.map((item) => ({ at_seconds: Number(item.at_seconds.toFixed(3)), score: Number(item.value.toFixed(3)) })),
    low_change_threshold: lowChangeThreshold,
    longest_low_change_run_samples: longestLowChangeRun,
    longest_low_change_run_seconds: Number((longestLowChangeRun * level.intervalMs / 1000).toFixed(3)),
    dark_to_bright_transition_count: darkToBrightTransitions,
    luminance_range: Number((Math.max(...brightness) - Math.min(...brightness)).toFixed(3)),
    contrast_range: Number((Math.max(...contrast) - Math.min(...contrast)).toFixed(3)),
    sampled_black_frame_count: blackFrames.length,
    sampled_black_frames: blackFrames.map((item) => ({ at_seconds: Number(item.at_seconds.toFixed(3)), brightness: Number(item.value.toFixed(3)) })),
  };
}const references = [];
for (const reference of REFERENCES) {
  try {
    references.push(await analyzeReference(reference));
  } catch (error) {
    references.push({ ...reference, source_kind: "YOUTUBE_PUBLIC_STORYBOARD", available: false, blocker: String(error?.message || error) });
  }
}

const allAvailable = references.every((item) => item.available !== false && item.sample_count > 0);
const maxInterval = Math.max(...references.map((item) => Number(item.sample_interval_seconds || Infinity)));
const measured = references.filter((item) => item.available !== false && item.sample_count > 0);
const sharedEnvelope = measured.length ? {
  minimum_luminance_range: Math.min(...measured.map((item) => item.luminance_range)),
  minimum_contrast_range: Math.min(...measured.map((item) => item.contrast_range)),
  minimum_adjacent_visual_change_mean: Math.min(...measured.map((item) => item.adjacent_visual_change.mean)),
  minimum_adjacent_visual_change_p75: Math.min(...measured.map((item) => item.adjacent_visual_change.p75)),
  maximum_longest_low_change_run_seconds: Math.max(...measured.map((item) => item.longest_low_change_run_seconds)),
  minimum_dark_to_bright_transition_count: Math.min(...measured.map((item) => item.dark_to_bright_transition_count)),
} : null;
const result = {
  contract: "CREATIVE_CINEMATIC_PUBLIC_STORYBOARD_BENCHMARK_V1",
  generated_at: new Date().toISOString(),
  measurement_mode: "PUBLIC_YOUTUBE_STORYBOARD_VISUAL_SAMPLING",
  evidence_grade: "PARTIAL_VISUAL_ONLY",
  visual_measurements_verified: allAvailable,
  full_reference_measurements_verified: false,
  audio_measurements_verified: false,
  maximum_sample_interval_seconds: Number.isFinite(maxInterval) ? maxInterval : null,
  provider_calls_executed: 0,
  media_generation_executed: 0,
  shared_visual_envelope: sharedEnvelope,
  references,
};

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify(result, null, 2));
process.exitCode = allAvailable ? 0 : 2;
