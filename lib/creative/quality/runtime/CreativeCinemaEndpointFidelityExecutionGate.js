import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

import sharp from "sharp";

import {
  ProductionTaskRuntime,
} from "@/lib/operations/tasks/runtime/ProductionTaskRuntime";
import {
  CreativeGeneratedMediaPerceptualExecutionGate,
} from "@/lib/creative/quality/runtime/CreativeGeneratedMediaPerceptualExecutionGate";
import {
  materializeMedia,
} from "@/lib/creative/media/runtime/CreativeMediaInspectionRuntime";
import {
  resolveCreativeFfmpegPath,
} from "@/lib/creative/media/runtime/CreativeMediaBinaryRuntime";
import {
  resolveFirstCreativeProviderAssetUrl,
} from "@/lib/creative/assets/storage/resolveCreativeProviderAssetUrl";

const INSTALL_FLAG = Symbol.for(
  "avantiqo.creative.cinema-endpoint-fidelity-execution-gate.v1",
);
const REVIEW_CONTRACT = "GENERATED_MEDIA_PERCEPTUAL_REVIEW_V1";
const ENDPOINT_CONTRACT = "CREATIVE_CINEMA_ENDPOINT_FIDELITY_V1";
const FIRST_LAST_CAPABILITY = "ai.video.first_last_frame_to_video";
const MAX_VIDEO_BYTES = 250 * 1024 * 1024;
const MAX_IMAGE_BYTES = 25 * 1024 * 1024;
const NORMALIZED_SIZE = 192;
const SHIFT_OFFSETS = Object.freeze([-4, 0, 4]);
const DEFAULT_MINIMUM_SIMILARITY = 0.7;

function list(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function text(value) {
  return String(value ?? "").trim();
}

function boundedSimilarity(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  if (number < 0.5 || number > 0.99) return null;
  return number;
}

function expectation(task = {}) {
  return object(
    task.input?.requirements?.expected_contract ||
    task.metadata?.requirements?.expected_contract,
  );
}

function firstLastReview(task = {}) {
  const expected = expectation(task);
  return text(task.metadata?.contract) === REVIEW_CONTRACT &&
    (
      expected.first_last_frame_conditioning_expected === true ||
      task.metadata?.first_last_frame_conditioning_expected === true ||
      text(expected.source_capability).toLowerCase() === FIRST_LAST_CAPABILITY
    );
}

function outputValue(output = {}) {
  return output?.output?.output || output?.output || output || {};
}

function assetReference(value) {
  if (!value) return null;
  if (typeof value === "string") return text(value) || null;
  if (typeof value !== "object") return null;
  return text(
    value.storage_reference ||
    value.storageReference ||
    value.url ||
    value.file_url ||
    value.fileUrl ||
    value.image_url ||
    value.imageUrl ||
    value.video_url ||
    value.videoUrl ||
    value.reference ||
    value.uri ||
    value.asset_id ||
    value.assetId ||
    value.id,
  ) || null;
}

function semanticAsset(task = {}, roleNames = []) {
  const roles = new Set(roleNames.map((value) => text(value).toUpperCase()));
  return list(task.input?.source_assets).find((asset) =>
    roles.has(text(asset?.role).toUpperCase()),
  ) || null;
}

function endpointInput(source = {}, endpoint) {
  const input = object(source.input);
  const generation = object(input.generation);
  const provider = {
    ...object(generation.provider_parameters),
    ...object(input.provider_parameters),
  };
  if (endpoint === "first") {
    return input.first_frame ||
      input.firstFrame ||
      input.start_frame ||
      input.startFrame ||
      generation.first_frame ||
      generation.firstFrame ||
      provider.first_frame ||
      provider.firstFrame ||
      semanticAsset(source, [
        "PREVIOUS_REVIEWED_CLOSING_FRAME",
        "APPROVED_FIRST_FRAME",
        "FIRST_FRAME",
        "OPENING_KEYFRAME",
      ]);
  }
  return input.last_frame ||
    input.lastFrame ||
    input.end_frame ||
    input.endFrame ||
    generation.last_frame ||
    generation.lastFrame ||
    provider.last_frame ||
    provider.lastFrame ||
    semanticAsset(source, [
      "APPROVED_LAST_FRAME",
      "LAST_FRAME",
      "CLOSING_KEYFRAME",
      "ENDING_KEYFRAME",
    ]);
}

function generatedVideoReference(source = {}) {
  const value = outputValue(source.output);
  return assetReference(
    value.storage_reference ||
    value.storageReference ||
    value.video_url ||
    value.videoUrl ||
    value.file_url ||
    value.fileUrl ||
    value.url ||
    CreativeGeneratedMediaPerceptualExecutionGate.outputUrl(source.output),
  );
}

function sourceTaskId(review = {}) {
  return text(
    review.metadata?.source_generation_task_id ||
    review.input?.provider_parameters?.source_generation_task_id ||
    review.input?.requirements?.source_generation_task_id ||
    list(review.depends_on)[0],
  ) || null;
}

async function resolveEndpointAsset({ organizationId, value, label }) {
  if (!value) throw new Error(`CREATIVE_CINEMA_${label}_REFERENCE_REQUIRED`);
  const resolved = await resolveFirstCreativeProviderAssetUrl({
    organization_id: organizationId,
    values: [value],
  });
  if (resolved) return resolved;
  const direct = assetReference(value);
  if (direct) return direct;
  throw new Error(`CREATIVE_CINEMA_${label}_REFERENCE_UNRESOLVED`);
}

function fidelityMinimum(review = {}) {
  const expected = expectation(review);
  return boundedSimilarity(
    expected.endpoint_fidelity?.minimum_similarity ??
    expected.endpoint_fidelity_minimum_similarity ??
    review.input?.requirements?.endpoint_fidelity_minimum_similarity ??
    review.metadata?.endpoint_fidelity_minimum_similarity ??
    process.env.CREATIVE_CINEMA_ENDPOINT_FIDELITY_MINIMUM_SIMILARITY,
  ) ?? DEFAULT_MINIMUM_SIMILARITY;
}

function runBinary(binary, args, label) {
  const result = spawnSync(binary, args, {
    encoding: "utf8",
    maxBuffer: 20 * 1024 * 1024,
  });
  if (result.error) {
    throw new Error(`${label}_UNAVAILABLE:${result.error.message}`);
  }
  if (result.status !== 0) {
    throw new Error(`${label}_FAILED:${text(result.stderr) || result.status}`);
  }
}

function extractEndpointFrame({ inputPath, outputPath, endpoint }) {
  const ffmpeg = resolveCreativeFfmpegPath({});
  if (!ffmpeg) {
    throw new Error("CREATIVE_CINEMA_ENDPOINT_FIDELITY_FFMPEG_NOT_CONFIGURED");
  }
  const timing = endpoint === "first"
    ? ["-ss", "0"]
    : ["-sseof", "-0.08"];
  runBinary(
    ffmpeg,
    [
      "-y",
      "-loglevel", "error",
      ...timing,
      "-i", inputPath,
      "-frames:v", "1",
      "-q:v", "2",
      outputPath,
    ],
    endpoint === "first"
      ? "CREATIVE_CINEMA_OPENING_FRAME_EXTRACTION"
      : "CREATIVE_CINEMA_CLOSING_FRAME_EXTRACTION",
  );
  if (!fs.existsSync(outputPath) || fs.statSync(outputPath).size <= 0) {
    throw new Error(
      endpoint === "first"
        ? "CREATIVE_CINEMA_OPENING_FRAME_EMPTY"
        : "CREATIVE_CINEMA_CLOSING_FRAME_EMPTY",
    );
  }
}

async function normalizedPixels(filePath) {
  const { data, info } = await sharp(filePath, { failOn: "error" })
    .rotate()
    .resize({
      width: NORMALIZED_SIZE,
      height: NORMALIZED_SIZE,
      fit: "fill",
      kernel: "lanczos3",
    })
    .greyscale()
    .raw()
    .toBuffer({ resolveWithObject: true });
  if (info.width !== NORMALIZED_SIZE || info.height !== NORMALIZED_SIZE) {
    throw new Error("CREATIVE_CINEMA_ENDPOINT_NORMALIZATION_FAILED");
  }
  return data;
}

function scoreShift(expected, actual, dx, dy) {
  let count = 0;
  let absoluteDifference = 0;
  let sumExpected = 0;
  let sumActual = 0;
  let sumExpectedSquared = 0;
  let sumActualSquared = 0;
  let sumProduct = 0;

  for (let y = 0; y < NORMALIZED_SIZE; y += 1) {
    const actualY = y + dy;
    if (actualY < 0 || actualY >= NORMALIZED_SIZE) continue;
    for (let x = 0; x < NORMALIZED_SIZE; x += 1) {
      const actualX = x + dx;
      if (actualX < 0 || actualX >= NORMALIZED_SIZE) continue;
      const a = expected[(y * NORMALIZED_SIZE) + x];
      const b = actual[(actualY * NORMALIZED_SIZE) + actualX];
      count += 1;
      absoluteDifference += Math.abs(a - b);
      sumExpected += a;
      sumActual += b;
      sumExpectedSquared += a * a;
      sumActualSquared += b * b;
      sumProduct += a * b;
    }
  }

  if (!count) throw new Error("CREATIVE_CINEMA_ENDPOINT_COMPARISON_EMPTY");
  const pixelSimilarity = Math.max(
    0,
    Math.min(1, 1 - (absoluteDifference / (count * 255))),
  );
  const covariance = sumProduct - ((sumExpected * sumActual) / count);
  const varianceExpected =
    sumExpectedSquared - ((sumExpected * sumExpected) / count);
  const varianceActual =
    sumActualSquared - ((sumActual * sumActual) / count);
  const denominator = Math.sqrt(
    Math.max(0, varianceExpected) * Math.max(0, varianceActual),
  );
  const correlation = denominator > 0
    ? Math.max(-1, Math.min(1, covariance / denominator))
    : pixelSimilarity === 1 ? 1 : 0;
  const correlationSimilarity = (correlation + 1) / 2;
  const combinedSimilarity =
    (pixelSimilarity * 0.65) + (correlationSimilarity * 0.35);

  return {
    dx,
    dy,
    pixel_similarity: Number(pixelSimilarity.toFixed(6)),
    correlation_similarity: Number(correlationSimilarity.toFixed(6)),
    combined_similarity: Number(combinedSimilarity.toFixed(6)),
  };
}

async function compareImages(expectedPath, actualPath) {
  const [expected, actual] = await Promise.all([
    normalizedPixels(expectedPath),
    normalizedPixels(actualPath),
  ]);
  let best = null;
  for (const dy of SHIFT_OFFSETS) {
    for (const dx of SHIFT_OFFSETS) {
      const candidate = scoreShift(expected, actual, dx, dy);
      if (!best || candidate.combined_similarity > best.combined_similarity) {
        best = candidate;
      }
    }
  }
  return best;
}

function sha256File(filePath) {
  return crypto
    .createHash("sha256")
    .update(fs.readFileSync(filePath))
    .digest("hex");
}

function explicitPerceptualEvidence(review = {}) {
  const expected = expectation(review);
  const evidence = CreativeGeneratedMediaPerceptualExecutionGate
    .resultEvidence(review);
  const required = {
    requested_camera_correct: true,
    physics_valid: true,
    continuity_valid: true,
    identity_preserved: expected.identity_expected === true,
  };
  const decisions = {};
  const failures = [];
  for (const [key, needed] of Object.entries(required)) {
    const present = Object.prototype.hasOwnProperty.call(evidence, key);
    const value = present && typeof evidence[key] === "boolean"
      ? evidence[key]
      : null;
    const passed = !needed || value === true;
    decisions[key] = {
      required: needed,
      present,
      explicit_value: value,
      passed,
    };
    if (!passed) failures.push(key);
  }
  return {
    contract: "CREATIVE_CINEMA_EXPLICIT_TEMPORAL_EVIDENCE_V1",
    passed: failures.length === 0,
    decisions,
    failures,
  };
}

async function evaluateEndpointFidelity(review = {}, source = {}) {
  const minimum = fidelityMinimum(review);
  const organizationId = text(review.organization_id || source.organization_id);
  if (!organizationId) {
    throw new Error("CREATIVE_CINEMA_ENDPOINT_FIDELITY_ORGANIZATION_REQUIRED");
  }
  const firstInput = endpointInput(source, "first");
  const lastInput = endpointInput(source, "last");
  const videoReference = generatedVideoReference(source);
  if (!videoReference) {
    throw new Error("CREATIVE_CINEMA_ENDPOINT_FIDELITY_VIDEO_REQUIRED");
  }

  const [firstReference, lastReference] = await Promise.all([
    resolveEndpointAsset({
      organizationId,
      value: firstInput,
      label: "FIRST_FRAME",
    }),
    resolveEndpointAsset({
      organizationId,
      value: lastInput,
      label: "LAST_FRAME",
    }),
  ]);

  const [video, expectedFirst, expectedLast] = await Promise.all([
    materializeMedia({
      url: videoReference,
      organization_id: organizationId,
      policy: {
        max_bytes: MAX_VIDEO_BYTES,
        timeout_ms: 120_000,
        max_redirects: 5,
      },
    }),
    materializeMedia({
      url: firstReference,
      organization_id: organizationId,
      policy: {
        max_bytes: MAX_IMAGE_BYTES,
        timeout_ms: 60_000,
        max_redirects: 5,
      },
    }),
    materializeMedia({
      url: lastReference,
      organization_id: organizationId,
      policy: {
        max_bytes: MAX_IMAGE_BYTES,
        timeout_ms: 60_000,
        max_redirects: 5,
      },
    }),
  ]);

  const directory = path.dirname(video.file_path);
  const actualFirstPath = path.join(directory, "cinema-actual-first.jpg");
  const actualLastPath = path.join(directory, "cinema-actual-last.jpg");
  try {
    extractEndpointFrame({
      inputPath: video.file_path,
      outputPath: actualFirstPath,
      endpoint: "first",
    });
    extractEndpointFrame({
      inputPath: video.file_path,
      outputPath: actualLastPath,
      endpoint: "last",
    });
    const [first, last] = await Promise.all([
      compareImages(expectedFirst.file_path, actualFirstPath),
      compareImages(expectedLast.file_path, actualLastPath),
    ]);
    const temporalEvidence = explicitPerceptualEvidence(review);
    const firstPassed = first.combined_similarity >= minimum;
    const lastPassed = last.combined_similarity >= minimum;
    return {
      contract: ENDPOINT_CONTRACT,
      passed: firstPassed && lastPassed && temporalEvidence.passed,
      minimum_similarity: minimum,
      algorithm: {
        contract: "CREATIVE_CINEMA_ENDPOINT_IMAGE_SIMILARITY_V1",
        normalized_size: NORMALIZED_SIZE,
        grayscale: true,
        translation_offsets_pixels: [...SHIFT_OFFSETS],
        pixel_similarity_weight: 0.65,
        correlation_similarity_weight: 0.35,
      },
      first_frame: {
        passed: firstPassed,
        ...first,
        expected_sha256: expectedFirst.checksum,
        actual_sha256: sha256File(actualFirstPath),
      },
      last_frame: {
        passed: lastPassed,
        ...last,
        expected_sha256: expectedLast.checksum,
        actual_sha256: sha256File(actualLastPath),
      },
      source_video_sha256: video.checksum,
      explicit_temporal_evidence: temporalEvidence,
      provider_calls_added: 0,
      signed_urls_persisted: false,
    };
  } finally {
    fs.rmSync(actualFirstPath, { force: true });
    fs.rmSync(actualLastPath, { force: true });
    await Promise.all([
      video.cleanup(),
      expectedFirst.cleanup(),
      expectedLast.cleanup(),
    ]);
  }
}

async function reject(review = {}, source = {}, evaluation = {}) {
  if (source?.id) {
    await ProductionTaskRuntime.update(source.id, {
      status: "FAILED",
      error: "CREATIVE_CINEMA_ENDPOINT_FIDELITY_FAILED",
      metadata: {
        ...object(source.metadata),
        cinema_endpoint_fidelity_passed: false,
        approved_for_downstream_after_perceptual_review: false,
        cinema_endpoint_fidelity_review_task_id: review.id,
      },
      output: {
        ...object(source.output),
        cinema_endpoint_fidelity: evaluation,
      },
    });
  }
  await ProductionTaskRuntime.update(review.id, {
    review: {
      ...object(review.review),
      required: false,
      approved: false,
      approved_by: "AVANTIQO_CINEMA_ENDPOINT_FIDELITY_GATE",
    },
    metadata: {
      ...object(review.metadata),
      cinema_endpoint_fidelity_passed: false,
      generated_media_released_for_downstream: false,
    },
    output: {
      ...object(review.output),
      cinema_endpoint_fidelity: evaluation,
    },
  });
  return ProductionTaskRuntime.fail(
    review.id,
    new Error("CREATIVE_CINEMA_ENDPOINT_FIDELITY_FAILED"),
    { cinema_endpoint_fidelity: evaluation },
  );
}

async function approve(review = {}, source = {}, evaluation = {}) {
  if (source?.id) {
    await ProductionTaskRuntime.update(source.id, {
      metadata: {
        ...object(source.metadata),
        cinema_endpoint_fidelity_passed: true,
        cinema_endpoint_fidelity_review_task_id: review.id,
      },
      output: {
        ...object(source.output),
        cinema_endpoint_fidelity: evaluation,
      },
    });
  }
  return ProductionTaskRuntime.update(review.id, {
    metadata: {
      ...object(review.metadata),
      cinema_endpoint_fidelity_passed: true,
      cinema_endpoint_fidelity_contract: ENDPOINT_CONTRACT,
    },
    output: {
      ...object(review.output),
      cinema_endpoint_fidelity: evaluation,
    },
  });
}

async function enforce(result, id) {
  const review = await ProductionTaskRuntime.get(id) || result;
  if (!firstLastReview(review)) return review || result;
  if (text(review.status).toUpperCase() !== "COMPLETED") return review;

  const sourceId = sourceTaskId(review);
  const source = sourceId ? await ProductionTaskRuntime.get(sourceId) : null;
  if (!source) {
    return reject(review, null, {
      contract: ENDPOINT_CONTRACT,
      passed: false,
      error: "CREATIVE_CINEMA_ENDPOINT_FIDELITY_SOURCE_TASK_REQUIRED",
      provider_calls_added: 0,
    });
  }

  try {
    const evaluation = await evaluateEndpointFidelity(review, source);
    return evaluation.passed
      ? approve(review, source, evaluation)
      : reject(review, source, evaluation);
  } catch (error) {
    return reject(review, source, {
      contract: ENDPOINT_CONTRACT,
      passed: false,
      error: text(error?.message || error) || "CREATIVE_CINEMA_ENDPOINT_FIDELITY_UNKNOWN_FAILURE",
      provider_calls_added: 0,
    });
  }
}

function install() {
  if (ProductionTaskRuntime[INSTALL_FLAG]) return;
  const dispatchWithoutEndpointFidelity = ProductionTaskRuntime.dispatch.bind(
    ProductionTaskRuntime,
  );
  Object.defineProperty(ProductionTaskRuntime, INSTALL_FLAG, {
    value: true,
    enumerable: false,
    configurable: false,
  });

  ProductionTaskRuntime.dispatch = async function dispatchWithCinemaEndpointFidelity(id) {
    const before = await ProductionTaskRuntime.get(id);
    const shouldEvaluate = firstLastReview(before);
    const result = await dispatchWithoutEndpointFidelity(id);
    return shouldEvaluate ? enforce(result, id) : result;
  };
}

install();

export const CreativeCinemaEndpointFidelityExecutionGate = Object.freeze({
  installed: true,
  contract: ENDPOINT_CONTRACT,
  evaluateEndpointFidelity,
  explicitPerceptualEvidence,
  firstLastReview,
});
