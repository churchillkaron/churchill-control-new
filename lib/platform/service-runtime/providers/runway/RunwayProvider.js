import {
  CredentialRuntime,
} from "@/lib/platform/service-runtime/credentials/runtime/CredentialRuntime";
import {
  resolveFirstCreativeProviderAssetUrl,
  downloadCreativeProviderAssetSource,
} from "@/lib/creative/assets/storage/resolveCreativeProviderAssetUrl";

const RUNWAY_API_BASE = "https://api.dev.runwayml.com";
const RUNWAY_IMAGE_TO_VIDEO_ENDPOINT = `${RUNWAY_API_BASE}/v1/image_to_video`;
const RUNWAY_TEXT_TO_VIDEO_ENDPOINT = `${RUNWAY_API_BASE}/v1/text_to_video`;
const RUNWAY_TASK_ENDPOINT = `${RUNWAY_API_BASE}/v1/tasks`;
const RUNWAY_UPLOAD_ENDPOINT = `${RUNWAY_API_BASE}/v1/uploads`;
const RUNWAY_API_VERSION = "2024-11-06";
const RUNWAY_PROMPT_LIMIT = 1000;
const RUNWAY_DATA_URI_LIMIT = 5 * 1024 * 1024;
const RUNWAY_UPLOAD_LIMIT = 200 * 1024 * 1024;
const RUNWAY_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
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

function uniqueIds(values = []) {
  const ids = values.flat(Infinity).map((value) => text(
    value?.asset_id || value?.assetId || value?.id || value,
  )).filter(Boolean);
  return [...new Set(ids)];
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
  if (contentType === "image/png") return "png";
  if (contentType === "image/webp") return "webp";
  return "jpg";
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

async function prepareSource({
  organizationId,
  source,
  apiKey,
  apiVersion,
}) {
  if (!source) return { value: null, mode: "NONE" };
  if (source.startsWith("data:image/")) {
    return { value: source, mode: "DATA_URI" };
  }
  if (source.startsWith("runway://")) {
    return { value: source, mode: "RUNWAY_URI" };
  }

  const downloaded = await downloadCreativeProviderAssetSource({
    organization_id: organizationId,
    source,
  });
  const contentType = text(downloaded.content_type).toLowerCase();
  if (!RUNWAY_IMAGE_TYPES.has(contentType)) {
    throw new Error(
      `RUNWAY_SOURCE_CONTENT_TYPE_UNSUPPORTED:${contentType || "MISSING"}`,
    );
  }
  if (downloaded.bytes.length > RUNWAY_UPLOAD_LIMIT) {
    throw new Error(`RUNWAY_SOURCE_TOO_LARGE:${downloaded.bytes.length}`);
  }

  const dataUri =
    `data:${contentType};base64,${downloaded.bytes.toString("base64")}`;
  if (Buffer.byteLength(dataUri, "utf8") <= RUNWAY_DATA_URI_LIMIT) {
    return {
      value: dataUri,
      mode: downloaded.source_mode === "SUPABASE_STORAGE"
        ? "SUPABASE_STORAGE_DATA_URI"
        : "DATA_URI",
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
      ? "SUPABASE_STORAGE_RUNWAY_URI"
      : "RUNWAY_URI",
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

function resolveEndpoint(input, purpose, hasSource) {
  const configured = purpose === "status"
    ? input.status_endpoint || input.statusEndpoint || process.env.RUNWAY_STATUS_API_URL
    : input.endpoint || input.api_url || input.apiUrl || process.env.RUNWAY_API_URL;
  if (configured) return configured;
  if (purpose === "status") return RUNWAY_TASK_ENDPOINT;
  return hasSource
    ? RUNWAY_IMAGE_TO_VIDEO_ENDPOINT
    : RUNWAY_TEXT_TO_VIDEO_ENDPOINT;
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

export const RunwayProvider = {
  id: "runway",

  async execute(input = {}) {
    const { apiKey } = await resolveCredential(input.credential_id);
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
    const prompt = runwayPrompt(priorityPrompt(
      basePrompt,
      lock,
      referenceIds,
    ));
    const identityCandidates = referenceIds.map((id) => ({
      id,
      asset_id: id,
      role: "IDENTITY_REFERENCE",
    }));
    const organizationId = text(input.context?.organization_id);
    const originalSource = await resolveFirstCreativeProviderAssetUrl({
      organization_id: organizationId,
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
    const apiVersion = text(
      input.api_version ||
      input.apiVersion ||
      process.env.RUNWAY_API_VERSION ||
      RUNWAY_API_VERSION,
    );
    const prepared = await prepareSource({
      organizationId,
      source: originalSource,
      apiKey,
      apiVersion,
    });

    if (!model) throw new Error("RUNWAY_MODEL_REQUIRED");
    if (!prompt && !prepared.value) {
      throw new Error("RUNWAY_PROMPT_OR_SOURCE_REQUIRED");
    }
    if (lock.required === true && !referenceIds.length) {
      throw new Error("RUNWAY_IDENTITY_REFERENCE_SET_REQUIRED");
    }
    if (lock.required === true && !prepared.value) {
      throw new Error("RUNWAY_IDENTITY_SOURCE_REQUIRED");
    }
    if (!prepared.value && model === "gen4_turbo") {
      throw new Error("RUNWAY_TEXT_TO_VIDEO_MODEL_UNSUPPORTED:gen4_turbo");
    }

    const output = object(
      input.output_spec || input.outputSpec || generation.output_spec,
    );
    const body = compact({
      model,
      promptText: prompt,
      promptImage: prepared.value,
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
        Boolean(prepared.value),
      ),
      seed: input.seed,
      ...providerOptions(input, generation, model),
    });

    const endpoint = resolveEndpoint(
      input,
      "submit",
      Boolean(prepared.value),
    );
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
        source_url: originalSource,
        source_delivery_mode: prepared.mode,
        identity_lock: lock.required === true ? {
          required: true,
          subject: text(lock.subject || lock.identity_subject),
          identity_profile_id: text(lock.identity_profile_id) || null,
          reference_asset_node_id: referenceIds[0] || null,
          reference_asset_node_ids: referenceIds,
          source_url: originalSource,
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
      resolveEndpoint(options, "status", false),
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
