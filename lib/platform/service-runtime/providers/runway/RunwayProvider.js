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

function compactObject(value = {}) {
  return Object.fromEntries(
    Object.entries(value).filter(([, item]) => item !== undefined && item !== null && item !== ""),
  );
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
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

function identityLock(input = {}) {
  return object(
    input.identity_lock ||
    input.identityLock ||
    input.generation?.identity_lock ||
    input.generation?.identityLock,
  );
}

function identityPrompt(basePrompt, lock = {}) {
  const prompt = text(basePrompt);
  if (lock.required !== true) return prompt;

  const subject = text(lock.subject || lock.identity_subject || "the approved performer");
  return [
    prompt,
    `IDENTITY LOCK: The visible performer is ${subject}. Keep this exact same real person from the supplied identity-locked source image in every frame.`,
    "Preserve the same facial geometry, eye shape and spacing, nose, lips, jawline, skin tone, hairline, hairstyle, age, body proportions and distinguishing features.",
    "Do not substitute a look-alike, reinterpret the face, beautify into another person, change ethnicity or age, morph facial features, duplicate the performer, or allow identity drift between frames.",
    "Natural expression, movement, lighting and camera perspective may change, but personal identity must remain unchanged.",
  ].filter(Boolean).join("\n");
}

function runwayPrompt(value) {
  const prompt = text(value);
  return prompt ? prompt.slice(0, 1000) : null;
}

function runwayDuration(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 5;
  return Math.max(2, Math.min(10, Math.round(number)));
}

function runwayRatio(value, hasSource) {
  const normalized = text(value).toLowerCase().replace(/\s+/g, "");
  const landscape = new Set([
    "16:9",
    "1920:1080",
    "1280:720",
    "1920x1080",
    "1280x720",
  ]);
  const portrait = new Set([
    "9:16",
    "1080:1920",
    "720:1280",
    "1080x1920",
    "720x1280",
  ]);
  const square = new Set([
    "1:1",
    "1080:1080",
    "960:960",
    "1080x1080",
    "960x960",
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

async function resolveCredential(credentialId) {
  const credential = credentialId
    ? await CredentialRuntime.resolve(credentialId)
    : null;
  const apiKey =
    credential?.secret_reference ||
    process.env.RUNWAY_API_KEY ||
    process.env.RUNWAYML_API_SECRET;

  if (!apiKey) {
    throw new Error("RUNWAY_CREDENTIAL_REQUIRED");
  }

  return { credential, apiKey };
}

function resolveEndpoint(input = {}, purpose = "submit", hasSource = false) {
  const configured = purpose === "status"
    ? input.status_endpoint || input.statusEndpoint || process.env.RUNWAY_STATUS_API_URL
    : input.endpoint || input.api_url || input.apiUrl || process.env.RUNWAY_API_URL;

  if (configured) return configured;
  if (purpose === "status") return RUNWAY_TASK_ENDPOINT;
  return hasSource
    ? RUNWAY_IMAGE_TO_VIDEO_ENDPOINT
    : RUNWAY_TEXT_TO_VIDEO_ENDPOINT;
}

function resolveStatusEndpoint(template, jobId) {
  if (template.includes("{job_id}")) {
    return template.replace("{job_id}", encodeURIComponent(jobId));
  }

  return `${template.replace(/\/$/, "")}/${encodeURIComponent(jobId)}`;
}

function extractJob(result = {}) {
  return (
    result.id ||
    result.job_id ||
    result.jobId ||
    result.task_id ||
    result.taskId ||
    result.output?.id ||
    null
  );
}

function extractOutput(result = {}) {
  return (
    result.output ||
    result.outputs ||
    result.video_url ||
    result.videoUrl ||
    result.url ||
    null
  );
}

export const RunwayProvider = {
  id: "runway",

  async execute(input = {}) {
    const { apiKey } = await resolveCredential(input.credential_id);
    const generation = input.generation || {};
    const model = input.model || generation.model;
    const lock = identityLock(input);
    const prompt = runwayPrompt(identityPrompt(
      input.prompt ||
      input.promptText ||
      input.instructions?.prompt ||
      input.provider_prompt ||
      generation.provider_prompt,
      lock,
    ));
    const source = await resolveFirstCreativeProviderAssetUrl({
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
        selectedAssets(input),
      ],
    });
    const endpoint = resolveEndpoint(input, "submit", Boolean(source));

    if (!model) {
      throw new Error("RUNWAY_MODEL_REQUIRED");
    }

    if (!prompt && !source) {
      throw new Error("RUNWAY_PROMPT_OR_SOURCE_REQUIRED");
    }

    if (lock.required === true && !source) {
      throw new Error(
        `RUNWAY_IDENTITY_SOURCE_REQUIRED:${text(lock.subject || lock.identity_subject || "UNKNOWN")}`,
      );
    }

    if (lock.required === true && text(lock.subject).toLowerCase() === "cole ley" && !text(lock.reference_asset_node_id)) {
      throw new Error("RUNWAY_COLE_IDENTITY_REFERENCE_NODE_REQUIRED");
    }

    if (!source && model === "gen4_turbo") {
      throw new Error("RUNWAY_TEXT_TO_VIDEO_MODEL_UNSUPPORTED:gen4_turbo");
    }

    const providerOptions = {
      ...(generation.provider_parameters || {}),
      ...(input.provider_parameters || {}),
      ...(input.provider_options || input.providerOptions || {}),
    };
    const output = input.output_spec || input.outputSpec || generation.output_spec || {};
    const requestedDuration =
      input.duration_seconds ??
      input.duration ??
      output.duration_seconds;
    const requestedRatio =
      input.aspect_ratio ??
      input.ratio ??
      output.aspect_ratio ??
      output.ratio;
    const body = compactObject({
      model,
      promptText: prompt,
      promptImage: source,
      duration: runwayDuration(requestedDuration),
      ratio: runwayRatio(requestedRatio, Boolean(source)),
      seed: input.seed,
      ...providerOptions,
    });
    const apiVersion =
      input.api_version ||
      input.apiVersion ||
      process.env.RUNWAY_API_VERSION ||
      RUNWAY_API_VERSION;
    const headers = compactObject({
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "X-Runway-Version": apiVersion,
      ...(input.headers || {}),
    });
    const response = await fetch(endpoint, {
      method: input.method || "POST",
      headers,
      body: JSON.stringify(body),
    });
    const result = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(
        result?.error?.message ||
        result?.message ||
        `Runway request failed with status ${response.status}`,
      );
    }

    const jobId = extractJob(result);
    const outputValue = extractOutput(result);

    if (!jobId && !outputValue) {
      throw new Error("RUNWAY_OUTPUT_OR_JOB_REQUIRED");
    }

    return {
      success: true,
      provider: "runway",
      model,
      output: {
        provider_job_id: jobId,
        status: jobId && !outputValue ? "processing" : "completed",
        source_url: source,
        identity_lock: lock.required === true
          ? {
              required: true,
              subject: text(lock.subject || lock.identity_subject),
              reference_asset_node_id: text(lock.reference_asset_node_id) || null,
              reference_creative_asset_id: text(lock.reference_creative_asset_id) || null,
              source_url: source,
              verification_required: lock.verification_required !== false,
            }
          : null,
        result: outputValue,
        raw: result,
      },
    };
  },

  async getStatus(input = {}) {
    const jobId = typeof input === "string"
      ? input
      : input.job_id || input.jobId || input.provider_job_id;

    if (!jobId) {
      throw new Error("RUNWAY_JOB_ID_REQUIRED");
    }

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
        ...(options.headers || {}),
      }),
    });
    const result = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(
        result?.error?.message ||
        result?.message ||
        `Runway status request failed with status ${response.status}`,
      );
    }

    return result;
  },
};

export async function getRunwayTaskStatus(input) {
  return RunwayProvider.getStatus(input);
}
