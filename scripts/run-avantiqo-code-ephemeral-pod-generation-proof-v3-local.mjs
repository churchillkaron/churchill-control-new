import { spawnSync } from "node:child_process";
import { writeFileSync, unlinkSync } from "node:fs";
import { pathToFileURL } from "node:url";

const WRAPPER_CONTRACT = "AVANTIQO_CODE_EPHEMERAL_POD_GENERATION_PROOF_V3_LAUNCHER";
const CORE_V1_PATH = "scripts/run-avantiqo-code-ephemeral-pod-generation-proof-v1-local.mjs";
const OLD_CONTRACT = "AVANTIQO_CODE_EPHEMERAL_POD_GENERATION_PROOF_V1";
const NEW_CONTRACT = "AVANTIQO_CODE_EPHEMERAL_POD_GENERATION_PROOF_V3";
const OLD_APPROVAL = "AVANTIQO_CODE_EPHEMERAL_POD_GENERATION_PROOF_APPROVED";
const NEW_APPROVAL = "AVANTIQO_CODE_EPHEMERAL_POD_GENERATION_PROOF_V3_APPROVED";
const OLD_SOURCE_SHA = "875627667bc055c78ed79d3b837c1e9566503ad9";
const IMAGE_SOURCE_SHA = "0ae554d2cee35b16a9e94af5d957d85b07995945";
const IMAGE_TAG = `sha-${IMAGE_SOURCE_SHA.slice(0, 12)}`;
const OLD_DIGEST = "sha256:22d34b892d2718c8381557bc45e092063d66a47b8278dccd31b29eb360c2f4dc";
const LEGACY_POD_HTTP_CONTRACT = "AVANTIQO_CODE_POD_HTTP_V1";
const POD_HTTP_CONTRACT = "AVANTIQO_CODE_POD_HTTP_V3";
const IMAGE_REPOSITORY_PATH = "churchillkaron/avantiqo-code-pod";
const EXPECTED_TRANSPORT_PROBE_PATH = "/v3/transport-probe";
const EXPECTED_ASYNC_SUBMIT_PATH = "/v3/generations";
const EXPECTED_ASYNC_STATUS_TEMPLATE = "/v3/generations/{job_id}";
const ASYNC_TIMEOUT_MS = 15 * 60_000;
const POLL_MS = 5_000;

const text = (value) => String(value ?? "").trim();
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function git(args, code) {
  const result = spawnSync("git", args, {
    cwd: process.cwd(),
    encoding: "utf8",
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.status !== 0) {
    throw new Error(`${code}:${text(result.stderr || result.stdout).slice(0, 1200) || `exit=${result.status}`}`);
  }
  return String(result.stdout || "");
}

function parseJson(raw) {
  try {
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function jsonResponse(body, status = 200, headers = undefined) {
  const responseHeaders = new Headers(headers || {});
  if (!responseHeaders.has("content-type")) responseHeaders.set("content-type", "application/json");
  return new Response(JSON.stringify(body), { status, headers: responseHeaders });
}

async function resolveImmutableDigest() {
  const tokenUrl = new URL("https://ghcr.io/token");
  tokenUrl.searchParams.set("service", "ghcr.io");
  tokenUrl.searchParams.set("scope", `repository:${IMAGE_REPOSITORY_PATH}:pull`);
  const tokenResponse = await fetch(tokenUrl, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(30_000),
  });
  const tokenRaw = await tokenResponse.text();
  const tokenBody = parseJson(tokenRaw);
  if (!tokenResponse.ok) {
    throw new Error(`${WRAPPER_CONTRACT}_GHCR_TOKEN_HTTP_${tokenResponse.status}:${text(tokenBody?.message || tokenRaw).slice(0, 500)}`);
  }
  const token = text(tokenBody?.token || tokenBody?.access_token);
  if (!token) throw new Error(`${WRAPPER_CONTRACT}_GHCR_TOKEN_MISSING`);

  const manifestResponse = await fetch(
    `https://ghcr.io/v2/${IMAGE_REPOSITORY_PATH}/manifests/${encodeURIComponent(IMAGE_TAG)}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.oci.image.index.v1+json, application/vnd.oci.image.manifest.v1+json, application/vnd.docker.distribution.manifest.list.v2+json, application/vnd.docker.distribution.manifest.v2+json",
      },
      signal: AbortSignal.timeout(30_000),
    },
  );
  const manifestRaw = await manifestResponse.text();
  if (manifestResponse.status === 404) {
    throw new Error(`${WRAPPER_CONTRACT}_IMMUTABLE_IMAGE_NOT_READY:${IMAGE_TAG}`);
  }
  if (!manifestResponse.ok) {
    throw new Error(`${WRAPPER_CONTRACT}_GHCR_MANIFEST_HTTP_${manifestResponse.status}:${manifestRaw.slice(0, 500)}`);
  }
  const digest = text(manifestResponse.headers.get("docker-content-digest")).toLowerCase();
  if (!/^sha256:[a-f0-9]{64}$/.test(digest)) {
    throw new Error(`${WRAPPER_CONTRACT}_GHCR_IMMUTABLE_DIGEST_INVALID:${digest}`);
  }
  return digest;
}

function requiredSourceTransform(source, imageDigest) {
  const required = [
    OLD_CONTRACT,
    OLD_APPROVAL,
    OLD_SOURCE_SHA,
    OLD_DIGEST,
    LEGACY_POD_HTTP_CONTRACT,
    "async function runOneGeneration(podId, token)",
  ];
  for (const marker of required) {
    if (!source.includes(marker)) {
      throw new Error(`${WRAPPER_CONTRACT}_CORE_V1_MARKER_MISSING:${marker}`);
    }
  }
  const transformed = source
    .replaceAll(OLD_CONTRACT, NEW_CONTRACT)
    .replaceAll(OLD_APPROVAL, NEW_APPROVAL)
    .replaceAll(OLD_SOURCE_SHA, IMAGE_SOURCE_SHA)
    .replaceAll(OLD_DIGEST, imageDigest)
    .replaceAll(LEGACY_POD_HTTP_CONTRACT, POD_HTTP_CONTRACT);

  for (const marker of [OLD_CONTRACT, OLD_APPROVAL, OLD_SOURCE_SHA, OLD_DIGEST, LEGACY_POD_HTTP_CONTRACT]) {
    if (transformed.includes(marker)) {
      throw new Error(`${WRAPPER_CONTRACT}_TRANSFORM_INCOMPLETE:${marker}`);
    }
  }
  if (
    !transformed.includes(NEW_CONTRACT) ||
    !transformed.includes(IMAGE_SOURCE_SHA) ||
    !transformed.includes(imageDigest) ||
    !transformed.includes(POD_HTTP_CONTRACT)
  ) {
    throw new Error(`${WRAPPER_CONTRACT}_TRANSFORM_TARGETS_MISSING`);
  }
  return transformed;
}

const nativeFetch = globalThis.fetch.bind(globalThis);
let transportProbeCount = 0;
let asyncSubmitCount = 0;
let asyncPollCount = 0;
let asyncSucceeded = false;

async function readJson(response) {
  const raw = await response.text();
  return { raw, body: parseJson(raw) };
}

async function proxyTimeoutSafeFetch(input, init = undefined) {
  const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : text(input?.url);
  const method = text(init?.method || (typeof input === "object" ? input?.method : "GET") || "GET").toUpperCase();
  const isCodePodRun = method === "POST" && /https:\/\/[^/]+-8000\.proxy\.runpod\.net\/run$/.test(url);
  if (!isCodePodRun) return nativeFetch(input, init);

  asyncSubmitCount += 1;
  if (asyncSubmitCount !== 1) {
    throw new Error(`${WRAPPER_CONTRACT}_MULTIPLE_GENERATION_SUBMITS_BLOCKED:${asyncSubmitCount}`);
  }

  const baseUrl = url.slice(0, -"/run".length);
  const submittedAt = Date.now();

  const healthResponse = await nativeFetch(`${baseUrl}/health`, {
    method: "GET",
    headers: { Accept: "application/json" },
    signal: init?.signal,
  });
  const healthResult = await readJson(healthResponse);
  const health = healthResult.body;
  if (
    !healthResponse.ok ||
    health?.success !== true ||
    health?.contract !== POD_HTTP_CONTRACT ||
    health?.transport !== "pod-http" ||
    health?.transport_mode !== "async-job-polling" ||
    text(health?.transport_probe_path) !== EXPECTED_TRANSPORT_PROBE_PATH ||
    text(health?.async_submit_path) !== EXPECTED_ASYNC_SUBMIT_PATH ||
    text(health?.async_status_path_template) !== EXPECTED_ASYNC_STATUS_TEMPLATE ||
    health?.synchronous_generation_allowed !== false
  ) {
    return jsonResponse(
      {
        success: false,
        contract: POD_HTTP_CONTRACT,
        transport: "pod-http",
        error_type: "TransportAdvertisementInvalid",
        error_message: `${WRAPPER_CONTRACT}_TRANSPORT_ADVERTISEMENT_INVALID`,
        raw_reasoning_persisted: false,
      },
      502,
    );
  }

  transportProbeCount += 1;
  if (transportProbeCount !== 1) {
    throw new Error(`${WRAPPER_CONTRACT}_TRANSPORT_PROBE_COUNT_INVALID:${transportProbeCount}`);
  }
  const probeResponse = await nativeFetch(`${baseUrl}${health.transport_probe_path}`, {
    method: "POST",
    headers: init?.headers,
    body: "",
    signal: init?.signal,
  });
  const probeResult = await readJson(probeResponse);
  const probe = probeResult.body;
  if (
    !probeResponse.ok ||
    probe?.success !== true ||
    probe?.contract !== POD_HTTP_CONTRACT ||
    probe?.transport !== "pod-http" ||
    probe?.transport_mode !== "async-job-polling" ||
    probe?.proxy_timeout_safe !== true ||
    probe?.inference_performed !== false ||
    probe?.raw_reasoning_persisted !== false
  ) {
    return jsonResponse(
      {
        success: false,
        contract: POD_HTTP_CONTRACT,
        transport: "pod-http",
        error_type: "ExternalTransportProbeFailed",
        error_message: `${WRAPPER_CONTRACT}_EXTERNAL_TRANSPORT_PROBE_FAILED_HTTP_${probeResponse.status}`,
        raw_reasoning_persisted: false,
      },
      502,
    );
  }

  console.log(JSON.stringify({
    event: "AVANTIQO_CODE_EPHEMERAL_POD_GENERATION_PROGRESS",
    phase: "EXTERNAL_V3_TRANSPORT_PROBE_PASS",
    inference_performed: false,
    secrets_printed: false,
  }));

  const submitResponse = await nativeFetch(`${baseUrl}${health.async_submit_path}`, {
    ...(init || {}),
    method: "POST",
  });
  const submitResult = await readJson(submitResponse);
  const submitBody = submitResult.body;
  if (!submitResponse.ok) {
    return new Response(submitResult.raw, {
      status: submitResponse.status,
      headers: submitResponse.headers,
    });
  }
  const jobId = text(submitBody?.job_id);
  const expectedPollPath = EXPECTED_ASYNC_STATUS_TEMPLATE.replace("{job_id}", jobId);
  if (
    submitResponse.status !== 202 ||
    submitBody?.success !== true ||
    submitBody?.contract !== POD_HTTP_CONTRACT ||
    submitBody?.transport !== "pod-http" ||
    submitBody?.transport_mode !== "async-job-polling" ||
    submitBody?.proxy_timeout_safe !== true ||
    text(submitBody?.poll_path) !== expectedPollPath ||
    !jobId
  ) {
    return jsonResponse(
      {
        success: false,
        contract: POD_HTTP_CONTRACT,
        transport: "pod-http",
        error_type: "AsyncSubmissionContractInvalid",
        error_message: `${WRAPPER_CONTRACT}_ASYNC_SUBMISSION_CONTRACT_INVALID`,
        raw_reasoning_persisted: false,
      },
      502,
    );
  }

  console.log(JSON.stringify({
    event: "AVANTIQO_CODE_EPHEMERAL_POD_GENERATION_PROGRESS",
    phase: "ASYNC_JOB_SUBMITTED",
    pod_http_contract: POD_HTTP_CONTRACT,
    job_id_present: true,
    proxy_timeout_safe: true,
    secrets_printed: false,
  }));

  const deadline = submittedAt + ASYNC_TIMEOUT_MS;
  let lastStatus = "QUEUED";
  let lastProgressAt = 0;
  while (Date.now() < deadline) {
    await sleep(POLL_MS);
    asyncPollCount += 1;
    const pollPath = EXPECTED_ASYNC_STATUS_TEMPLATE.replace("{job_id}", encodeURIComponent(jobId));
    let pollResponse;
    try {
      pollResponse = await nativeFetch(`${baseUrl}${pollPath}`, {
        method: "GET",
        headers: init?.headers,
        signal: init?.signal,
      });
    } catch (error) {
      return jsonResponse(
        {
          success: false,
          contract: POD_HTTP_CONTRACT,
          transport: "pod-http",
          error_type: text(error?.name) || "Error",
          error_message: `${WRAPPER_CONTRACT}_ASYNC_POLL_TRANSPORT_FAILED:${text(error?.message).slice(0, 600)}`,
          raw_reasoning_persisted: false,
        },
        502,
      );
    }
    const pollResult = await readJson(pollResponse);
    const pollBody = pollResult.body;
    if (!pollResponse.ok) {
      return new Response(pollResult.raw, { status: pollResponse.status, headers: pollResponse.headers });
    }
    if (
      pollBody?.success !== true ||
      pollBody?.contract !== POD_HTTP_CONTRACT ||
      pollBody?.transport !== "pod-http" ||
      text(pollBody?.job_id) !== jobId
    ) {
      return jsonResponse(
        {
          success: false,
          contract: POD_HTTP_CONTRACT,
          transport: "pod-http",
          error_type: "AsyncPollContractInvalid",
          error_message: `${WRAPPER_CONTRACT}_ASYNC_POLL_CONTRACT_INVALID`,
          raw_reasoning_persisted: false,
        },
        502,
      );
    }

    const status = text(pollBody?.status).toUpperCase();
    const now = Date.now();
    if (status !== lastStatus || now - lastProgressAt >= 30_000) {
      console.log(JSON.stringify({
        event: "AVANTIQO_CODE_EPHEMERAL_POD_GENERATION_PROGRESS",
        phase: "ASYNC_JOB_POLL",
        status: status || null,
        elapsed_seconds: Math.round((now - submittedAt) / 1000),
        poll_count: asyncPollCount,
        secrets_printed: false,
      }));
      lastStatus = status;
      lastProgressAt = now;
    }

    if (status === "SUCCEEDED") {
      if (!pollBody?.output || typeof pollBody.output !== "object") {
        return jsonResponse(
          {
            success: false,
            contract: POD_HTTP_CONTRACT,
            transport: "pod-http",
            error_type: "AsyncOutputMissing",
            error_message: `${WRAPPER_CONTRACT}_ASYNC_OUTPUT_REQUIRED`,
            raw_reasoning_persisted: false,
          },
          502,
        );
      }
      asyncSucceeded = true;
      return jsonResponse({
        success: true,
        contract: POD_HTTP_CONTRACT,
        transport: "pod-http",
        output: pollBody.output,
      });
    }

    if (status === "FAILED") {
      return jsonResponse(
        {
          success: false,
          contract: POD_HTTP_CONTRACT,
          transport: "pod-http",
          error_type: text(pollBody?.error_type) || "AsyncJobFailed",
          error_message: text(pollBody?.error_message) || `${WRAPPER_CONTRACT}_ASYNC_JOB_FAILED`,
          raw_reasoning_persisted: false,
        },
        500,
      );
    }
    if (!new Set(["QUEUED", "RUNNING"]).has(status)) {
      return jsonResponse(
        {
          success: false,
          contract: POD_HTTP_CONTRACT,
          transport: "pod-http",
          error_type: "AsyncJobStatusInvalid",
          error_message: `${WRAPPER_CONTRACT}_ASYNC_JOB_STATUS_INVALID:${status}`,
          raw_reasoning_persisted: false,
        },
        502,
      );
    }
  }

  return jsonResponse(
    {
      success: false,
      contract: POD_HTTP_CONTRACT,
      transport: "pod-http",
      error_type: "AsyncJobTimeout",
      error_message: `${WRAPPER_CONTRACT}_ASYNC_JOB_TIMEOUT:${lastStatus}`,
      raw_reasoning_persisted: false,
    },
    504,
  );
}

console.log(`${WRAPPER_CONTRACT}_MODE=APPLY_ONLY`);
console.log(`${WRAPPER_CONTRACT}_IMMUTABLE_SOURCE_SHA=${IMAGE_SOURCE_SHA}`);
console.log(`${WRAPPER_CONTRACT}_IMAGE_TAG=${IMAGE_TAG}`);
console.log(`${WRAPPER_CONTRACT}_POD_HTTP_CONTRACT=${POD_HTTP_CONTRACT}`);
console.log(`${WRAPPER_CONTRACT}_TRANSPORT_PROBE_MAX=1`);
console.log(`${WRAPPER_CONTRACT}_ASYNC_SUBMIT_MAX=1`);
console.log(`${WRAPPER_CONTRACT}_SYNCHRONOUS_GENERATION_NETWORK_CALL=false`);
console.log(`${WRAPPER_CONTRACT}_SECRETS_PRINTED=false`);

if (text(process.env[NEW_APPROVAL]).toUpperCase() !== "YES") {
  throw new Error(`${WRAPPER_CONTRACT}_APPROVAL_REQUIRED:set_${NEW_APPROVAL}=YES`);
}

git(["fetch", "origin", "main"], `${WRAPPER_CONTRACT}_GIT_FETCH_FAILED`);
const imageDigest = await resolveImmutableDigest();
console.log(`${WRAPPER_CONTRACT}_IMMUTABLE_DIGEST=${imageDigest}`);
const source = git(["show", `origin/main:${CORE_V1_PATH}`], `${WRAPPER_CONTRACT}_CORE_V1_READ_FAILED`);
const transformed = requiredSourceTransform(source, imageDigest);
const tempPath = `/tmp/run-avantiqo-code-ephemeral-pod-generation-proof-v3-core-${process.pid}.mjs`;
writeFileSync(tempPath, transformed, "utf8");

globalThis.fetch = proxyTimeoutSafeFetch;
try {
  await import(`${pathToFileURL(tempPath).href}?v=${Date.now()}`);
  if (transportProbeCount !== 1) throw new Error(`${WRAPPER_CONTRACT}_TRANSPORT_PROBE_REQUIRED`);
  if (asyncSubmitCount !== 1) throw new Error(`${WRAPPER_CONTRACT}_ASYNC_SUBMIT_COUNT_INVALID:${asyncSubmitCount}`);
  if (asyncPollCount < 1) throw new Error(`${WRAPPER_CONTRACT}_ASYNC_POLL_REQUIRED`);
  if (!asyncSucceeded) throw new Error(`${WRAPPER_CONTRACT}_ASYNC_SUCCESS_NOT_OBSERVED`);
  console.log(`${WRAPPER_CONTRACT}_EXTERNAL_TRANSPORT=PASS`);
  console.log(`${WRAPPER_CONTRACT}_ASYNC_TRANSPORT=PASS`);
} finally {
  globalThis.fetch = nativeFetch;
  try { unlinkSync(tempPath); } catch {}
}
