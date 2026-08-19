const FRAME_POINTS = 18;
const FEATURE_SIZE = 5;
const DEFAULT_THRESHOLD = 0.2;
const MAX_THRESHOLD = 0.24;
const MIN_DURATION_RATIO = 0.62;
const MAX_DURATION_RATIO = 1.55;
const ENROLLMENT_SCORE_MULTIPLIER = 1.45;
const ENROLLMENT_SCORE_MARGIN = 0.035;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function euclidean(a = [], b = []) {
  let sum = 0;
  const length = Math.min(a.length, b.length);
  for (let index = 0; index < length; index += 1) {
    const delta = finite(a[index]) - finite(b[index]);
    sum += delta * delta;
  }
  return Math.sqrt(sum / Math.max(1, length));
}

function interpolateFrame(frames, position) {
  if (!frames.length) return Array(FEATURE_SIZE).fill(0);
  if (frames.length === 1) return frames[0].slice(0, FEATURE_SIZE);

  const scaled = clamp(position, 0, 1) * (frames.length - 1);
  const leftIndex = Math.floor(scaled);
  const rightIndex = Math.min(frames.length - 1, leftIndex + 1);
  const amount = scaled - leftIndex;
  const left = frames[leftIndex];
  const right = frames[rightIndex];

  return Array.from({ length: FEATURE_SIZE }, (_, index) =>
    finite(left?.[index]) * (1 - amount) + finite(right?.[index]) * amount,
  );
}

function median(values = []) {
  const clean = values
    .map((value) => finite(value))
    .filter((value) => value > 0)
    .sort((a, b) => a - b);
  if (!clean.length) return 0;
  const middle = Math.floor(clean.length / 2);
  return clean.length % 2
    ? clean[middle]
    : (clean[middle - 1] + clean[middle]) / 2;
}

function normalizedFrameDistance(a = [], b = []) {
  if (a.length !== FRAME_POINTS || b.length !== FRAME_POINTS) return 1;

  let sum = 0;
  for (let index = 0; index < FRAME_POINTS; index += 1) {
    sum += euclidean(a[index], b[index]);
  }
  return sum / FRAME_POINTS;
}

function resolvedThreshold(template) {
  const stored = finite(template?.threshold, DEFAULT_THRESHOLD);
  return clamp(
    Math.max(DEFAULT_THRESHOLD, stored),
    DEFAULT_THRESHOLD,
    MAX_THRESHOLD,
  );
}

export function normalizeWakeFrames(frames = []) {
  const clean = frames
    .filter((frame) => Array.isArray(frame) && frame.length >= FEATURE_SIZE)
    .map((frame) => frame.slice(0, FEATURE_SIZE).map((value) => finite(value)));

  if (clean.length < 4) return [];

  return Array.from({ length: FRAME_POINTS }, (_, index) =>
    interpolateFrame(clean, index / (FRAME_POINTS - 1)),
  );
}

export function createWakeFeatureFrame({ analyser, rms }) {
  if (!analyser) return null;

  const bins = new Uint8Array(analyser.frequencyBinCount);
  analyser.getByteFrequencyData(bins);
  if (!bins.length) return null;

  let total = 0;
  let weighted = 0;
  let low = 0;
  let mid = 0;
  let high = 0;

  for (let index = 0; index < bins.length; index += 1) {
    const value = bins[index] / 255;
    total += value;
    weighted += value * (index / Math.max(1, bins.length - 1));

    const ratio = index / bins.length;
    if (ratio < 0.18) low += value;
    else if (ratio < 0.5) mid += value;
    else high += value;
  }

  const safeTotal = Math.max(total, 0.0001);

  return [
    clamp(finite(rms) * 8, 0, 1),
    clamp(weighted / safeTotal, 0, 1),
    clamp(low / safeTotal, 0, 1),
    clamp(mid / safeTotal, 0, 1),
    clamp(high / safeTotal, 0, 1),
  ];
}

export function averageWakeTemplates(samples = []) {
  const prepared = samples
    .map((sample) => ({
      frames: normalizeWakeFrames(sample?.frames || sample),
      duration_ms: finite(sample?.duration_ms),
    }))
    .filter((sample) => sample.frames.length === FRAME_POINTS);

  if (prepared.length < 3) return null;

  const durations = prepared.map((sample) => sample.duration_ms).filter(Boolean);
  const durationMs = median(durations);

  if (durations.length >= 3) {
    const minDuration = Math.min(...durations);
    const maxDuration = Math.max(...durations);
    if (
      durationMs < 450 ||
      durationMs > 2600 ||
      minDuration / maxDuration < 0.62
    ) {
      return null;
    }
  }

  const frames = Array.from({ length: FRAME_POINTS }, (_, frameIndex) =>
    Array.from({ length: FEATURE_SIZE }, (_, featureIndex) => {
      const sum = prepared.reduce(
        (total, sample) =>
          total + finite(sample.frames[frameIndex]?.[featureIndex]),
        0,
      );
      return sum / prepared.length;
    }),
  );

  const enrollmentScores = prepared.map((sample) =>
    normalizedFrameDistance(sample.frames, frames),
  );
  const highestEnrollmentScore = enrollmentScores.length
    ? Math.max(...enrollmentScores)
    : 0;
  const threshold = clamp(
    Math.max(
      DEFAULT_THRESHOLD,
      highestEnrollmentScore * ENROLLMENT_SCORE_MULTIPLIER +
        ENROLLMENT_SCORE_MARGIN,
    ),
    DEFAULT_THRESHOLD,
    MAX_THRESHOLD,
  );

  return {
    version: 2,
    frame_points: FRAME_POINTS,
    feature_size: FEATURE_SIZE,
    frames,
    samples: prepared.length,
    threshold,
    duration_ms: durationMs || null,
  };
}

export function scoreWakeCandidate(
  candidateFrames = [],
  template,
  candidateDurationMs = null,
) {
  const candidate = normalizeWakeFrames(candidateFrames);
  const reference = Array.isArray(template?.frames)
    ? normalizeWakeFrames(template.frames)
    : [];

  if (
    !candidate.length ||
    !reference.length ||
    Number(template?.version) !== 2
  ) {
    return { matched: false, score: 1, reason: "invalid-template" };
  }

  const expectedDuration = finite(template?.duration_ms);
  const actualDuration = finite(candidateDurationMs);
  if (expectedDuration && actualDuration) {
    const ratio = actualDuration / expectedDuration;
    if (ratio < MIN_DURATION_RATIO || ratio > MAX_DURATION_RATIO) {
      return {
        matched: false,
        score: 1,
        reason: "duration",
        duration_ratio: ratio,
      };
    }
  }

  const score = normalizedFrameDistance(candidate, reference);
  const threshold = resolvedThreshold(template);

  return {
    matched: score <= threshold,
    score,
    threshold,
    reason: score <= threshold ? "matched" : "acoustic-distance",
  };
}
