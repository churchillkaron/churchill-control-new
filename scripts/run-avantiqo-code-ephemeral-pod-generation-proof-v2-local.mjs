import { spawnSync } from "node:child_process";
import { writeFileSync, unlinkSync } from "node:fs";
import { pathToFileURL } from "node:url";

const WRAPPER_CONTRACT = "AVANTIQO_CODE_EPHEMERAL_POD_GENERATION_PROOF_V2_LAUNCHER";
const CORE_V1_PATH = "scripts/run-avantiqo-code-ephemeral-pod-generation-proof-v1-local.mjs";
const OLD_CONTRACT = "AVANTIQO_CODE_EPHEMERAL_POD_GENERATION_PROOF_V1";
const NEW_CONTRACT = "AVANTIQO_CODE_EPHEMERAL_POD_GENERATION_PROOF_V2";
const OLD_APPROVAL = "AVANTIQO_CODE_EPHEMERAL_POD_GENERATION_PROOF_APPROVED";
const NEW_APPROVAL = "AVANTIQO_CODE_EPHEMERAL_POD_GENERATION_PROOF_V2_APPROVED";
const OLD_SOURCE_SHA = "875627667bc055c78ed79d3b837c1e9566503ad9";
const NEW_SOURCE_SHA = "1cb94f50400afdf448d8460de0a2709f7f6dc688";
const OLD_DIGEST = "sha256:22d34b892d2718c8381557bc45e092063d66a47b8278dccd31b29eb360c2f4dc";
const NEW_DIGEST = "sha256:21075fc9457c5d6638d9a6a7f04ab748bd4ac50a65fed19e0fd57540a1325262";
const LEGACY_POD_HTTP_CONTRACT = "AVANTIQO_CODE_POD_HTTP_V1";
const POD_HTTP_CONTRACT = "AVANTIQO_CODE_POD_HTTP_V2";
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

function requiredSourceTransform(source) {
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
    .replaceAll(OLD_SOURCE_SHA, NEW_SOURCE_SHA)
    .replaceAll(OLD_DIGEST, NEW_DIGEST)
    .replaceAll(LEGACY_POD_HTTP_CONTRACT, POD_HTTP_CONTRACT);

  for (const marker of [OLD_CONTRACT, OLD_APPROVAL, OLD_SOURCE_SHA, OLD_DIGEST, LEGACY_POD_HTTP_CONTRACT]) {
    if (transformed.includes(marker)) {
      throw new Error(`${WRAPPER_CONTRACT}_TRANSFORM_INCOMPLETE:${marker}`);
    }
  }
  if (
    !transformed.includes(NEW_CONTRACT) ||
    !transformed.includes(NEW_SOURCE_SHA) ||
    !transformed.includes(NEW_DIGEST) ||
    !transformed.includes(POD_HTTP_CONTRACT)
  ) {
    throw new Error(`${WRAPPER_CONTRACT}_TRANSFORM_TARGETS_MISSING`);
  }
  return transformed;
}

function jsonResponse(body, status = 200, headers = undefined) {
  const responseHeaders = new Headers(headers || {});
  if (!responseHeaders.has("content-type")) responseHeaders.set("content-type", "application/json");
  return new Response(JSON.stringify(body), { status, headers: responseHeaders });
}

function parseJson(raw) {
  try {
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

const nativeFetch = globalThis.fetch.bind(globalThis);
let asyncSubmitCount = 0;
let asyncPollCount = 0;
let asyncSucceeded = false;

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
  const submitUrl = `${baseUrl}/jobs`;
  const submittedAt = Date.now();
  const submitResponse = await nativeFetch(submitUrl, {
    ...(init || {}),
    method: "POST",
  });
  const submitRaw = await submitResponse.text();
  const submitBody = parseJson(submitRaw);
  if (!submitResponse.ok) {
    return new Response(submitRaw, {
      status: submitResponse.status,
      headers: submitResponse.headers,
    });
  }
  const jobId = text(submitBody?.job_id);
  if (
    submitResponse.status !== 202 ||
    submitBody?.success !== true ||
    submitBody?.contract !== POD_HTTP_CONTRACT ||
    submitBody?.transport !== "pod-http" ||
    submitBody?.transport_mode !== "async-job-polling" ||
    submitBody?.proxy_timeout_safe !== true ||
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
    let pollResponse;
    try {
      pollResponse = await nativeFetch(`${baseUrl}/jobs/${encodeURIComponent(jobId)}`, {
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
          error_type: typeName(error),
          error_message: `${WRAPPER_CONTRACT}_ASYNC_POLL_TRANSPORT_FAILED:${text(error?.message).slice(0, 600)}`,
          raw_reasoning_persisted: false,
        },
        502,
      );
    }
    const pollRaw = await pollResponse.text();
    const pollBody = parseJson(pollRaw);
    if (!pollResponse.ok) {
      return new Response(pollRaw, { status: pollResponse.status, headers: pollResponse.headers });
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

function typeName(error) {
  return text(error?.name) || "Error";
}

console.log(`${WRAPPER_CONTRACT}_MODE=APPLY_ONLY`);
console.log(`${WRAPPER_CONTRACT}_IMMUTABLE_SOURCE_SHA=${NEW_SOURCE_SHA}`);
console.log(`${WRAPPER_CONTRACT}_IMMUTABLE_DIGEST=${NEW_DIGEST}`);
console.log(`${WRAPPER_CONTRACT}_POD_HTTP_CONTRACT=${POD_HTTP_CONTRACT}`);
console.log(`${WRAPPER_CONTRACT}_ASYNC_SUBMIT_MAX=1`);
console.log(`${WRAPPER_CONTRACT}_SYNCHRONOUS_GENERATION_NETWORK_CALL=false`);
console.log(`${WRAPPER_CONTRACT}_SECRETS_PRINTED=false`);

if (text(process.env[NEW_APPROVAL]).toUpperCase() !== "YES") {
  throw new Error(`${WRAPPER_CONTRACT}_APPROVAL_REQUIRED:set_${NEW_APPROVAL}=YES`);
}

git(["fetch", "origin", "main"], `${WRAPPER_CONTRACT}_GIT_FETCH_FAILED`);
const source = git(["show", `origin/main:${CORE_V1_PATH}`], `${WRAPPER_CONTRACT}_CORE_V1_READ_FAILED`);
const transformed = requiredSourceTransform(source);
const tempPath = `/tmp/run-avantiqo-code-ephemeral-pod-generation-proof-v2-core-${process.pid}.mjs`;
writeFileSync(tempPath, transformed, "utf8");

globalThis.fetch = proxyTimeoutSafeFetch;
try {
  await import(`${pathToFileURL(tempPath).href}?v=${Date.now()}`);
  if (asyncSubmitCount !== 1) throw new Error(`${WRAPPER_CONTRACT}_ASYNC_SUBMIT_COUNT_INVALID:${asyncSubmitCount}`);
  if (asyncPollCount < 1) throw new Error(`${WRAPPER_CONTRACT}_ASYNC_POLL_REQUIRED`);
  if (!asyncSucceeded) throw new Error(`${WRAPPER_CONTRACT}_ASYNC_SUCCESS_NOT_OBSERVED`);
  console.log(`${WRAPPER_CONTRACT}_ASYNC_TRANSPORT=PASS`);
} finally {
  globalThis.fetch = nativeFetch;
  try { unlinkSync(tempPath); } catch {}
}
