#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";

function text(value) {
  return String(value ?? "").trim();
}

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function upper(value) {
  return text(value).toUpperCase();
}

function percentile(values, ratio) {
  const numbers = values
    .map(Number)
    .filter(Number.isFinite)
    .sort((left, right) => left - right);
  if (!numbers.length) return null;
  const position = (numbers.length - 1) * ratio;
  const lower = Math.floor(position);
  const higher = Math.ceil(position);
  if (lower === higher) return numbers[lower];
  return numbers[lower] + (numbers[higher] - numbers[lower]) * (position - lower);
}

function stats(values) {
  const numbers = values.map(Number).filter(Number.isFinite);
  if (!numbers.length) {
    return { count: 0, minimum: null, p25: null, median: null, p75: null, maximum: null };
  }
  return {
    count: numbers.length,
    minimum: Math.min(...numbers),
    p25: Number(percentile(numbers, 0.25).toFixed(3)),
    median: Number(percentile(numbers, 0.5).toFixed(3)),
    p75: Number(percentile(numbers, 0.75).toFixed(3)),
    maximum: Math.max(...numbers),
  };
}

function rawAnalysis(frame) {
  return frame?.recovered_analysis || frame?.analysis || null;
}

function scoreScale(analysis) {
  if (!analysis) return 1;
  const values = [
    analysis.face_visibility_score,
    analysis.technical_quality_score,
    analysis.performance_energy_score,
  ].map((value) => finite(value, null)).filter((value) => value !== null);
  if (!values.length) return 1;
  const minimum = Math.min(...values);
  const maximum = Math.max(...values);
  return minimum >= 0 && maximum <= 10 ? 10 : 1;
}

function canonicalAnalysis(frame) {
  const analysis = rawAnalysis(frame);
  if (!analysis) return null;
  const scale = scoreScale(analysis);
  return {
    ...analysis,
    face_visibility_score: Math.min(100, Math.max(0,
      finite(analysis.face_visibility_score) * scale)),
    technical_quality_score: Math.min(100, Math.max(0,
      finite(analysis.technical_quality_score) * scale)),
    performance_energy_score: Math.min(100, Math.max(0,
      finite(analysis.performance_energy_score) * scale)),
    source_score_scale: scale === 10 ? "0_10" : "0_100",
    score_multiplier: scale,
  };
}

function completed(frame) {
  return upper(frame?.step_status || frame?.status || "COMPLETED") === "COMPLETED";
}

function verified(frame) {
  return completed(frame) && upper(canonicalAnalysis(frame)?.status) === "VERIFIED";
}

function nonHighOcclusion(frame) {
  return upper(canonicalAnalysis(frame)?.occlusion_risk) !== "HIGH";
}

function candidateDuration(frames) {
  const estimates = frames
    .map((frame) => {
      const relative = finite(frame.relative_time_seconds, NaN);
      const fraction = finite(frame.sample_fraction, NaN);
      return Number.isFinite(relative) && Number.isFinite(fraction) && fraction > 0
        ? relative / fraction
        : NaN;
    })
    .filter(Number.isFinite);
  if (estimates.length) return percentile(estimates, 0.5);
  const points = frames
    .map((frame) => finite(frame.relative_time_seconds, NaN))
    .filter(Number.isFinite)
    .sort((left, right) => left - right);
  if (!points.length) return 0;
  if (points.length === 1) return points[0] * 2;
  const gaps = [];
  for (let index = 1; index < points.length; index += 1) {
    gaps.push(points[index] - points[index - 1]);
  }
  return points.at(-1) + percentile(gaps, 0.5);
}

function rangesFor(frames, predicate) {
  const ordered = [...frames].sort(
    (left, right) => finite(left.sample_index) - finite(right.sample_index),
  );
  const duration = candidateDuration(ordered);
  if (!ordered.length || duration <= 0) return [];
  const points = ordered.map((frame) => finite(frame.relative_time_seconds));
  const cells = ordered.map((frame, index) => ({
    accepted: predicate(frame),
    sample_index: finite(frame.sample_index, index),
    start_seconds: index === 0
      ? 0
      : (points[index - 1] + points[index]) / 2,
    end_seconds: index === ordered.length - 1
      ? duration
      : (points[index] + points[index + 1]) / 2,
  }));
  const groups = [];
  for (const cell of cells) {
    if (!cell.accepted) continue;
    const previous = groups.at(-1);
    if (previous && Math.abs(previous.end_seconds - cell.start_seconds) <= 0.001) {
      previous.end_seconds = cell.end_seconds;
      previous.sample_indexes.push(cell.sample_index);
    } else {
      groups.push({
        start_seconds: cell.start_seconds,
        end_seconds: cell.end_seconds,
        sample_indexes: [cell.sample_index],
      });
    }
  }
  return groups
    .map((group) => ({
      start_seconds: Number(group.start_seconds.toFixed(6)),
      end_seconds: Number(group.end_seconds.toFixed(6)),
      duration_seconds: Number((group.end_seconds - group.start_seconds).toFixed(6)),
      sample_count: group.sample_indexes.length,
      sample_indexes: group.sample_indexes,
    }))
    .filter((range) => range.duration_seconds >= 0.75);
}

function candidateEvidence(frames) {
  const completedFrames = frames.filter(completed);
  const directLeadFrames = completedFrames.filter((frame) => {
    const analysis = canonicalAnalysis(frame);
    return Boolean(
      verified(frame) &&
      analysis?.primary_performer_present === true &&
      analysis?.lead_vocalist_present === true &&
      analysis?.microphone_visible === true &&
      nonHighOcclusion(frame)
    );
  });
  const primaryFrames = completedFrames.filter(
    (frame) => canonicalAnalysis(frame)?.primary_performer_present === true,
  );
  const leadFrames = completedFrames.filter(
    (frame) => canonicalAnalysis(frame)?.lead_vocalist_present === true,
  );
  const directRatio = directLeadFrames.length / Math.max(1, completedFrames.length);
  const primaryRatio = primaryFrames.length / Math.max(1, completedFrames.length);
  const leadRatio = leadFrames.length / Math.max(1, completedFrames.length);
  const established =
    directLeadFrames.length >= 2 ||
    (directLeadFrames.length >= 1 && directRatio >= 0.1 && primaryRatio >= 0.6 && leadRatio >= 0.5);
  return {
    established,
    completed_frame_count: completedFrames.length,
    direct_lead_frame_count: directLeadFrames.length,
    direct_lead_ratio: Number(directRatio.toFixed(6)),
    primary_ratio: Number(primaryRatio.toFixed(6)),
    lead_ratio: Number(leadRatio.toFixed(6)),
  };
}

const inputPath = text(
  process.env.COLE_RAW_PREVIEW_JSON || process.argv[2],
);
if (!inputPath) throw new Error("COLE_RAW_PREVIEW_JSON required");
const absolutePath = path.resolve(inputPath);
const report = JSON.parse(await fs.readFile(absolutePath, "utf8"));
const candidates = Array.isArray(report.candidates) ? report.candidates : [];
if (!candidates.length) throw new Error("COLE_RAW_PREVIEW_CANDIDATES_REQUIRED");

const allFrames = candidates.flatMap((candidate) => candidate.frames || []);
const scaleCounts = { zero_to_ten: 0, zero_to_hundred: 0, missing: 0 };
for (const frame of allFrames) {
  const analysis = rawAnalysis(frame);
  if (!analysis) scaleCounts.missing += 1;
  else if (scoreScale(analysis) === 10) scaleCounts.zero_to_ten += 1;
  else scaleCounts.zero_to_hundred += 1;
}

const policies = {
  STRICT_ORIGINAL: (frame, evidence) => {
    const analysis = canonicalAnalysis(frame);
    return Boolean(
      evidence.established &&
      verified(frame) &&
      analysis?.primary_performer_present === true &&
      analysis?.lead_vocalist_present === true &&
      analysis?.usable_for_showreel === true &&
      analysis?.technical_quality_score >= 55 &&
      nonHighOcclusion(frame)
    );
  },
  HERO: (frame, evidence) => {
    const analysis = canonicalAnalysis(frame);
    const framing = upper(analysis?.framing);
    return Boolean(
      evidence.established &&
      verified(frame) &&
      analysis?.primary_performer_present === true &&
      analysis?.lead_vocalist_present === true &&
      analysis?.microphone_visible === true &&
      analysis?.usable_for_showreel === true &&
      analysis?.technical_quality_score >= 55 &&
      analysis?.face_visibility_score >= 50 &&
      analysis?.performance_energy_score >= 45 &&
      nonHighOcclusion(frame) &&
      ["CLOSE_UP", "MEDIUM"].includes(framing)
    );
  },
  PERFORMANCE: (frame, evidence) => {
    const analysis = canonicalAnalysis(frame);
    return Boolean(
      evidence.established &&
      verified(frame) &&
      analysis?.primary_performer_present === true &&
      (analysis?.lead_vocalist_present === true || analysis?.microphone_visible === true) &&
      analysis?.technical_quality_score >= 45 &&
      nonHighOcclusion(frame)
    );
  },
  CONTEXT: (frame, evidence) => {
    const analysis = canonicalAnalysis(frame);
    return Boolean(
      evidence.established &&
      verified(frame) &&
      analysis?.technical_quality_score >= 40 &&
      nonHighOcclusion(frame)
    );
  },
};

console.log("============================================================");
console.log("COLE CANONICAL SCORE-SCALE PREVIEW — ZERO COST");
console.log("============================================================");
console.log(`INPUT_JSON=${absolutePath}`);
console.log(`CANDIDATE_COUNT=${candidates.length}`);
console.log(`FRAME_COUNT=${allFrames.length}`);
console.log(`SCORE_SCALE_0_10_FRAME_COUNT=${scaleCounts.zero_to_ten}`);
console.log(`SCORE_SCALE_0_100_FRAME_COUNT=${scaleCounts.zero_to_hundred}`);
console.log(`MISSING_ANALYSIS_FRAME_COUNT=${scaleCounts.missing}`);
console.log(`RAW_TECHNICAL_QUALITY_STATS=${JSON.stringify(stats(
  allFrames.map((frame) => rawAnalysis(frame)?.technical_quality_score),
))}`);
console.log(`CANONICAL_TECHNICAL_QUALITY_STATS=${JSON.stringify(stats(
  allFrames.map((frame) => canonicalAnalysis(frame)?.technical_quality_score),
))}`);
console.log(`CANONICAL_FACE_VISIBILITY_STATS=${JSON.stringify(stats(
  allFrames.map((frame) => canonicalAnalysis(frame)?.face_visibility_score),
))}`);
console.log(`CANONICAL_PERFORMANCE_ENERGY_STATS=${JSON.stringify(stats(
  allFrames.map((frame) => canonicalAnalysis(frame)?.performance_energy_score),
))}`);
console.log("------------------------------------------------------------");

const totals = Object.fromEntries(Object.keys(policies).map((name) => [name, {
  accepted_frames: 0,
  qualifying_candidates: 0,
  qualifying_ranges: 0,
  qualifying_seconds: 0,
}]));
let establishedCandidateCount = 0;

for (const candidate of candidates) {
  const frames = candidate.frames || [];
  const evidence = candidateEvidence(frames);
  if (evidence.established) establishedCandidateCount += 1;
  const roleResults = {};
  for (const [name, predicate] of Object.entries(policies)) {
    const acceptedFrames = frames.filter((frame) => predicate(frame, evidence));
    const ranges = rangesFor(frames, (frame) => predicate(frame, evidence));
    const seconds = Number(ranges.reduce(
      (sum, range) => sum + range.duration_seconds,
      0,
    ).toFixed(6));
    roleResults[name] = {
      accepted_frames: acceptedFrames.length,
      ranges: ranges.length,
      seconds,
    };
    totals[name].accepted_frames += acceptedFrames.length;
    if (ranges.length) totals[name].qualifying_candidates += 1;
    totals[name].qualifying_ranges += ranges.length;
    totals[name].qualifying_seconds += seconds;
  }
  console.log([
    `CANDIDATE=${candidate.candidate_id}`,
    `RANK=${candidate.shortlist_rank ?? ""}`,
    `FRAMES=${frames.length}`,
    `PERFORMANCE_ESTABLISHED=${evidence.established ? "YES" : "NO"}`,
    `DIRECT_LEAD_FRAMES=${evidence.direct_lead_frame_count}`,
    `PRIMARY_RATIO=${evidence.primary_ratio}`,
    `LEAD_RATIO=${evidence.lead_ratio}`,
    `HERO_SECONDS=${roleResults.HERO.seconds.toFixed(3)}`,
    `PERFORMANCE_SECONDS=${roleResults.PERFORMANCE.seconds.toFixed(3)}`,
    `CONTEXT_SECONDS=${roleResults.CONTEXT.seconds.toFixed(3)}`,
  ].join(" "));
}

console.log("------------------------------------------------------------");
console.log(`ESTABLISHED_CANDIDATE_COUNT=${establishedCandidateCount}`);
for (const [name, value] of Object.entries(totals)) {
  console.log([
    `POLICY=${name}`,
    `ACCEPTED_FRAMES=${value.accepted_frames}`,
    `QUALIFYING_CANDIDATES=${value.qualifying_candidates}`,
    `QUALIFYING_RANGES=${value.qualifying_ranges}`,
    `QUALIFYING_SECONDS=${value.qualifying_seconds.toFixed(3)}`,
  ].join(" "));
}
console.log("============================================================");
console.log("PROVIDER_CALLS=0");
console.log("WALLET_CHARGES=0");
console.log("DATABASE_WRITES=0");
console.log("PRODUCTION_STARTED=NO");
console.log("============================================================");
