const CONTRACT = "AVANTIQO_CODE_GOVERNED_POD_FETCH_SHIM_V1";
const CODE_ENDPOINT_ID = "r79dtnjnrilrlc";
const RUNPOD_ENDPOINTS_ORIGIN = "https://rest.runpod.io";
const RUNPOD_ENDPOINTS_PATH = "/v1/endpoints";

function text(value) {
  return String(value ?? "").trim();
}

function requestUrl(input) {
  try {
    return new URL(typeof input === "string" || input instanceof URL ? input : input?.url);
  } catch {
    return null;
  }
}

function methodOf(input, init = {}) {
  return text(init?.method || input?.method || "GET").toUpperCase() || "GET";
}

function governedPodActive() {
  const baseUrl = text(process.env.AVANTIQO_CODE_POD_BASE_URL);
  const token = text(process.env.AVANTIQO_CODE_POD_TOKEN);
  return Boolean(baseUrl && token.length >= 32);
}

const originalFetch = globalThis.fetch;
if (typeof originalFetch !== "function") {
  throw new Error(`${CONTRACT}_FETCH_REQUIRED`);
}

globalThis.fetch = async function governedCodePodFetch(input, init = {}) {
  const response = await originalFetch(input, init);
  if (!governedPodActive()) return response;

  const url = requestUrl(input);
  if (
    !url ||
    url.origin !== RUNPOD_ENDPOINTS_ORIGIN ||
    url.pathname !== RUNPOD_ENDPOINTS_PATH ||
    methodOf(input, init) !== "GET" ||
    !response.ok
  ) {
    return response;
  }

  const raw = await response.text();
  let body;
  try {
    body = raw ? JSON.parse(raw) : null;
  } catch {
    return new Response(raw, {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
    });
  }

  const endpoints = Array.isArray(body) ? body : Array.isArray(body?.endpoints) ? body.endpoints : null;
  if (!endpoints) {
    return new Response(raw, {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
    });
  }

  const patched = endpoints.map((endpoint) => {
    if (text(endpoint?.id) !== CODE_ENDPOINT_ID) return endpoint;
    return {
      ...endpoint,
      workersMin: Number(endpoint?.workersMin ?? 0),
      workersMax: Math.max(1, Number(endpoint?.workersMax ?? 0)),
      avantiqoCodeGovernedPodTransportActive: true,
      avantiqoCodeServerlessMutationPerformed: false,
    };
  });
  const output = Array.isArray(body) ? patched : { ...body, endpoints: patched };

  console.error(JSON.stringify({
    event: "AVANTIQO_CODE_GOVERNED_POD_PREFLIGHT_SHIM",
    contract: CONTRACT,
    endpoint_id: CODE_ENDPOINT_ID,
    governed_pod_transport_active: true,
    serverless_mutation_performed: false,
    provider_execution_submitted: false,
    production_deploy_performed: false,
    secrets_printed: false,
  }));

  const headers = new Headers(response.headers);
  headers.set("content-type", "application/json");
  return new Response(JSON.stringify(output), {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
};
