const FRAME_POINTS = 18;
const FEATURE_SIZE = 5;
const DEFAULT_THRESHOLD = 0.34;

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

export function averageWakeTemplates(templates = []) {
  const normalized = templates
    .map(normalizeWakeFrames)
    .filter((template) => template.length === FRAME_POINTS);

  if (!normalized.length) return null;

  const frames = Array.from({ length: FRAME_POINTS }, (_, frameIndex) =>
    Array.from({ length: FEATURE_SIZE }, (_, featureIndex) => {
      const sum = normalized.reduce(
        (total, template) => total + finite(template[frameIndex]?.[featureIndex]),
        0,
      );
      return sum / normalized.length;
    }),
  );

  return {
    version: 1,
    frame_points: FRAME_POINTS,
    feature_size: FEATURE_SIZE,
    frames,
    samples: normalized.length,
    threshold: DEFAULT_THRESHOLD,
  };
}

export function scoreWakeCandidate(candidateFrames = [], template) {
  const candidate = normalizeWakeFrames(candidateFrames);
  const reference = Array.isArray(template?.frames)
    ? normalizeWakeFrames(template.frames)
    : [];

  if (!candidate.length || !reference.length) {
    return { matched: false, score: 1 };
  }

  let sum = 0;
  for (let index = 0; index < FRAME_POINTS; index += 1) {
    sum += euclidean(candidate[index], reference[index]);
  }

  const score = sum / FRAME_POINTS;
  const threshold = finite(template?.threshold, DEFAULT_THRESHOLD);

  return {
    matched: score <= threshold,
    score,
    threshold,
  };
}
