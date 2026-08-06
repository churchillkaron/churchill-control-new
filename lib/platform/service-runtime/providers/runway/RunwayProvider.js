import sharp from "sharp";

import {
  CredentialRuntime,
} from "@/lib/platform/service-runtime/credentials/runtime/CredentialRuntime";
import {
  resolveFirstCreativeProviderAssetUrl,
} from "@/lib/creative/assets/storage/resolveCreativeProviderAssetUrl";

const RUNWAY_API_BASE = "https://api.dev.runwayml.com";
const RUNWAY_IMAGE_TO_VIDEO_ENDPOINT = `${RUNWAY_API_BASE}/v1/image_to_video`;
const RUNWAY_TEXT_TO_VIDEO_ENDPOINT = `${RUNWAY_API_BASE}/v1/text_to_video`;
const RUNWAY_TASK_ENDPOINT = `${RUNWAY_API_BASE}/v1/tasks`;
const RUNWAY_API_VERSION = "2024-11-06";
const RUNWAY_PROMPT_LIMIT = 1000;
const RUNWAY_IMAGE_DATA_URI_LIMIT = 5 * 1024 * 1024;
const RUNWAY_IMAGE_BINARY_TARGET = 3_300_000;

function compactObject(value = {}) {
  return Object.fromEntries(
    Object.entries(value).filter(([, item]) =>
      item !== undefined && item !== null && item !== ""
    ),
  );
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function list(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function selectedAssets(input = {}) {
  const assets = input.assets;
  if (Array.isArray(assets)) return assets;
  if (Array.isArray(assets?.selectedAssets)) return assets.selectedAssets;
  if (Array.isArray(input.source_assets)) return input.source_assets;
  if (Array.isArray(input.sourceAssets)) return input.sourceAssets;
  if (Array.isArray(input.selected_assets)) return input.selected_assets;
  if (Array.isArray(input.selectedAssets)) return input.selectedAssets;
  return [];
}

function text(value) {
  return String(value ?? "").trim();
}

function unique(values = []) {
  return [...new Set(values.flat(Infinity).map((value) => text(
    value?.asset_id || value?.assetId || value?.id || value,
  )).filter(Boolean))];
}

function identityLock(input = {}) {
  return object(
    input.identity_lock ||
    input.identityLock ||
    input.generation?.identity_lock ||
    input.generation?.identityLock,
  );
}

function identityReferenceIds(lock = {}, input = {}) {
  return unique([
    lock.reference_asset_node_ids,
    lock.referenceAssetNodeIds,
    lock.identity_reference_asset_ids,
    lock.identityReferenceAssetIds,
    lock.reference_asset_node_id,
    lock.referenceAssetNodeId,
    lock.reference_asset_ids,
    lock.referenceAssetIds,
    lock.reference_asset_id,
    lock.referenceAssetId,
    input.identity_reference_asset_ids,
    input.identityReferenceAssetIds,
    input.requirements?.approved_identity_reference_node_ids,
    input.provider_parameters?.reference_asset_ids,
    input.generation?.provider_parameters?.reference_asset_ids,
  ]);
}

function priorityPrompt(basePrompt, lock = {}, referenceIds = []) {
  const prompt = text(basePrompt);
  if (lock.required !== true) return prompt;

  const subject = text(lock.subject || lock.identity_subject || "the approved real person");
  const angle = text(
    lock.requested_identity_angle ||
    lock.requested_angle ||
    lock.requested_face_angle ||
    "the shot's specified angle",
  );
  const backgroundPolicy = text(
    lock.background_reference_policy ||
    lock.backgroundReferencePolicy ||
    "EXCLUDE",
  ).toUpperCase();
  const identityBlock = [
    `IDENTITY LOCK — HIGHEST PRIORITY: The visible subject is ${subject}. Preserve the exact same real person represented by the supplied identity source image and the multi-angle reference set ${referenceIds.join(", ") || "attached to this task"}.`,
    `ANGLE: Preserve identity at ${angle}; keep facial geometry, eye shape and spacing, nose, lips, jawline, skin tone, hairline, hairstyle, age, body type, body proportions and distinguishing features consistent with all references.`,
    "Do not substitute a lookalike, average references into a new person, beautify into a generic AI model, change ethnicity or age, alter body proportions, duplicate the subject, or permit identity drift between frames.",
    backgroundPolicy === "EXCLUDE"
      ? "REFERENCE BACKGROUND POLICY: Ignore and replace the uploaded photo or video backgrounds. Those assets identify the person only; create the environment required by the approved story, production design and music world."
      : `REFERENCE BACKGROUND POLICY: ${backgroundPolicy}.`,
    "Natural expression, performance, pose, wardrobe, lighting, camera perspective and environment may change when the approved direction requires it, but personal identity must remain unchanged.",
  ].join("\n");

  return [identityBlock, prompt].filter(Boolean).join("\n\n");
}

function runwayPrompt(value) {
  const prompt = text(value);
  if (!prompt) return null;
  if (prompt.length <= RUNWAY_PROMPT_LIMIT) return prompt;

  const priorityMarkers = [
    "IDENTITY LOCK",
    "AUDIO-CONDITIONED",
    "SHOT PURPOSE",
    "EXACT ACTION",
    "MUSIC SECTION",
    "ENVIRONMENT",
    "NEGATIVE",
  ];
  const sections = prompt.split(/\n\n+/).filter(Boolean);
  const ordered = [
    ...sections.filter((section) =>
      priorityMarkers.some((marker) => section.includes(marker))
    ),
    ...sections.filter((section) =>
      !priorityMarkers.some((marker) => section.includes(marker))
    ),
  ];
  let output = "";
  for (const section of ordered) {
    const candidate = output ? `${output}\n\n${section}` : section;
    if (candidate.length > RUNWAY_PROMPT_LIMIT) continue;
    output = candidate;
  }
  return (output || prompt).slice(0, RUNWAY_PROMPT_LIMIT);
}

function runwayDuration(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 5;
  return Math.max(2, Math.min(10, Math.round(number)));
}

function runwayRatio(value, hasSource) {
  const normalized = text(value).toLowerCase().replace(/\s+/g, "");
  const landscape = new Set([
    "16:9", "1920:1080", "1280:720", "1920x1080", "1280x720",
  ]);
  const portrait = new Set([
    "9:16", "1080:1920", "720:1280", "1080x1920", "720x1280",
  ]);
  const square = new Set([
    "1:1", "1080:1080", "960:960", "1080x1080", "960x960",
  ]);

  if (portrait.has(normalized)) return "720:1280";
  if (square.has(normalized) && hasSource) return "960:960";
  if (landscape.has(normalized)) return "1280:720";

  if (/^\d+:\d+$/.test(normalized)) {
    const [width, height] = normalized.split(":").map(Number);
    if (width > 0 && height > 0 && height > width) return "720:1280";
    if (width === height && hasSource) return "960:960";
  }

  return "1280:720";
}

function runwaySeed(value) {
  if (value === undefined || value === null || value === "") return undefined;
  const number = Number(value);
  if (!Number.isInteger(number) || number < 0 || number > 4294967295) {
    throw new Error("RUNWAY_SEED_INVALID");
  }
  return number;
}

function runwayContentModeration(value = {}) {
  const source = object(value);
  const threshold = text(
    source.publicFigureThreshold || source.public_figure_threshold,
  ).toLowerCase();
  if (!threshold) return undefined;
  if (!["auto", "low"].includes(threshold)) {
    throw new Error("RUNWAY_PUBLIC_FIGURE_THRESHOLD_INVALID");
  }
  return { publicFigureThreshold: threshold };
}

function runwayNegativePrompt(value, model) {
  const prompt = text(value);
  if (!prompt) return undefined;
  if (!["veo3", "veo3.1", "veo3.1_fast"].includes(text(model))) {
    return undefined;
  }
  return prompt.slice(0, RUNWAY_PROMPT_LIMIT);
}

function rawProviderOptions(input = {}, generation = {}) {
  return {
    ...object(generation.provider_parameters),
    ...object(input.provider_parameters),
    ...object(input.provider_options || input.providerOptions),
  };
}

function providerRequestOptions(input = {}, generation = {}, model) {
  const raw = rawProviderOptions(input, generation);
  return compactObject({
    seed: runwaySeed(input.seed ?? raw.seed),
    contentModeration: runwayContentModeration(
      input.contentModeration ||
      input.content_moderation ||
      raw.contentModeration ||
      raw.content_moderation,
    ),
    negativePrompt: runwayNegativePrompt(
      input.negativePrompt ||
      input.negative_prompt ||
      raw.negativePrompt ||
      raw.negative_prompt,
      model,
    ),
  });
}

function imageDataUri(buffer, contentType = "image/jpeg") {
  return `data:${contentType};base64,${buffer.toString("base64")}`;
}

async function normalizedRunwayPromptImage(source) {
  const original = text(source);
  if (!original) return null;

  if (/^data:image\/(?:jpe?g|png|webp);base64,/i.test(original)) {
    if (Buffer.byteLength(original, "utf8") > RUNWAY_IMAGE_DATA_URI_LIMIT) {
      throw new Error("RUNWAY_PROMPT_IMAGE_DATA_URI_TOO_LARGE");
    }
    return {
      value: original,
      transport: "DATA_URI_EXISTING",
      content_type: original.slice(5, original.indexOf(";")),
      encoded_bytes: Buffer.byteLength(original, "utf8"),
      source_url: null,
    };
  }

  if (!/^https:\/\//i.test(original)) {
    throw new Error("RUNWAY_PROMPT_IMAGE_HTTPS_OR_DATA_URI_REQUIRED");
  }

  const response = await fetch(original, {
    method: "GET",
    redirect: "follow",
    headers: {
      Accept: "image/jpeg,image/png,image/webp,*/*;q=0.1",
      "User-Agent": "Avantiqo-Creative-Provider-Transport/1.0",
    },
  });
  if (!response.ok) {
    throw new Error(`RUNWAY_PROMPT_IMAGE_FETCH_FAILED:${response.status}`);
  }

  const sourceBuffer = Buffer.from(await response.arrayBuffer());
  if (!sourceBuffer.length) {
    throw new Error("RUNWAY_PROMPT_IMAGE_EMPTY");
  }

  let metadata;
  try {
    metadata = await sharp(sourceBuffer, { failOn: "error" }).metadata();
  } catch (error) {
    throw new Error(
      `RUNWAY_PROMPT_IMAGE_DECODE_FAILED:${error?.message || String(error)}`,
    );
  }
  if (!metadata.width || !metadata.height) {
    throw new Error("RUNWAY_PROMPT_IMAGE_DIMENSIONS_REQUIRED");
  }
  const aspectRatio = metadata.width / metadata.height;
  if (aspectRatio < 0.5 || aspectRatio > 2.358) {
    throw new Error(
      `RUNWAY_PROMPT_IMAGE_ASPECT_RATIO_INVALID:${aspectRatio.toFixed(6)}`,
    );
  }

  const attempts = [
    { max: 2048, quality: 92 },
    { max: 1920, quality: 88 },
    { max: 1600, quality: 84 },
    { max: 1440, quality: 80 },
    { max: 1280, quality: 76 },
  ];
  let normalized = null;
  let selectedAttempt = null;
  for (const attempt of attempts) {
    const candidate = await sharp(sourceBuffer, { failOn: "error" })
      .rotate()
      .resize({
        width: attempt.max,
        height: attempt.max,
        fit: "inside",
        withoutEnlargement: true,
      })
      .jpeg({
        quality: attempt.quality,
        mozjpeg: true,
        chromaSubsampling: "4:4:4",
      })
      .toBuffer();
    const uri = imageDataUri(candidate);
    if (
      candidate.length <= RUNWAY_IMAGE_BINARY_TARGET &&
      Buffer.byteLength(uri, "utf8") <= RUNWAY_IMAGE_DATA_URI_LIMIT
    ) {
      normalized = { candidate, uri };
      selectedAttempt = attempt;
      break;
    }
  }
  if (!normalized) {
    throw new Error("RUNWAY_PROMPT_IMAGE_NORMALIZATION_SIZE_FAILED");
  }

  return {
    value: normalized.uri,
    transport: "DATA_URI_NORMALIZED_JPEG",
    content_type: "image/jpeg",
    source_content_type: text(response.headers.get("content-type")) || null,
    source_bytes: sourceBuffer.length,
    normalized_bytes: normalized.candidate.length,
    encoded_bytes: Buffer.byteLength(normalized.uri, "utf8"),
    width: metadata.width,
    height: metadata.height,
    aspect_ratio: Number(aspectRatio.toFixed(6)),
    max_dimension: selectedAttempt.max,
    quality: selectedAttempt.quality,
    source_url: original,
  };
}

async function resolveCredential(credentialId) {
  const credential = credentialId
    ? await CredentialRuntime.resolve(credentialId)
    : null;
  const apiKey =
    credential?.secret_reference ||
    process.env.RUNWAY_API_KEY ||
    process.env.RUNWAYML_API_SECRET;

  if (!apiKey) throw new Error("RUNWAY_CREDENTIAL_REQUIRED");
  return { credential, apiKey };
}

function resolveEndpoint(input = {}, purpose = "submit", hasSource = false) {
  const configured = purpose === "status"
    ? input.status_endpoint || input.statusEndpoint || process.env.RUNWAY_STATUS_API_URL
    : input.endpoint || input.api_url || input.apiUrl || process.env.RUNWAY_API_URL;
  if (configured) return configured;
  if (purpose === "status") return RUNWAY_TASK_ENDPOINT;
  return hasSource ? RUNWAY_IMAGE_TO_VIDEO_ENDPOINT : RUNWAY_TEXT_TO_VIDEO_ENDPOINT;
}

function resolveStatusEndpoint(template, jobId) {
  if (template.includes("{job_id}")) {
    return template.replace("{job_id}", encodeURIComponent(jobId));
  }
  return `${template.replace(/\/$/, "")}/${encodeURIComponent(jobId)}`;
}

function extractJob(result = {}) {
  return result.id ||
    result.job_id ||
    result.jobId ||
    result.task_id ||
    result.taskId ||
    result.output?.id ||
    null;
}

function extractOutput(result = {}) {
  return result.output ||
    result.outputs ||
    result.video_url ||
    result.videoUrl ||
    result.url ||
    null;
}

function runwayErrorMessage(result = {}, responseStatus, rawText = "") {
  const issues = list(result.issues).map((issue) => {
    const path = list(issue?.path).map(text).filter(Boolean).join(".");
    const message = text(issue?.message || issue?.error || issue?.code);
    return [path, message].filter(Boolean).join(": ");
  }).filter(Boolean);
  const primary = text(
    typeof result.error === "string"
      ? result.error
      : result.error?.message || result.message,
  );
  const fallback = text(rawText).slice(0, 1000);
  const detail = issues.length ? issues.join("; ") : fallback;
  return [
    `Runway request failed with status ${responseStatus}`,
    primary,
    detail,
  ].filter(Boolean).join(" | ");
}

async function responsePayload(response) {
  const raw = await response.text();
  if (!raw) return { raw: "", result: {} };
  try {
    return { raw, result: JSON.parse(raw) };
  } catch {
    return { raw, result: {} };
  }
}

async function buildRunwayRequest(input = {}) {
  const generation = object(input.generation);
  const model = text(input.model || generation.model);
  const lock = identityLock(input);
  const referenceIds = identityReferenceIds(lock, input);
  const basePrompt =
    input.prompt ||
    input.promptText ||
    input.instructions?.prompt ||
    input.provider_prompt ||
    generation.provider_prompt;
  const prompt = runwayPrompt(priorityPrompt(basePrompt, lock, referenceIds));
  const identityCandidates = referenceIds.map((id) => ({
    id,
    asset_id: id,
    role: "IDENTITY_REFERENCE",
  }));
  const resolvedSource = await resolveFirstCreativeProviderAssetUrl({
    organization_id: input.context?.organization_id,
    values: [
      input.identity_source,
      input.identitySource,
      input.prompt_image,
      input.promptImage,
      input.source,
      input.image,
      input.identity_reference_image,
      input.identityReferenceImage,
      identityCandidates,
      selectedAssets(input),
    ],
  });
  const source = resolvedSource
    ? await normalizedRunwayPromptImage(resolvedSource)
    : null;

  if (!model) throw new Error("RUNWAY_MODEL_REQUIRED");
  if (!prompt && !source) throw new Error("RUNWAY_PROMPT_OR_SOURCE_REQUIRED");
  if (lock.required === true && !referenceIds.length) {
    throw new Error(
      `RUNWAY_IDENTITY_REFERENCE_SET_REQUIRED:${text(lock.subject || lock.identity_subject || "UNKNOWN")}`,
    );
  }
  if (lock.required === true && !source) {
    throw new Error(
      `RUNWAY_IDENTITY_SOURCE_REQUIRED:${text(lock.subject || lock.identity_subject || "UNKNOWN")}`,
    );
  }
  if (!source && model === "gen4_turbo") {
    throw new Error("RUNWAY_TEXT_TO_VIDEO_MODEL_UNSUPPORTED:gen4_turbo");
  }

  const output = object(
    input.output_spec || input.outputSpec || generation.output_spec,
  );
  const rawOptions = rawProviderOptions(input, generation);
  const requestedDuration =
    input.duration_seconds ??
    input.duration ??
    output.duration_seconds ??
    rawOptions.duration_seconds ??
    rawOptions.duration;
  const requestedRatio =
    input.aspect_ratio ??
    input.ratio ??
    output.aspect_ratio ??
    output.ratio ??
    rawOptions.aspect_ratio ??
    rawOptions.ratio;
  const body = compactObject({
    model,
    promptText: prompt,
    promptImage: source?.value,
    duration: runwayDuration(requestedDuration),
    ratio: runwayRatio(requestedRatio, Boolean(source)),
    ...providerRequestOptions(input, generation, model),
  });
  const endpoint = resolveEndpoint(input, "submit", Boolean(source));
  const apiVersion =
    input.api_version ||
    input.apiVersion ||
    process.env.RUNWAY_API_VERSION ||
    RUNWAY_API_VERSION;

  return {
    endpoint,
    apiVersion,
    model,
    source,
    lock,
    referenceIds,
    basePrompt,
    prompt,
    body,
  };
}

export const RunwayProvider = {
  id: "runway",

  async execute(input = {}) {
    const { apiKey } = await resolveCredential(input.credential_id);
    const request = await buildRunwayRequest(input);
    const headers = compactObject({
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "X-Runway-Version": request.apiVersion,
      ...object(input.headers),
    });
    const response = await fetch(request.endpoint, {
      method: input.method || "POST",
      headers,
      body: JSON.stringify(request.body),
    });
    const { raw, result } = await responsePayload(response);

    if (!response.ok) {
      throw new Error(runwayErrorMessage(result, response.status, raw));
    }

    const jobId = extractJob(result);
    const outputValue = extractOutput(result);
    if (!jobId && !outputValue) throw new Error("RUNWAY_OUTPUT_OR_JOB_REQUIRED");

    return {
      success: true,
      provider: "runway",
      model: request.model,
      output: {
        provider_job_id: jobId,
        status: jobId && !outputValue ? "processing" : "completed",
        source_url: request.source?.source_url || null,
        identity_lock: request.lock.required === true ? {
          required: true,
          subject: text(
            request.lock.subject || request.lock.identity_subject,
          ),
          identity_profile_id:
            text(request.lock.identity_profile_id) || null,
          reference_asset_id: request.referenceIds[0] || null,
          reference_asset_ids: request.referenceIds,
          source_url: request.source?.source_url || null,
          requested_identity_angle:
            text(
              request.lock.requested_identity_angle ||
              request.lock.requested_angle,
            ) || null,
          background_reference_policy:
            text(request.lock.background_reference_policy || "EXCLUDE"),
          verification_required:
            request.lock.verification_required !== false,
        } : null,
        prompt_contract: {
          full_prompt_length: text(
            priorityPrompt(
              request.basePrompt,
              request.lock,
              request.referenceIds,
            ),
          ).length,
          submitted_prompt_length: text(request.prompt).length,
          submitted_prompt_limit: RUNWAY_PROMPT_LIMIT,
          identity_priority_preserved: request.lock.required === true,
        },
        request_contract: {
          endpoint: request.endpoint,
          api_version: request.apiVersion,
          body_keys: Object.keys(request.body).sort(),
          ratio: request.body.ratio,
          duration: request.body.duration,
          source_present: Boolean(request.source),
          source_transport: request.source?.transport || null,
          source_content_type: request.source?.content_type || null,
          source_bytes: request.source?.source_bytes || null,
          normalized_bytes: request.source?.normalized_bytes || null,
          encoded_bytes: request.source?.encoded_bytes || null,
          source_width: request.source?.width || null,
          source_height: request.source?.height || null,
          source_aspect_ratio: request.source?.aspect_ratio || null,
          prompt_length: text(request.prompt).length,
          strict_provider_allowlist: true,
        },
        result: outputValue,
        raw: result,
      },
    };
  },

  async getStatus(input = {}) {
    const jobId = typeof input === "string"
      ? input
      : input.job_id || input.jobId || input.provider_job_id;
    if (!jobId) throw new Error("RUNWAY_JOB_ID_REQUIRED");

    const options = typeof input === "string" ? {} : input;
    const { apiKey } = await resolveCredential(options.credential_id);
    const statusTemplate = resolveEndpoint(options, "status");
    const endpoint = resolveStatusEndpoint(statusTemplate, jobId);
    const apiVersion =
      options.api_version ||
      options.apiVersion ||
      process.env.RUNWAY_API_VERSION ||
      RUNWAY_API_VERSION;
    const response = await fetch(endpoint, {
      method: options.method || "GET",
      headers: compactObject({
        Authorization: `Bearer ${apiKey}`,
        "X-Runway-Version": apiVersion,
        ...object(options.headers),
      }),
    });
    const { raw, result } = await responsePayload(response);
    if (!response.ok) {
      throw new Error(
        runwayErrorMessage(result, response.status, raw)
          .replace("Runway request", "Runway status request"),
      );
    }
    return result;
  },
};

export async function getRunwayTaskStatus(input) {
  return RunwayProvider.getStatus(input);
}

export const RunwayProviderRequestRuntime = Object.freeze({
  build: buildRunwayRequest,
  normalizePromptImage: normalizedRunwayPromptImage,
  errorMessage: runwayErrorMessage,
  duration: runwayDuration,
  ratio: runwayRatio,
  prompt: runwayPrompt,
});
