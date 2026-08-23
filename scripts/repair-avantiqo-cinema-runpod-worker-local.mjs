import { writeFile } from "node:fs/promises";

const GRAPHQL_BASE = "https://api.runpod.io/graphql";
const QUEUE_BASE = "https://api.runpod.ai/v2";
const apiKey = required("RUNPOD_API_KEY");
const endpointId = required("RUNPOD_AVANTIQO_VIDEO_ENDPOINT_ID");
const providerJobId = String(
  process.env.INVESTOR_SCENE9_PROVIDER_JOB_ID ||
    "7149b284-b209-417f-acb6-71b4112e116c-e1",
).trim();
const repairEnabled = /^(1|true|yes|on)$/i.test(
  String(process.env.AVANTIQO_CINEMA_RUNPOD_REPAIR || ""),
);
const maxWaitMs = Math.max(
  30_000,
  Number(process.env.AVANTIQO_CINEMA_RUNPOD_REPAIR_WAIT_MS || 10 * 60 * 1000),
);
const backupPath =
  process.env.AVANTIQO_CINEMA_RUNPOD_REPAIR_BACKUP ||
  "/tmp/avantiqo-cinema-runpod-repair-backup.json";

const TARGET_OVERRIDES = Object.freeze({
  AVANTIQO_VIDEO_CERTIFIED_CAPABILITIES: "ai.video.generate",
  AVANTIQO_VIDEO_CERTIFICATION_EXECUTION_ENABLED: "0",
  AVANTIQO_VIDEO_I2V_MODEL: "",
});

function required(name) {
  const value = String(process.env[name] || "").trim();
  if (!value) throw new Error(`${name}_REQUIRED`);
  return value;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeEnv(value) {
  if (!value) return {};
  if (Array.isArray(value)) {
    return Object.fromEntries(
      value
        .filter((entry) => entry && typeof entry === "object" && entry.key)
        .map((entry) => [String(entry.key), String(entry.value ?? "")]),
    );
  }
  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, child]) => [String(key), String(child ?? "")]),
    );
  }
  return {};
}

function environmentList(value) {
  return Object.entries(normalizeEnv(value)).map(([key, child]) => ({
    key,
    value: child,
  }));
}

function sanitizedPod(pod = {}) {
  return {
    id: pod.id || null,
    desired_status: pod.desiredStatus || null,
  };
}

function sanitizeEndpoint(endpoint = {}) {
  const endpointEnv = normalizeEnv(endpoint.env);
  const templateEnv = normalizeEnv(endpoint.template?.env);
  return {
    id: endpoint.id || null,
    name: endpoint.name || null,
    version: endpoint.version ?? null,
    template_id: endpoint.templateId || endpoint.template?.id || null,
    template_bound_endpoint_id: endpoint.template?.boundEndpointId || null,
    template_name: endpoint.template?.name || null,
    template_image: endpoint.template?.imageName || null,
    workers_min: endpoint.workersMin ?? null,
    workers_max: endpoint.workersMax ?? null,
    scaler_type: endpoint.scalerType || null,
    scaler_value: endpoint.scalerValue ?? null,
    gpu_ids: endpoint.gpuIds || null,
    network_volume_id: endpoint.networkVolumeId || null,
    endpoint_env_keys: Object.keys(endpointEnv).sort(),
    template_env_keys: Object.keys(templateEnv).sort(),
    workers: Array.isArray(endpoint.pods) ? endpoint.pods.map(sanitizedPod) : [],
  };
}

async function parseResponse(response) {
  const raw = await response.text();
  let body = null;
  try {
    body = raw ? JSON.parse(raw) : null;
  } catch {
    body = null;
  }
  if (!response.ok) {
    throw new Error(`RUNPOD_HTTP_${response.status}:UNKNOWN_RUNPOD_ERROR`);
  }
  return body;
}

async function queueStatus() {
  if (!providerJobId) return null;
  const response = await fetch(
    `${QUEUE_BASE}/${encodeURIComponent(endpointId)}/status/${encodeURIComponent(providerJobId)}`,
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(30_000),
    },
  );
  return parseResponse(response);
}

function queueSummary(body = {}) {
  return {
    job_id: providerJobId || null,
    status: body?.status || null,
    delay_ms: Number.isFinite(Number(body?.delayTime)) ? Number(body.delayTime) : null,
    execution_ms: Number.isFinite(Number(body?.executionTime))
      ? Number(body.executionTime)
      : null,
    worker_id: body?.workerId || null,
    has_error: Boolean(body?.error || body?.output?.error),
  };
}

async function graphql(query, variables = {}) {
  const call = async (url, authorization = false) => {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        ...(authorization ? { Authorization: `Bearer ${apiKey}` } : {}),
      },
      body: JSON.stringify({ query, variables }),
      signal: AbortSignal.timeout(30_000),
    });
    const raw = await response.text();
    let body = null;
    try {
      body = raw ? JSON.parse(raw) : null;
    } catch {
      body = null;
    }
    return { response, body };
  };

  let result = await call(
    `${GRAPHQL_BASE}?api_key=${encodeURIComponent(apiKey)}`,
    false,
  );
  if (result.response.status === 401 || result.response.status === 403) {
    result = await call(GRAPHQL_BASE, true);
  }
  if (!result.response.ok) {
    throw new Error(`RUNPOD_GRAPHQL_HTTP_${result.response.status}`);
  }
  if (Array.isArray(result.body?.errors) && result.body.errors.length) {
    const safe = result.body.errors
      .map((entry) => String(entry?.message || "GRAPHQL_ERROR").slice(0, 500))
      .join(" | ");
    throw new Error(`RUNPOD_GRAPHQL_ERROR:${safe}`);
  }
  if (!result.body?.data) throw new Error("RUNPOD_GRAPHQL_DATA_REQUIRED");
  return result.body.data;
}

const ENDPOINT_QUERY = `
  query CinemaEndpoint($id: String!) {
    myself {
      endpoint(id: $id) {
        id
        name
        gpuIds
        idleTimeout
        locations
        networkVolumeId
        scalerType
        scalerValue
        templateId
        workersMax
        workersMin
        version
        env { key value }
        pods { id desiredStatus }
        template {
          id
          name
          imageName
          containerDiskInGb
          volumeInGb
          volumeMountPath
          dockerArgs
          ports
          readme
          isPublic
          isServerless
          boundEndpointId
          containerRegistryAuthId
          env { key value }
        }
      }
      endpoints { id templateId }
    }
  }
`;

async function endpointBundle() {
  const data = await graphql(ENDPOINT_QUERY, { id: endpointId });
  const endpoint = data?.myself?.endpoint;
  if (!endpoint) throw new Error(`RUNPOD_VIDEO_ENDPOINT_NOT_FOUND:${endpointId}`);
  return {
    endpoint,
    endpoints: Array.isArray(data?.myself?.endpoints) ? data.myself.endpoints : [],
  };
}

function graphqlString(value) {
  return JSON.stringify(String(value ?? ""));
}

function graphqlEnv(env) {
  return `[${environmentList(env)
    .map(
      ({ key, value }) =>
        `{ key: ${graphqlString(key)}, value: ${graphqlString(value)} }`,
    )
    .join(", ")}]`;
}

function optionalStringField(name, value) {
  if (value === undefined || value === null) return "";
  return `${name}: ${graphqlString(value)}`;
}

function optionalBooleanField(name, value) {
  if (typeof value !== "boolean") return "";
  return `${name}: ${value ? "true" : "false"}`;
}

function optionalNumberField(name, value) {
  if (!Number.isFinite(Number(value))) return "";
  return `${name}: ${Number(value)}`;
}

async function updateTemplate(template, env) {
  if (!template?.id) throw new Error("RUNPOD_VIDEO_TEMPLATE_ID_REQUIRED");
  const fields = [
    `id: ${graphqlString(template.id)}`,
    optionalNumberField("containerDiskInGb", template.containerDiskInGb),
    optionalStringField("imageName", template.imageName),
    optionalStringField("name", template.name),
    optionalNumberField("volumeInGb", template.volumeInGb),
    optionalStringField("volumeMountPath", template.volumeMountPath),
    optionalStringField("dockerArgs", template.dockerArgs),
    optionalStringField("ports", template.ports),
    optionalStringField("readme", template.readme),
    optionalBooleanField("isPublic", template.isPublic),
    optionalBooleanField("isServerless", template.isServerless),
    optionalStringField("containerRegistryAuthId", template.containerRegistryAuthId),
    `env: ${graphqlEnv(env)}`,
  ].filter(Boolean);

  const mutation = `
    mutation {
      saveTemplate(input: { ${fields.join(", ")} }) {
        id
        name
        imageName
        isServerless
        boundEndpointId
        env { key value }
      }
    }
  `;
  const data = await graphql(mutation);
  if (!data?.saveTemplate?.id) throw new Error("RUNPOD_TEMPLATE_UPDATE_RESULT_REQUIRED");
  return data.saveTemplate;
}

const beforeBundle = await endpointBundle();
const beforeEndpoint = beforeBundle.endpoint;
console.log("AVANTIQO_CINEMA_RUNPOD_CONTROL_PLANE=GRAPHQL");
console.log("AVANTIQO_CINEMA_RUNPOD_ENDPOINT_BEFORE");
console.log(JSON.stringify(sanitizeEndpoint(beforeEndpoint), null, 2));

const beforeQueue = await queueStatus();
console.log("AVANTIQO_CINEMA_SCENE9_QUEUE_BEFORE");
console.log(JSON.stringify(queueSummary(beforeQueue), null, 2));

const currentTemplate = beforeEndpoint.template;
const templateId = beforeEndpoint.templateId || currentTemplate?.id;
if (!templateId || !currentTemplate?.id) {
  throw new Error("RUNPOD_VIDEO_TEMPLATE_ID_REQUIRED");
}
if (String(currentTemplate.id) !== String(templateId)) {
  throw new Error("RUNPOD_VIDEO_TEMPLATE_BINDING_MISMATCH");
}

const templateConsumers = beforeBundle.endpoints.filter(
  (entry) => String(entry?.templateId || "") === String(templateId),
);
const boundEndpointId = String(currentTemplate.boundEndpointId || "").trim();
if (boundEndpointId && boundEndpointId !== endpointId) {
  throw new Error(
    `RUNPOD_TEMPLATE_BOUND_TO_DIFFERENT_ENDPOINT:${boundEndpointId}`,
  );
}
if (!boundEndpointId && templateConsumers.length !== 1) {
  throw new Error(
    `RUNPOD_SHARED_TEMPLATE_REPAIR_BLOCKED:${templateConsumers.length}`,
  );
}

const templateEnv = normalizeEnv(currentTemplate.env);
const endpointEnv = normalizeEnv(beforeEndpoint.env);
const conflictingEndpointOverrides = Object.keys(TARGET_OVERRIDES).filter(
  (key) => Object.prototype.hasOwnProperty.call(endpointEnv, key),
);
if (conflictingEndpointOverrides.length) {
  throw new Error(
    `RUNPOD_ENDPOINT_ENV_OVERRIDE_BLOCKS_SAFE_TEMPLATE_REPAIR:${conflictingEndpointOverrides.join(",")}`,
  );
}

const backup = {
  contract: "AVANTIQO_CINEMA_RUNPOD_REPAIR_BACKUP_V2_GRAPHQL",
  endpoint_id: endpointId,
  template_id: templateId,
  template_bound_endpoint_id: boundEndpointId || null,
  created_at: new Date().toISOString(),
  modified_keys: Object.fromEntries(
    Object.keys(TARGET_OVERRIDES).map((key) => [
      key,
      {
        present: Object.prototype.hasOwnProperty.call(templateEnv, key),
        value: Object.prototype.hasOwnProperty.call(templateEnv, key)
          ? templateEnv[key]
          : null,
      },
    ]),
  ),
};
await writeFile(backupPath, `${JSON.stringify(backup, null, 2)}\n`, {
  encoding: "utf8",
  mode: 0o600,
});
console.log(`AVANTIQO_CINEMA_RUNPOD_BACKUP=${backupPath}`);

if (!repairEnabled) {
  console.log("AVANTIQO_CINEMA_RUNPOD_REPAIR=DRY_RUN");
  console.log(
    "Set AVANTIQO_CINEMA_RUNPOD_REPAIR=1 to apply the guarded T2V-only rolling repair.",
  );
  process.exit(0);
}

const repairedEnv = {
  ...templateEnv,
  ...TARGET_OVERRIDES,
};
await updateTemplate(currentTemplate, repairedEnv);
console.log("AVANTIQO_CINEMA_RUNPOD_TEMPLATE_UPDATE=APPLIED");
console.log("AVANTIQO_CINEMA_RUNPOD_MODE=T2V_ONLY_FAIL_CLOSED");

const started = Date.now();
let lastEndpointVersion = beforeEndpoint.version ?? null;
let lastQueueStatus = String(beforeQueue?.status || "");
while (Date.now() - started < maxWaitMs) {
  await sleep(5000);
  const currentBundle = await endpointBundle();
  const currentEndpoint = currentBundle.endpoint;
  const currentQueue = await queueStatus();
  const currentVersion = currentEndpoint.version ?? null;
  const currentStatus = String(currentQueue?.status || "");
  if (currentVersion !== lastEndpointVersion || currentStatus !== lastQueueStatus) {
    console.log("AVANTIQO_CINEMA_RUNPOD_PROGRESS");
    console.log(
      JSON.stringify(
        {
          endpoint: sanitizeEndpoint(currentEndpoint),
          scene9_queue: queueSummary(currentQueue),
        },
        null,
        2,
      ),
    );
    lastEndpointVersion = currentVersion;
    lastQueueStatus = currentStatus;
  }

  if (["IN_PROGRESS", "COMPLETED"].includes(currentStatus)) {
    console.log(`AVANTIQO_CINEMA_RUNPOD_REPAIR_RESULT=${currentStatus}`);
    process.exit(0);
  }
  if (["FAILED", "TIMED_OUT", "CANCELLED", "CANCELED"].includes(currentStatus)) {
    console.log(`AVANTIQO_CINEMA_RUNPOD_REPAIR_RESULT=${currentStatus}`);
    process.exitCode = 2;
    process.exit();
  }
}

const finalBundle = await endpointBundle();
const finalQueue = await queueStatus();
console.log("AVANTIQO_CINEMA_RUNPOD_REPAIR_RESULT=WAIT_TIMEOUT");
console.log(
  JSON.stringify(
    {
      endpoint: sanitizeEndpoint(finalBundle.endpoint),
      scene9_queue: queueSummary(finalQueue),
    },
    null,
    2,
  ),
);
process.exitCode = 3;
