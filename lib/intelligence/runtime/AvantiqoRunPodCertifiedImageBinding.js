export const AVANTIQO_RUNPOD_CERTIFIED_IMAGE_BINDING_CONTRACT =
  "AVANTIQO_RUNPOD_CERTIFIED_IMAGE_BINDING_V1";

export const AVANTIQO_INTELLIGENCE_CERTIFIED_IMAGE_SOURCE_SHA =
  "bef2ff27b4774e66960a08322ebe8e5ee9f19dfb";

export const AVANTIQO_INTELLIGENCE_CERTIFIED_IMAGES = Object.freeze({
  trainer:
    "ghcr.io/churchillkaron/avantiqo-intelligence-trainer@sha256:eb24423075767c15d476c2ad0c9695482addf68e28b2b85af4768dc6a606bb4f",
  candidate:
    "ghcr.io/churchillkaron/avantiqo-intelligence-candidate@sha256:3e19d865a23567ae24bbef9ec562261cbceaa79bacaee71a36475cd911848ee7",
});

const RUNPOD_REST_BASE = "https://rest.runpod.io/v1";
const DEFAULT_TIMEOUT_MS = 30000;

function text(value, limit = 2000) {
  return String(value ?? "").trim().slice(0, limit);
}

function listResponse(value, candidateKey) {
  if (Array.isArray(value)) return value;
  if (Array.isArray(value?.[candidateKey])) return value[candidateKey];
  if (Array.isArray(value?.data)) return value.data;
  return [];
}

async function fetchJson(pathname, managementApiKey, timeoutMs) {
  const response = await fetch(`${RUNPOD_REST_BASE}${pathname}`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${managementApiKey}`,
      Accept: "application/json",
    },
    signal: AbortSignal.timeout(timeoutMs),
  });
  const raw = await response.text();
  let body = null;
  try {
    body = raw ? JSON.parse(raw) : null;
  } catch {
    body = null;
  }
  if (!response.ok) {
    const detail = text(body?.message || body?.error || body?.detail || raw, 800);
    throw new Error(
      `AVANTIQO_INTELLIGENCE_CERTIFIED_IMAGE_BINDING_RUNPOD_HTTP_${response.status}:${detail || "EMPTY_BODY"}`,
    );
  }
  return body ?? {};
}

function resolveTemplate(endpoint, templates) {
  const embedded = endpoint?.template;
  if (embedded && typeof embedded === "object" && text(embedded?.imageName || embedded?.image)) {
    return { template: embedded, source: "ENDPOINT_INCLUDE_TEMPLATE" };
  }
  const templateId = text(endpoint?.templateId || endpoint?.template?.id, 200);
  if (!templateId) {
    throw new Error("AVANTIQO_INTELLIGENCE_CERTIFIED_IMAGE_BINDING_TEMPLATE_ID_REQUIRED");
  }
  const matches = templates.filter((template) => text(template?.id, 200) === templateId);
  if (matches.length !== 1) {
    throw new Error(
      `AVANTIQO_INTELLIGENCE_CERTIFIED_IMAGE_BINDING_TEMPLATE_RESOLUTION_FAILED:${templateId}:${matches.length}`,
    );
  }
  return { template: matches[0], source: "ENDPOINT_BOUND_TEMPLATE_LIST" };
}

export async function assertAvantiqoRunPodCertifiedImageBinding({
  component,
  endpointId,
  managementApiKey,
  timeoutMs = DEFAULT_TIMEOUT_MS,
} = {}) {
  const normalizedComponent = text(component, 40).toLowerCase();
  const normalizedEndpointId = text(endpointId, 200);
  const key = text(managementApiKey, 2000);
  const expectedImage = AVANTIQO_INTELLIGENCE_CERTIFIED_IMAGES[normalizedComponent];
  if (!expectedImage) {
    throw new Error("AVANTIQO_INTELLIGENCE_CERTIFIED_IMAGE_BINDING_COMPONENT_INVALID");
  }
  if (!normalizedEndpointId || !/^[A-Za-z0-9_-]+$/.test(normalizedEndpointId)) {
    throw new Error("AVANTIQO_INTELLIGENCE_CERTIFIED_IMAGE_BINDING_ENDPOINT_ID_INVALID");
  }
  if (!key) {
    throw new Error("AVANTIQO_INTELLIGENCE_CERTIFIED_IMAGE_BINDING_MANAGEMENT_KEY_REQUIRED");
  }

  const resolvedTimeout = Math.max(1000, Math.min(120000, Number(timeoutMs) || DEFAULT_TIMEOUT_MS));
  const [endpointsBody, templatesBody] = await Promise.all([
    fetchJson("/endpoints?includeTemplate=true&includeWorkers=false", key, resolvedTimeout),
    fetchJson(
      "/templates?includeEndpointBoundTemplates=true&includePublicTemplates=false&includeRunpodTemplates=false",
      key,
      resolvedTimeout,
    ),
  ]);
  const endpoints = listResponse(endpointsBody, "endpoints");
  const templates = listResponse(templatesBody, "templates");
  const endpointMatches = endpoints.filter(
    (endpoint) => text(endpoint?.id, 200) === normalizedEndpointId,
  );
  if (endpointMatches.length !== 1) {
    throw new Error(
      `AVANTIQO_INTELLIGENCE_CERTIFIED_IMAGE_BINDING_ENDPOINT_RESOLUTION_FAILED:${normalizedEndpointId}:${endpointMatches.length}`,
    );
  }
  const endpoint = endpointMatches[0];
  const resolved = resolveTemplate(endpoint, templates);
  const actualImage = text(resolved.template?.imageName || resolved.template?.image, 1200);
  if (actualImage !== expectedImage) {
    throw new Error(
      `AVANTIQO_INTELLIGENCE_CERTIFIED_IMAGE_BINDING_MISMATCH:${normalizedComponent}`,
    );
  }

  return {
    contract: AVANTIQO_RUNPOD_CERTIFIED_IMAGE_BINDING_CONTRACT,
    component: normalizedComponent,
    certified_source_sha: AVANTIQO_INTELLIGENCE_CERTIFIED_IMAGE_SOURCE_SHA,
    endpoint_id: normalizedEndpointId,
    template_id: text(endpoint?.templateId || resolved.template?.id, 200) || null,
    template_resolution_source: resolved.source,
    immutable_image_reference: expectedImage,
    exact_immutable_image_binding_verified: true,
    mutation_performed: false,
    provider_job_submitted: false,
    production_model_promoted: false,
  };
}

export const AvantiqoRunPodCertifiedImageBinding = Object.freeze({
  contract: AVANTIQO_RUNPOD_CERTIFIED_IMAGE_BINDING_CONTRACT,
  sourceSha: AVANTIQO_INTELLIGENCE_CERTIFIED_IMAGE_SOURCE_SHA,
  images: AVANTIQO_INTELLIGENCE_CERTIFIED_IMAGES,
  assert: assertAvantiqoRunPodCertifiedImageBinding,
});
