import {
  CredentialRuntime,
} from "@/lib/platform/service-runtime/credentials/runtime/CredentialRuntime";
import {
  resolveCreativeProviderAssetUrl,
  downloadCreativeProviderAssetSource,
} from "@/lib/creative/assets/storage/resolveCreativeProviderAssetUrl";

const RUNWAY_API_BASE = "https://api.dev.runwayml.com";
const RUNWAY_IMAGE_TO_VIDEO_ENDPOINT = `${RUNWAY_API_BASE}/v1/image_to_video`;
const RUNWAY_TEXT_TO_VIDEO_ENDPOINT = `${RUNWAY_API_BASE}/v1/text_to_video`;
const RUNWAY_VIDEO_TO_VIDEO_ENDPOINT = `${RUNWAY_API_BASE}/v1/video_to_video`;
const RUNWAY_TASK_ENDPOINT = `${RUNWAY_API_BASE}/v1/tasks`;
const RUNWAY_UPLOAD_ENDPOINT = `${RUNWAY_API_BASE}/v1/uploads`;
const RUNWAY_API_VERSION = "2024-11-06";
const RUNWAY_PROMPT_LIMIT = 1000;
const RUNWAY_IMAGE_DATA_URI_LIMIT = 5 * 1024 * 1024;
const RUNWAY_VIDEO_DATA_URI_LIMIT = 16 * 1024 * 1024;
const RUNWAY_UPLOAD_LIMIT = 200 * 1024 * 1024;

const RUNWAY_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
]);
const RUNWAY_VIDEO_TYPES = new Set([
  "video/mp4",
  "video/quicktime",
  "video/x-matroska",
  "video/webm",
  "video/3gpp",
  "video/ogg",
  "video/x-msvideo",
  "video/x-flv",
  "video/mpeg",
]);
const IMAGE_TO_VIDEO_MODELS = new Set([
  "gen4.5",
  "gen4_turbo",
  "veo3",
  "veo3.1",
  "veo3.1_fast",
  "happyhorse_1_0",
  "seedance2",
  "seedance2_fast",
  "seedance2_mini",
  "gemini_omni_flash",
]);
const VIDEO_TO_VIDEO_MODELS = new Set([
  "aleph2",
  "seedance2",
  "seedance2_fast",
  "seedance2_mini",
  "gemini_omni_flash",
]);
const TEXT_TO_VIDEO_MODELS = new Set([
  "gen4.5",
  "veo3",
  "veo3.1",
  "veo3.1_fast",
  "happyhorse_1_0",
  "seedance2",
  "seedance2_fast",
  "seedance2_mini",
  "gemini_omni_flash",
]);

function text(value) {
  return String(value ?? "").trim();
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function list(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function compact(value = {}) {
  return Object.fromEntries(
    Object.entries(value).filter(([, item]) =>
      item !== undefined && item !== null && item !== ""),
  );
}

function selectedAssets(input = {}) {
  if (Array.isArray(input.assets)) return input.assets;
  if (Array.isArray(input.assets?.selectedAssets)) {
    return input.assets.selectedAssets;
  }
  if (Array.isArray(input.source_assets)) return input.source_assets;
  if (Array.isArray(input.sourceAssets)) return input.sourceAssets;
  if (Array.isArray(input.selected_assets)) return input.selected_assets;
  if (Array.isArray(input.selectedAssets)) return input.selectedAssets;
  return [];
}

function scalarId(value) {
  if (typeof value === "string" || typeof value === "number") {
    return text(value);
  }
  if (!value || typeof value !== "object") return "";
  for (const candidate of [
    value.asset_id,
    value.assetId,
    value.creative_asset_id,
    value.creativeAssetId,
    value.id,
  ]) {
    if (typeof candidate === "string" || typeof candidate === "number") {
      const resolved = text(candidate);
      if (resolved) return resolved;
    }
  }
  return "";
}

function uniqueIds(values = []) {
  return [...new Set(
    values.flat(Infinity).map(scalarId).filter(Boolean),
  )];
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
  if (lock.required !== true) return [];
  return uniqueIds([
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

function priorityPrompt(basePrompt, lock, referenceIds) {
  const prompt = text(basePrompt);
  if (lock.required !== true) return prompt;

  const subject = text(
    lock.subject || lock.identity_subject || "the approved real person",
  );
  const angle = text(
    lock.requested_identity_angle ||
    lock.requested_angle ||
    lock.requested_face_angle ||
    "the specified camera angle",
  );
  const backgroundPolicy = text(
    lock.background_reference_policy || "EXCLUDE",
  ).toUpperCase();

  return [
    `IDENTITY LOCK — HIGHEST PRIORITY: Preserve ${subject} as the exact same real person represented by reference assets ${referenceIds.join(", ") || "attached to this task"}.`,
    `ANGLE: Preserve identity at ${angle}. Keep facial geometry, skin tone, hair, age, body proportions and distinguishing features consistent.`,
    "Do not substitute a lookalike, generic AI person, different ethnicity or age, duplicated subject, or altered body proportions.",
    backgroundPolicy === "EXCLUDE"
      ? "REFERENCE BACKGROUND POLICY: Use references only for identity. Replace their backgrounds with the approved shot environment."
      : `REFERENCE BACKGROUND POLICY: ${backgroundPolicy}.`,
    prompt,
  ].filter(Boolean).join("\n\n");
}

function runwayPrompt(value) {
  const prompt = text(value);
  if (!prompt) return null;
  if (prompt.length <= RUNWAY_PROMPT_LIMIT) return prompt;

  const priority = [
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
      priority.some((marker) => section.includes(marker))),
    ...sections.filter((section) =>
      !priority.some((marker) => section.includes(marker))),
  ];

  let output = "";
  for (const section of ordered) {
    const candidate = output ? `${output}\n\n${section}` : section;
    if (candidate.length <= RUNWAY_PROMPT_LIMIT) output = candidate;
  }
  return (output || prompt).slice(0, RUNWAY_PROMPT_LIMIT);
}

function runwayDuration(value) {
  const duration = Number(value);
  if (!Number.isFinite(duration)) return 5;
  return Math.max(2, Math.min(10, Math.round(duration)));
}

function runwayRatio(value, hasSource) {
  const ratio = text(value).toLowerCase().replace(/\s+/g, "");
  if (["9:16", "1080:1920", "720:1280", "1080x1920", "720x1280"].includes(ratio)) {
    return "720:1280";
  }
  if (
    hasSource &&
    ["1:1", "1080:1080", "960:960", "1080x1080", "960x960"].includes(ratio)
  ) {
    return "960:960";
  }
  return "1280:720";
}

function extension(contentType) {
  const type = text(contentType).toLowerCase();
  if (type === "image/png") return "png";
  if (type === "image/webp") return "webp";
  if (type === "video/quicktime") return "mov";
  if (type === "video/webm") return "webm";
  if (type === "video/x-matroska") return "mkv";
  if (type === "video/3gpp") return "3gp";
  if (type === "video/ogg") return "ogv";
  if (type === "video/x-msvideo") return "avi";
  if (type === "video/x-flv") return "flv";
  if (type === "video/mpeg") return "mpeg";
  if (type.startsWith("video/")) return "mp4";
  return "jpg";
}

function mediaKind(contentType) {
  const type = text(contentType).toLowerCase().split(";")[0];
  if (RUNWAY_IMAGE_TYPES.has(type)) return "image";
  if (RUNWAY_VIDEO_TYPES.has(type)) return "video";
  return null;
}

function supportedKinds(model) {
  const kinds = [];
  if (IMAGE_TO_VIDEO_MODELS.has(model)) kinds.push("image");
  if (VIDEO_TO_VIDEO_MODELS.has(model)) kinds.push("video");
  return kinds;
}

function candidateValues(input, lock, referenceIds) {
  const identityCandidates = lock.required === true
    ? referenceIds.map((id) => ({
      id,
      asset_id: id,
      role: "IDENTITY_REFERENCE",
    }))
    : [];

  return [
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
  ].flat(Infinity).filter((value) =>
    value !== undefined && value !== null && value !== "",
  );
}

function runwayIssueMessage(issue = {}) {
  const path = Array.isArray(issue.path)
    ? issue.path.join(".")
    : text(issue.path);
  const message = text(issue.message || issue.reason || issue.code);
  return [path, message].filter(Boolean).join(":");
}

function runwayErrorMessage(result = {}, status, operation = "request") {
  const primary =
    (typeof result.error === "string" ? result.error : result.error?.message) ||
    result.message ||
    `Runway ${operation} failed with status ${status}`;
  const issues = list(result.issues)
    .map(runwayIssueMessage)
    .filter(Boolean);
  return issues.length ? `${primary}|issues=${issues.join(";")}` : primary;
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

async function uploadRunwayFile({
  apiKey,
  apiVersion,
  bytes,
  contentType,
  filename,
}) {
  const initResponse = await fetch(RUNWAY_UPLOAD_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "X-Runway-Version": apiVersion,
    },
    body: JSON.stringify({ filename, type: "ephemeral" }),
  });
  const initResult = await initResponse.json().catch(() => ({}));
  if (!initResponse.ok) {
    throw new Error(runwayErrorMessage(
      initResult,
      initResponse.status,
      "upload initialization",
    ));
  }

  const uploadUrl = text(initResult.uploadUrl);
  const runwayUri = text(initResult.runwayUri);
  if (!uploadUrl || !runwayUri) {
    throw new Error("RUNWAY_EPHEMERAL_UPLOAD_CONTRACT_INVALID");
  }

  const form = new FormData();
  for (const [key, value] of Object.entries(object(initResult.fields))) {
    form.append(key, String(value));
  }
  form.append("file", new Blob([bytes], { type: contentType }), filename);

  const uploadResponse = await fetch(uploadUrl, {
    method: "POST",
    body: form,
  });
  if (!uploadResponse.ok) {
    throw new Error(
      `RUNWAY_EPHEMERAL_UPLOAD_FAILED:${uploadResponse.status}`,
    );
  }
  return runwayUri;
}

async function prepareDownloadedSource({
  downloaded,
  kind,
  apiKey,
  apiVersion,
}) {
  const contentType = text(downloaded.content_type).toLowerCase().split(";")[0];
  if (downloaded.bytes.length > RUNWAY_UPLOAD_LIMIT) {
    throw new Error(`RUNWAY_SOURCE_TOO_LARGE:${downloaded.bytes.length}`);
  }

  const dataUriLimit = kind === "video"
    ? RUNWAY_VIDEO_DATA_URI_LIMIT
    : RUNWAY_IMAGE_DATA_URI_LIMIT;
  const dataUri =
    `data:${contentType};base64,${downloaded.bytes.toString("base64")}`;
  if (Buffer.byteLength(dataUri, "utf8") <= dataUriLimit) {
    return {
      value: dataUri,
      mode: downloaded.source_mode === "SUPABASE_STORAGE"
        ? `SUPABASE_STORAGE_${kind.toUpperCase()}_DATA_URI`
        : `${kind.toUpperCase()}_DATA_URI`,
    };
  }

  const runwayUri = await uploadRunwayFile({
    apiKey,
    apiVersion,
    bytes: downloaded.bytes,
    contentType,
    filename:
      text(downloaded.filename) ||
      `avantiqo-runway-input.${extension(contentType)}`,
  });
  return {
    value: runwayUri,
    mode: downloaded.source_mode === "SUPABASE_STORAGE"
      ? `SUPABASE_STORAGE_${kind.toUpperCase()}_RUNWAY_URI`
      : `${kind.toUpperCase()}_RUNWAY_URI`,
  };
}

async function resolvePreparedSource({
  organizationId,
  values,
  model,
  apiKey,
  apiVersion,
}) {
  const allowedKinds = supportedKinds(model);
  const observedTypes = [];

  for (const value of values) {
    const source = await resolveCreativeProviderAssetUrl({
      organization_id: organizationId,
      value,
    });
    if (!source) continue;

    if (source.startsWith("data:image/") && allowedKinds.includes("image")) {
      return {
        original: source,
        value: source,
        kind: "image",
        content_type: source.slice(5, source.indexOf(";")),
        mode: "IMAGE_DATA_URI",
      };
    }
    if (source.startsWith("data:video/") && allowedKinds.includes("video")) {
      return {
        original: source,
        value: source,
        kind: "video",
        content_type: source.slice(5, source.indexOf(";")),
        mode: "VIDEO_DATA_URI",
      };
    }

    const downloaded = await downloadCreativeProviderAssetSource({
      organization_id: organizationId,
      source,
    });
    const contentType = text(downloaded.content_type).toLowerCase().split(";")[0];
    const kind = mediaKind(contentType);
    observedTypes.push(contentType || "MISSING");
    if (!kind || !allowedKinds.includes(kind)) continue;

    const prepared = await prepareDownloadedSource({
      downloaded,
      kind,
      apiKey,
      apiVersion,
    });
    return {
      original: source,
      value: prepared.value,
      kind,
      content_type: contentType,
      mode: prepared.mode,
    };
  }

  return {
    original: null,
    value: null,
    kind: null,
    content_type: null,
    mode: "NONE",
    observed_types: [...new Set(observedTypes)],
  };
}

function providerOptions(input, generation, model) {
  const source = {
    ...object(generation.provider_parameters),
    ...object(input.provider_parameters),
    ...object(input.provider_options || input.providerOptions),
  };
  const output = {};
  if (Object.keys(object(source.contentModeration)).length) {
    output.contentModeration = object(source.contentModeration);
  }
  if (
    ["veo3", "veo3.1", "veo3.1_fast"].includes(model) &&
    text(source.negativePrompt)
  ) {
    output.negativePrompt = runwayPrompt(source.negativePrompt);
  }
  return output;
}

function resolveEndpoint(input, purpose, sourceKind) {
  const configured = purpose === "status"
    ? input.status_endpoint || input.statusEndpoint || process.env.RUNWAY_STATUS_API_URL
    : input.endpoint || input.api_url || input.apiUrl || process.env.RUNWAY_API_URL;
  if (configured) return configured;
  if (purpose === "status") return RUNWAY_TASK_ENDPOINT;
  if (sourceKind === "video") return RUNWAY_VIDEO_TO_VIDEO_ENDPOINT;
  if (sourceKind === "image") return RUNWAY_IMAGE_TO_VIDEO_ENDPOINT;
  return RUNWAY_TEXT_TO_VIDEO_ENDPOINT;
}

function statusEndpoint(template, jobId) {
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

function generationBody({
  input,
  generation,
  model,
  prompt,
  prepared,
}) {
  const options = providerOptions(input, generation, model);
  if (prepared.kind === "video") {
    return compact({
      model,
      promptText: prompt,
      videoUri: prepared.value,
      ...options,
    });
  }

  const output = object(
    input.output_spec || input.outputSpec || generation.output_spec,
  );
  return compact({
    model,
    promptText: prompt,
    promptImage: prepared.kind === "image" ? prepared.value : null,
    duration: runwayDuration(
      input.duration_seconds ??
      input.duration ??
      output.duration_seconds,
    ),
    ratio: runwayRatio(
      input.aspect_ratio ??
      input.ratio ??
      output.aspect_ratio ??
      output.ratio,
      prepared.kind === "image",
    ),
    seed: input.seed,
    ...options,
  });
}

export const RunwayProvider = {
  id: "runway",

  async execute(input = {}) {
    const { apiKey } = await resolveCredential(input.credential_id);
    const generation = object(input.generation);
    const model = text(input.model || generation.model);
    if (!model) throw new Error("RUNWAY_MODEL_REQUIRED");

    const lock = identityLock(input);
    const referenceIds = identityReferenceIds(lock, input);
    const basePrompt =
      input.prompt ||
      input.promptText ||
      input.instructions?.prompt ||
      input.provider_prompt ||
      generation.provider_prompt;
    const prompt = runwayPrompt(priorityPrompt(
      basePrompt,
      lock,
      referenceIds,
    ));
    const organizationId = text(input.context?.organization_id);
    const apiVersion = text(
      input.api_version ||
      input.apiVersion ||
      process.env.RUNWAY_API_VERSION ||
      RUNWAY_API_VERSION,
    );
    const prepared = await resolvePreparedSource({
      organizationId,
      values: candidateValues(input, lock, referenceIds),
      model,
      apiKey,
      apiVersion,
    });

    if (!prompt && !prepared.value) {
      throw new Error("RUNWAY_PROMPT_OR_SOURCE_REQUIRED");
    }
    if (lock.required === true && !referenceIds.length) {
      throw new Error("RUNWAY_IDENTITY_REFERENCE_SET_REQUIRED");
    }
    if (lock.required === true && !prepared.value) {
      throw new Error("RUNWAY_IDENTITY_SOURCE_REQUIRED");
    }
    if (
      !prepared.value &&
      prepared.observed_types?.length
    ) {
      throw new Error(
        `RUNWAY_COMPATIBLE_SOURCE_NOT_FOUND:model=${model};types=${prepared.observed_types.join(",")}`,
      );
    }
    if (!prepared.value && !TEXT_TO_VIDEO_MODELS.has(model)) {
      throw new Error(`RUNWAY_TEXT_TO_VIDEO_MODEL_UNSUPPORTED:${model}`);
    }

    const body = generationBody({
      input,
      generation,
      model,
      prompt,
      prepared,
    });
    const endpoint = resolveEndpoint(input, "submit", prepared.kind);
    const response = await fetch(endpoint, {
      method: input.method || "POST",
      headers: compact({
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "X-Runway-Version": apiVersion,
        ...object(input.headers),
      }),
      body: JSON.stringify(body),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(runwayErrorMessage(
        result,
        response.status,
        "request",
      ));
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
        source_url: prepared.original,
        source_media_kind: prepared.kind,
        source_content_type: prepared.content_type,
        source_delivery_mode: prepared.mode,
        identity_lock: lock.required === true ? {
          required: true,
          subject: text(lock.subject || lock.identity_subject),
          identity_profile_id: text(lock.identity_profile_id) || null,
          reference_asset_node_id: referenceIds[0] || null,
          reference_asset_node_ids: referenceIds,
          source_url: prepared.original,
          source_delivery_mode: prepared.mode,
          requested_identity_angle: text(
            lock.requested_identity_angle || lock.requested_angle,
          ) || null,
          background_reference_policy: text(
            lock.background_reference_policy || "EXCLUDE",
          ),
          verification_required:
            lock.verification_required !== false,
        } : null,
        prompt_contract: {
          full_prompt_length: text(priorityPrompt(
            basePrompt,
            lock,
            referenceIds,
          )).length,
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
    const apiVersion = text(
      options.api_version ||
      options.apiVersion ||
      process.env.RUNWAY_API_VERSION ||
      RUNWAY_API_VERSION,
    );
    const endpoint = statusEndpoint(
      resolveEndpoint(options, "status", null),
      jobId,
    );
    const response = await fetch(endpoint, {
      method: options.method || "GET",
      headers: compact({
        Authorization: `Bearer ${apiKey}`,
        "X-Runway-Version": apiVersion,
        ...object(options.headers),
      }),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(runwayErrorMessage(
        result,
        response.status,
        "status request",
      ));
    }
    return result;
  },
};

export async function getRunwayTaskStatus(input) {
  return RunwayProvider.getStatus(input);
}
