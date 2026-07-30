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
    ...sections.filter((section) => priorityMarkers.some((marker) => section.includes(marker))),
    ...sections.filter((section) => !priorityMarkers.some((marker) => section.includes(marker))),
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
  return result.id || result.job_id || result.jobId || result.task_id || result.taskId || result.output?.id || null;
}

function extractOutput(result = {}) {
  return result.output || result.outputs || result.video_url || result.videoUrl || result.url || null;
}

export const RunwayProvider = {
  id: "runway",

  async execute(input = {}) {
    const { apiKey } = await resolveCredential(input.credential_id);
    const generation = input.generation || {};
    const model = input.model || generation.model;
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
        identityCandidates,
        selectedAssets(input),
      ],
    });
    const endpoint = resolveEndpoint(input, "submit", Boolean(source));

    if (!model) throw new Error("RUNWAY_MODEL_REQUIRED");
    if (!prompt && !source) throw new Error("RUNWAY_PROMPT_OR_SOURCE_REQUIRED");
    if (lock.required === true && !referenceIds.length) {
      throw new Error(`RUNWAY_IDENTITY_REFERENCE_SET_REQUIRED:${text(lock.subject || lock.identity_subject || "UNKNOWN")}`);
    }
    if (lock.required === true && !source) {
      throw new Error(`RUNWAY_IDENTITY_SOURCE_REQUIRED:${text(lock.subject || lock.identity_subject || "UNKNOWN")}`);
    }
    if (!source && model === "gen4_turbo") {
      throw new Error("RUNWAY_TEXT_TO_VIDEO_MODEL_UNSUPPORTED:gen4_turbo");
    }

    const providerOptions = {
      ...(generation.provider_parameters || {}),
      ...(input.provider_parameters || {}),
      ...(input.provider_options || input.providerOptions || {}),
    };
    delete providerOptions.reference_asset_ids;
    delete providerOptions.identity_profile_id;
    delete providerOptions.requested_identity_angle;

    const output = input.output_spec || input.outputSpec || generation.output_spec || {};
    const requestedDuration = input.duration_seconds ?? input.duration ?? output.duration_seconds;
    const requestedRatio = input.aspect_ratio ?? input.ratio ?? output.aspect_ratio ?? output.ratio;
    const body = compactObject({
      model,
      promptText: prompt,
      promptImage: source,
      duration: runwayDuration(requestedDuration),
      ratio: runwayRatio(requestedRatio, Boolean(source)),
      seed: input.seed,
      ...providerOptions,
    });
    const apiVersion = input.api_version || input.apiVersion || process.env.RUNWAY_API_VERSION || RUNWAY_API_VERSION;
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
    if (!jobId && !outputValue) throw new Error("RUNWAY_OUTPUT_OR_JOB_REQUIRED");

    return {
      success: true,
      provider: "runway",
      model,
      output: {
        provider_job_id: jobId,
        status: jobId && !outputValue ? "processing" : "completed",
        source_url: source,
        identity_lock: lock.required === true ? {
          required: true,
          subject: text(lock.subject || lock.identity_subject),
          identity_profile_id: text(lock.identity_profile_id) || null,
          reference_asset_node_id: referenceIds[0] || null,
          reference_asset_node_ids: referenceIds,
          source_url: source,
          requested_identity_angle:
            text(lock.requested_identity_angle || lock.requested_angle) || null,
          background_reference_policy:
            text(lock.background_reference_policy || "EXCLUDE"),
          verification_required: lock.verification_required !== false,
        } : null,
        prompt_contract: {
          full_prompt_length: text(priorityPrompt(basePrompt, lock, referenceIds)).length,
          submitted_prompt_length: text(prompt).length,
          submitted_prompt_limit: RUNWAY_PROMPT_LIMIT,
          identity_priority_preserved: lock.required === true,
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
    const apiVersion = options.api_version || options.apiVersion || process.env.RUNWAY_API_VERSION || RUNWAY_API_VERSION;
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
