import { spawn } from "node:child_process";

const RUNPOD_REST_API = "https://rest.runpod.io/v1";
const EXPECTED_FOUNDATION_MODEL = "Qwen/Qwen3-Coder-30B-A3B-Instruct";
const RUNPOD_DEPLOYMENT_DOCKERFILE = "services/avantiqo-code-engine/Dockerfile.runpod";

function text(value) {
  return String(value ?? "").trim();
}

function endpointScore(endpoint = {}) {
  const name = text(endpoint.name).toLowerCase();
  const templateName = text(endpoint.template?.name).toLowerCase();
  const imageName = text(endpoint.template?.imageName).toLowerCase();
  const foundationModel = text(
    endpoint.env?.AVANTIQO_CODE_FOUNDATION_MODEL ||
    endpoint.template?.env?.AVANTIQO_CODE_FOUNDATION_MODEL,
  );

  let score = 0;
  if (["avantiqo-code", "avantiqo code", "avantiqo code ai"].includes(name)) score += 20;
  if (name.includes("avantiqo") && name.includes("code")) score += 10;
  if (templateName.includes("avantiqo") && templateName.includes("code")) score += 8;
  if (imageName.includes("avantiqo-code")) score += 6;
  if (foundationModel === EXPECTED_FOUNDATION_MODEL) score += 5;
  return score;
}

function managementAccessError(status) {
  const suffix = status === 401 || status === 403
    ? "RUNPOD_MANAGEMENT_API_NOT_AUTHORIZED"
    : `RUNPOD_ENDPOINT_DISCOVERY_HTTP_${status}`;
  const error = new Error(suffix);
  error.code = suffix;
  error.status = status;
  return error;
}

function printProvisioningBlocker(error) {
  console.error(JSON.stringify({
    success: false,
    contract: "AVANTIQO_CODE_LOCAL_ENDPOINT_RESOLUTION_V2",
    blocker: error?.code || text(error?.message || error),
    endpoint_configured: false,
    runpod_management_discovery_authorized: false,
    production_runtime_requirement: "RUNPOD_AVANTIQO_CODE_ENDPOINT_ID",
    deployment_source: {
      repository: "churchillkaron/churchill-control-new",
      branch: "main",
      dockerfile: RUNPOD_DEPLOYMENT_DOCKERFILE,
      foundation_model: EXPECTED_FOUNDATION_MODEL,
      gpu_requirement: "80GB_CLASS_FOR_CURRENT_BFLOAT16_WORKER",
    },
    required_next_evidence: "Create or identify the dedicated Avantiqo Code RunPod Serverless endpoint, then set only its endpoint ID as RUNPOD_AVANTIQO_CODE_ENDPOINT_ID in local/Vercel environment configuration.",
    mutation_performed: false,
    provider_call_performed: false,
    secret_values_required_in_chat: false,
  }, null, 2));
}

async function discoverCodeEndpoint(apiKey) {
  const configured = text(process.env.RUNPOD_AVANTIQO_CODE_ENDPOINT_ID);
  if (configured) {
    return {
      id: configured,
      name: null,
      source: "environment",
    };
  }

  const response = await fetch(`${RUNPOD_REST_API}/endpoints?includeTemplate=true`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: "application/json",
    },
  });
  const body = await response.json().catch(() => []);
  if (!response.ok) throw managementAccessError(response.status);

  const endpoints = Array.isArray(body) ? body : Array.isArray(body?.endpoints) ? body.endpoints : [];
  const ranked = endpoints
    .map((endpoint) => ({ endpoint, score: endpointScore(endpoint) }))
    .filter((item) => item.score > 0 && text(item.endpoint?.id))
    .sort((a, b) => b.score - a.score);

  if (!ranked.length) {
    const error = new Error("RUNPOD_AVANTIQO_CODE_ENDPOINT_NOT_FOUND");
    error.code = "RUNPOD_AVANTIQO_CODE_ENDPOINT_NOT_FOUND";
    throw error;
  }
  if (ranked.length > 1 && ranked[0].score === ranked[1].score) {
    const error = new Error(`RUNPOD_AVANTIQO_CODE_ENDPOINT_DISCOVERY_AMBIGUOUS:${ranked.length}`);
    error.code = "RUNPOD_AVANTIQO_CODE_ENDPOINT_DISCOVERY_AMBIGUOUS";
    throw error;
  }

  return {
    id: text(ranked[0].endpoint.id),
    name: text(ranked[0].endpoint.name) || null,
    source: "runpod_read_only_discovery",
  };
}

function runBenchmark(env) {
  return new Promise((resolveRun, rejectRun) => {
    const child = spawn(process.execPath, ["scripts/benchmark-avantiqo-code.mjs"], {
      cwd: process.cwd(),
      env,
      stdio: "inherit",
    });
    child.once("error", rejectRun);
    child.once("exit", (code, signal) => resolveRun({ code, signal }));
  });
}

const apiKey = text(process.env.RUNPOD_API_KEY);
if (!apiKey) throw new Error("RUNPOD_API_KEY_REQUIRED");

let endpoint;
try {
  endpoint = await discoverCodeEndpoint(apiKey);
} catch (error) {
  if ([
    "RUNPOD_MANAGEMENT_API_NOT_AUTHORIZED",
    "RUNPOD_AVANTIQO_CODE_ENDPOINT_NOT_FOUND",
    "RUNPOD_AVANTIQO_CODE_ENDPOINT_DISCOVERY_AMBIGUOUS",
  ].includes(error?.code)) {
    printProvisioningBlocker(error);
    process.exitCode = 2;
  } else {
    throw error;
  }
}

if (endpoint) {
  console.log(JSON.stringify({
    success: true,
    contract: "AVANTIQO_CODE_LOCAL_ENDPOINT_RESOLUTION_V2",
    endpoint_resolution: {
      source: endpoint.source,
      endpoint_id: endpoint.id,
      endpoint_name: endpoint.name,
    },
    mutation_performed: false,
    provider_call_performed: false,
  }, null, 2));

  const result = await runBenchmark({
    ...process.env,
    RUNPOD_AVANTIQO_CODE_ENDPOINT_ID: endpoint.id,
  });

  if (result.signal) {
    throw new Error(`AVANTIQO_CODE_BENCHMARK_SIGNAL:${result.signal}`);
  }
  process.exitCode = Number.isInteger(result.code) ? result.code : 1;
}
