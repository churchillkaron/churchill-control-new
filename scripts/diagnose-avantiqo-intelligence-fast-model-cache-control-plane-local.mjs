import { spawnSync } from "node:child_process";

const REST_BASE = "https://rest.runpod.io/v1";
const QUEUE_BASE = "https://api.runpod.ai/v2";
const GRAPHQL_URL = "https://api.runpod.io/graphql";
const DEEP_NAME = "avantiqo-intelligence-v1";
const FAST_NAME = "avantiqo-intelligence-fast-v1";
const FAST_MODEL = "Qwen/Qwen3-30B-A3B-Instruct-2507";
const CONTRACT =
  "AVANTIQO_INTELLIGENCE_FAST_MODEL_CACHE_CONTROL_PLANE_DIAGNOSTIC_V1";
const EXPECTED_MAIN_ENV =
  "AVANTIQO_INTELLIGENCE_FAST_MODEL_CACHE_CONTROL_PLANE_EXPECTED_MAIN";

const text = (value) => String(value ?? "").trim();
const list = (value) => (Array.isArray(value) ? value : []);
const object = (value) =>
  value && typeof value === "object" && !Array.isArray(value) ? value : {};
const finite = (value, fallback = null) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
};

function redact(value) {
  return text(value)
    .replace(/Bearer\s+[A-Za-z0-9._~+\/-]{8,}/gi, "Bearer [REDACTED]")
    .replace(
      /((?:api[_-]?key|token|password|secret|authorization)\s*[=:]\s*)[^\s,;]+/gi,
      "$1[REDACTED]",
    )
    .replace(
      /([?&](?:token|key|api_key|apikey|sig|signature)=)[^&\s]+/gi,
      "$1[REDACTED]",
    );
}

function shell(name, args, code) {
  const result = spawnSync(name, args, {
    cwd: process.cwd(),
    encoding: "utf8",
    env: process.env,
  });
  if (result.status !== 0) {
    throw new Error(
      `${code}:${redact(result.stderr || result.stdout).slice(0, 700)}`,
    );
  }
  return text(result.stdout);
}

function validateMain() {
  const expectedMain = text(process.env[EXPECTED_MAIN_ENV]);
  if (expectedMain && !/^[0-9a-f]{40}$/i.test(expectedMain)) {
    throw new Error(
      `AVANTIQO_INTELLIGENCE_FAST_MODEL_CACHE_CONTROL_PLANE_EXPECTED_MAIN_INVALID:${expectedMain.slice(0, 80)}`,
    );
  }

  const branch = shell(
    "git",
    ["branch", "--show-current"],
    "AVANTIQO_INTELLIGENCE_FAST_MODEL_CACHE_CONTROL_PLANE_GIT_BRANCH_FAILED",
  );
  if (branch !== "main") {
    throw new Error(
      `AVANTIQO_INTELLIGENCE_FAST_MODEL_CACHE_CONTROL_PLANE_MAIN_REQUIRED:actual=${branch || "DETACHED"}`,
    );
  }

  const head = shell(
    "git",
    ["rev-parse", "HEAD"],
    "AVANTIQO_INTELLIGENCE_FAST_MODEL_CACHE_CONTROL_PLANE_GIT_HEAD_FAILED",
  );

  if (expectedMain) {
    if (head !== expectedMain) {
      throw new Error(
        `AVANTIQO_INTELLIGENCE_FAST_MODEL_CACHE_CONTROL_PLANE_PINNED_MAIN_MISMATCH:head=${head}:expected=${expectedMain}`,
      );
    }
    return { head, pinned: true };
  }

  shell(
    "git",
    ["fetch", "origin", "main"],
    "AVANTIQO_INTELLIGENCE_FAST_MODEL_CACHE_CONTROL_PLANE_GIT_FETCH_FAILED",
  );
  const remote = shell(
    "git",
    ["rev-parse", "origin/main"],
    "AVANTIQO_INTELLIGENCE_FAST_MODEL_CACHE_CONTROL_PLANE_GIT_REMOTE_FAILED",
  );
  if (head !== remote) {
    throw new Error(
      `AVANTIQO_INTELLIGENCE_FAST_MODEL_CACHE_CONTROL_PLANE_LOCAL_MAIN_NOT_CURRENT:head=${head}:origin_main=${remote}`,
    );
  }

  return { head, pinned: false };
}

function managementCredential() {
  const value = text(
    process.env.RUNPOD_MANAGEMENT_API_KEY || process.env.RUNPOD_API_KEY,
  );
  if (!value) throw new Error("RUNPOD_MANAGEMENT_OR_API_KEY_REQUIRED");
  return value;
}

function runtimeCredential(managementKey) {
  return text(process.env.RUNPOD_API_KEY) || managementKey;
}

async function requestJson(url, key, options = {}) {
  const response = await fetch(url, {
    method: options.method || "GET",
    headers: {
      Authorization: `Bearer ${key}`,
      Accept: "application/json",
      ...(options.body ? { "Content-Type": "application/json" } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
    signal: AbortSignal.timeout(options.timeoutMs || 30_000),
  });

  const raw = await response.text();
  let body = null;
  try {
    body = raw ? JSON.parse(raw) : null;
  } catch {
    body = null;
  }

  if (!response.ok || body === null) {
    const detail = redact(
      body?.message || body?.error || body?.detail || raw,
    ).slice(0, 700);
    throw new Error(
      `AVANTIQO_INTELLIGENCE_FAST_MODEL_CACHE_CONTROL_PLANE_HTTP_${response.status}:${detail || "EMPTY_BODY"}`,
    );
  }

  return body;
}

async function rest(path, key, options = {}) {
  return requestJson(`${REST_BASE}${path}`, key, options);
}

async function graphql(query, variables, key, { optional = false } = {}) {
  try {
    const response = await requestJson(GRAPHQL_URL, key, {
      method: "POST",
      body: { query, variables },
      timeoutMs: 30_000,
    });

    if (Array.isArray(response?.errors) && response.errors.length > 0) {
      const message = redact(response.errors[0]?.message).slice(0, 700);
      if (optional) return { ok: false, error: message, response: null };
      throw new Error(
        `AVANTIQO_INTELLIGENCE_FAST_MODEL_CACHE_CONTROL_PLANE_GRAPHQL:${message}`,
      );
    }

    return optional
      ? { ok: true, error: null, response }
      : response;
  } catch (error) {
    if (optional) {
      return {
        ok: false,
        error: redact(error instanceof Error ? error.message : error).slice(0, 700),
        response: null,
      };
    }
    throw error;
  }
}

async function queueHealth(endpointId, key) {
  return requestJson(
    `${QUEUE_BASE}/${encodeURIComponent(endpointId)}/health`,
    key,
    { timeoutMs: 20_000 },
  );
}

function normalizeRows(value, keys = []) {
  if (Array.isArray(value)) return value;
  if (!value || typeof value !== "object") return [];
  for (const key of [...keys, "data", "items", "results"]) {
    if (Array.isArray(value[key])) return value[key];
  }
  return [];
}

function resolveOne(rows, name, code) {
  const matches = normalizeRows(rows).filter((row) => text(row?.name) === name);
  if (matches.length !== 1) {
    throw new Error(`${code}:name=${name}:matches=${matches.length}`);
  }
  return matches[0];
}

function modelReferences(endpoint) {
  return list(endpoint?.modelReferences)
    .map((entry) =>
      text(
        typeof entry === "string"
          ? entry
          : entry?.url || entry?.reference || entry?.name,
      ),
    )
    .filter(Boolean);
}

function healthSummary(value = {}) {
  const jobs = object(value?.jobs);
  const workers = object(value?.workers);
  return {
    jobs: {
      in_queue: finite(jobs.inQueue ?? jobs.in_queue, 0),
      in_progress: finite(jobs.inProgress ?? jobs.in_progress, 0),
    },
    workers: {
      initializing: finite(workers.initializing, 0),
      running: finite(workers.running, 0),
      unhealthy: finite(workers.unhealthy, 0),
    },
  };
}

function endpointRuntimeSummary(endpoint, health) {
  return {
    name: text(endpoint?.name) || null,
    workers_min: finite(endpoint?.workersMin, -1),
    workers_max: finite(endpoint?.workersMax, -1),
    health,
  };
}

function canonicalState(deep, fast) {
  return (
    deep.workers_min === 0 &&
    deep.workers_max === 1 &&
    fast.workers_min === 0 &&
    fast.workers_max === 0 &&
    deep.health.jobs.in_queue === 0 &&
    deep.health.jobs.in_progress === 0 &&
    fast.health.jobs.in_queue === 0 &&
    fast.health.jobs.in_progress === 0 &&
    deep.health.workers.unhealthy === 0 &&
    fast.health.workers.unhealthy === 0
  );
}

const SAVE_FIELDS = [
  "id",
  "name",
  "templateId",
  "gpuIds",
  "gpuCount",
  "gpuTypeIds",
  "instanceIds",
  "workersMin",
  "workersMax",
  "locations",
  "dataCenterIds",
  "networkVolumeId",
  "networkVolumeIds",
  "idleTimeout",
  "scalerType",
  "scalerValue",
  "executionTimeoutMs",
  "minCudaVersion",
  "allowedCudaVersions",
  "flashboot",
  "flashBootType",
  "computeType",
  "modelReferences",
];

function compactEndpointShape(endpoint) {
  const output = {};
  for (const field of SAVE_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(object(endpoint), field)) {
      output[field] = endpoint[field];
    } else {
      output[field] = "__ABSENT__";
    }
  }
  return output;
}

function compareShapes(plain, expanded) {
  const differences = [];
  for (const field of SAVE_FIELDS) {
    const left = JSON.stringify(plain[field]);
    const right = JSON.stringify(expanded[field]);
    if (left !== right) {
      differences.push({
        field,
        plain: plain[field],
        expanded: expanded[field],
      });
    }
  }
  return differences;
}

function unwrapNamedType(type) {
  let current = type;
  while (current && !current.name && current.ofType) current = current.ofType;
  return current || null;
}

function scalarSelectionFields(typeInfo) {
  return list(typeInfo?.fields)
    .filter((field) => {
      const named = unwrapNamedType(field?.type);
      return named && (named.kind === "SCALAR" || named.kind === "ENUM");
    })
    .map((field) => text(field?.name))
    .filter(Boolean);
}

const INTROSPECTION_QUERY = `
query AvantiqoRunpodCacheSchema {
  endpointInput: __type(name: "EndpointInput") {
    kind
    name
    inputFields {
      name
      type {
        kind
        name
        ofType {
          kind
          name
          ofType {
            kind
            name
          }
        }
      }
    }
  }
  modelStatusInfo: __type(name: "ModelStatusInfo") {
    kind
    name
    fields {
      name
      type {
        kind
        name
        ofType {
          kind
          name
          ofType {
            kind
            name
          }
        }
      }
    }
  }
}`;

async function readEndpointGraphqlState(fastId, managementKey, modelStatusFields) {
  const modelStatusSelection =
    modelStatusFields.length > 0
      ? `modelStatus { ${modelStatusFields.join(" ")} }`
      : "";

  const query = `
query AvantiqoFastEndpointCacheState {
  myself {
    endpoints {
      id
      name
      modelReferences
      ${modelStatusSelection}
    }
  }
}`;

  const result = await graphql(query, {}, managementKey, { optional: true });
  if (!result.ok) return result;

  const endpoints = list(result.response?.data?.myself?.endpoints);
  const matches = endpoints.filter((endpoint) => text(endpoint?.id) === fastId);
  if (matches.length !== 1) {
    return {
      ok: false,
      error: `FAST_GRAPHQL_ENDPOINT_MATCHES_${matches.length}`,
      response: null,
    };
  }

  const endpoint = matches[0];
  return {
    ok: true,
    error: null,
    response: {
      id: fastId,
      name: text(endpoint?.name) || null,
      model_references: modelReferences(endpoint),
      model_status: endpoint?.modelStatus ?? null,
    },
  };
}

async function readModelRepository(managementKey) {
  const query = `
query AvantiqoModelRepositoryState {
  myModels {
    id
    owner
    name
    provider
    status
    versions {
      uuid
      hash
      status
    }
  }
}`;

  const result = await graphql(query, {}, managementKey, { optional: true });
  if (!result.ok) return result;

  const models = list(result.response?.data?.myModels).map((model) => ({
    id: text(model?.id) || null,
    owner: text(model?.owner) || null,
    name: text(model?.name) || null,
    provider: text(model?.provider) || null,
    status: text(model?.status) || null,
    versions: list(model?.versions).map((version) => ({
      uuid: text(version?.uuid) || null,
      hash: text(version?.hash) || null,
      status: text(version?.status) || null,
    })),
  }));

  return { ok: true, error: null, response: models };
}

const main = validateMain();
const managementKey = managementCredential();
const queueKey = runtimeCredential(managementKey);

const endpointsRaw = await rest(
  "/endpoints?includeTemplate=true&includeWorkers=true",
  managementKey,
);
const endpoints = normalizeRows(endpointsRaw, ["endpoints", "serverlessEndpoints"]);
const deepList = resolveOne(
  endpoints,
  DEEP_NAME,
  "AVANTIQO_INTELLIGENCE_FAST_MODEL_CACHE_CONTROL_PLANE_DEEP_RESOLUTION_FAILED",
);
const fastList = resolveOne(
  endpoints,
  FAST_NAME,
  "AVANTIQO_INTELLIGENCE_FAST_MODEL_CACHE_CONTROL_PLANE_FAST_RESOLUTION_FAILED",
);
const deepId = text(deepList?.id);
const fastId = text(fastList?.id);
if (!deepId || !fastId) {
  throw new Error(
    "AVANTIQO_INTELLIGENCE_FAST_MODEL_CACHE_CONTROL_PLANE_ENDPOINT_IDS_REQUIRED",
  );
}

const [
  deepPlain,
  fastPlain,
  fastExpanded,
  deepHealthRaw,
  fastHealthRaw,
  introspection,
  modelRepository,
] = await Promise.all([
  rest(`/endpoints/${encodeURIComponent(deepId)}`, managementKey),
  rest(`/endpoints/${encodeURIComponent(fastId)}`, managementKey),
  rest(
    `/endpoints/${encodeURIComponent(fastId)}?includeTemplate=true&includeWorkers=true`,
    managementKey,
  ),
  queueHealth(deepId, queueKey),
  queueHealth(fastId, queueKey),
  graphql(INTROSPECTION_QUERY, {}, managementKey, { optional: true }),
  readModelRepository(managementKey),
]);

const deep = endpointRuntimeSummary(
  deepPlain,
  healthSummary(deepHealthRaw),
);
const fast = endpointRuntimeSummary(
  fastPlain,
  healthSummary(fastHealthRaw),
);
const canonical = canonicalState(deep, fast);

const plainShape = compactEndpointShape(fastPlain);
const expandedShape = compactEndpointShape(fastExpanded);
const shapeDifferences = compareShapes(plainShape, expandedShape);

const endpointInputFields = introspection.ok
  ? list(introspection.response?.data?.endpointInput?.inputFields).map((field) =>
      text(field?.name),
    )
  : [];
const modelStatusType = introspection.ok
  ? introspection.response?.data?.modelStatusInfo
  : null;
const modelStatusFields = scalarSelectionFields(modelStatusType);
const endpointGraphqlState = await readEndpointGraphqlState(
  fastId,
  managementKey,
  modelStatusFields,
);

const publicModelRegisteredInPrivateRepository = modelRepository.ok
  ? list(modelRepository.response).some(
      (model) =>
        `${text(model?.owner)}/${text(model?.name)}` === FAST_MODEL ||
        text(model?.name) === FAST_MODEL,
    )
  : null;

const modelReferencesInputAvailable = endpointInputFields.includes("modelReferences");
const plainHasModelReferencesField =
  plainShape.modelReferences !== "__ABSENT__";
const expandedHasModelReferencesField =
  expandedShape.modelReferences !== "__ABSENT__";
const criticalShapeDifferences = shapeDifferences.filter((entry) =>
  [
    "gpuIds",
    "gpuCount",
    "gpuTypeIds",
    "instanceIds",
    "locations",
    "dataCenterIds",
    "networkVolumeId",
    "networkVolumeIds",
    "minCudaVersion",
    "allowedCudaVersions",
    "flashboot",
    "flashBootType",
    "computeType",
  ].includes(entry.field),
);

let classification =
  "RUNPOD_CACHE_CONTROL_PLANE_REQUIRES_FURTHER_REVIEW";
if (!canonical) {
  classification = "LIVE_STATE_NOT_CANONICAL_READ_ONLY_DIAGNOSTIC";
} else if (!introspection.ok) {
  classification = "RUNPOD_GRAPHQL_SCHEMA_INTROSPECTION_UNAVAILABLE";
} else if (!modelReferencesInputAvailable) {
  classification = "RUNPOD_ENDPOINT_INPUT_MODEL_REFERENCES_UNAVAILABLE";
} else if (criticalShapeDifferences.length > 0) {
  classification =
    "RUNPOD_ENDPOINT_READ_SHAPE_DIVERGENCE_USE_PLAIN_EXACT_SOURCE";
} else if (
  endpointGraphqlState.ok &&
  endpointGraphqlState.response?.model_status
) {
  classification = "RUNPOD_MODEL_STATUS_AVAILABLE_FOR_CACHE_DIAGNOSIS";
} else {
  classification =
    "RUNPOD_MODEL_REFERENCE_BACKEND_SILENT_DROP_REQUIRES_CONTROL_PLANE_ESCALATION";
}

console.log(
  JSON.stringify(
    {
      success: true,
      contract: CONTRACT,
      read_only: true,
      main_commit: main.head,
      pinned_main: main.pinned,
      expected_fast_model: FAST_MODEL,
      canonical_deep_active_fast_parked: canonical,
      deep,
      fast,
      fast_endpoint_id: fastId,
      plain_exact_shape: plainShape,
      expanded_exact_shape: expandedShape,
      shape_difference_fields: shapeDifferences.map((entry) => entry.field),
      critical_shape_differences: criticalShapeDifferences,
      graphql_schema: {
        introspection_available: introspection.ok,
        introspection_error: introspection.error,
        endpoint_input_fields: endpointInputFields,
        model_references_input_available: modelReferencesInputAvailable,
        model_status_info_scalar_fields: modelStatusFields,
      },
      graphql_fast_endpoint_state: endpointGraphqlState,
      private_model_repository: {
        query_available: modelRepository.ok,
        query_error: modelRepository.error,
        model_count: modelRepository.ok
          ? list(modelRepository.response).length
          : null,
        expected_public_model_registered: publicModelRegisteredInPrivateRepository,
      },
      model_reference_visibility: {
        plain_rest_field_present: plainHasModelReferencesField,
        plain_rest_references: modelReferences(fastPlain),
        expanded_rest_field_present: expandedHasModelReferencesField,
        expanded_rest_references: modelReferences(fastExpanded),
        graphql_references: endpointGraphqlState.ok
          ? endpointGraphqlState.response?.model_references || []
          : null,
      },
      classification,
      mutation_performed: false,
      generation_submitted: false,
      inference_performed: false,
      gpu_activation_performed: false,
      queue_mutation_performed: false,
      endpoint_mutation_performed: false,
      template_mutation_performed: false,
      network_volume_mutation_performed: false,
      production_deploy_performed: false,
      secrets_in_output: false,
    },
    null,
    2,
  ),
);
console.log(
  `AVANTIQO_INTELLIGENCE_FAST_MODEL_CACHE_CONTROL_PLANE_DIAGNOSTIC=${classification}`,
);
