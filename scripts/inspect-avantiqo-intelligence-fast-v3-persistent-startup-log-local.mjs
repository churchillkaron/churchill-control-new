import { createHash, createHmac } from "node:crypto";
import { spawnSync } from "node:child_process";

const CONTRACT = "AVANTIQO_INTELLIGENCE_FAST_V3_PERSISTENT_STARTUP_LOG_INSPECTOR_V1";
const REGION = "US-CA-2";
const ENDPOINT = "https://s3api-us-ca-2.runpod.io";
const BUCKET = "7obluigbr0";
const KEY = "intelligence-fast-vllm-startup.log";

const text = (value) => String(value ?? "").trim();

function redact(value) {
  return text(value)
    .slice(0, 12000)
    .replace(/Bearer\s+[A-Za-z0-9._~+\/-]{8,}/gi, "Bearer [REDACTED]")
    .replace(/\bhf_[A-Za-z0-9]{8,}\b/g, "hf_[REDACTED]")
    .replace(/\brps_[A-Za-z0-9._~+\/-]{8,}\b/g, "rps_[REDACTED]")
    .replace(/((?:api[_-]?key|access[_-]?key|secret[_-]?key|token|password|secret|authorization)\s*[=:]\s*)[^\s,;]+/gi, "$1[REDACTED]")
    .replace(/([?&](?:token|key|api_key|apikey|sig|signature)=)[^&\s]+/gi, "$1[REDACTED]");
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function hmac(key, value, encoding = undefined) {
  return createHmac("sha256", key).update(value).digest(encoding);
}

function credentialFromAwsCli(name) {
  const result = spawnSync("aws", ["configure", "get", name], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.error || result.status !== 0) return "";
  return text(result.stdout);
}

function resolveCredentials() {
  const envAccessKey = text(
    process.env.RUNPOD_S3_ACCESS_KEY_ID ||
    process.env.RUNPOD_S3_ACCESS_KEY ||
    process.env.AWS_ACCESS_KEY_ID,
  );
  const envSecretKey = text(
    process.env.RUNPOD_S3_SECRET_ACCESS_KEY ||
    process.env.RUNPOD_S3_SECRET_KEY ||
    process.env.AWS_SECRET_ACCESS_KEY,
  );
  let accessKey = envAccessKey;
  let secretKey = envSecretKey;
  let source = accessKey && secretKey ? "ENV" : "";

  if (!accessKey || !secretKey) {
    const cliAccess = credentialFromAwsCli("aws_access_key_id");
    const cliSecret = credentialFromAwsCli("aws_secret_access_key");
    if (cliAccess && cliSecret) {
      accessKey = cliAccess;
      secretKey = cliSecret;
      source = "AWS_CLI_PROFILE";
    }
  }

  return { accessKey, secretKey, source };
}

function amzTimestamp(date = new Date()) {
  return date.toISOString().replace(/[:-]|\.\d{3}/g, "");
}

function canonicalUri() {
  return `/${encodeURIComponent(BUCKET)}/${KEY.split("/").map(encodeURIComponent).join("/")}`;
}

async function signedGet(accessKey, secretKey) {
  const url = new URL(`${ENDPOINT}${canonicalUri()}`);
  const host = url.host;
  const amzDate = amzTimestamp();
  const dateStamp = amzDate.slice(0, 8);
  const payloadHash = sha256("");
  const canonicalHeaders = `host:${host}\nx-amz-content-sha256:${payloadHash}\nx-amz-date:${amzDate}\n`;
  const signedHeaders = "host;x-amz-content-sha256;x-amz-date";
  const canonicalRequest = [
    "GET",
    canonicalUri(),
    "",
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join("\n");
  const credentialScope = `${dateStamp}/${REGION}/s3/aws4_request`;
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    credentialScope,
    sha256(canonicalRequest),
  ].join("\n");
  const kDate = hmac(`AWS4${secretKey}`, dateStamp);
  const kRegion = hmac(kDate, REGION);
  const kService = hmac(kRegion, "s3");
  const kSigning = hmac(kService, "aws4_request");
  const signature = hmac(kSigning, stringToSign, "hex");
  const authorization = `AWS4-HMAC-SHA256 Credential=${accessKey}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  const response = await fetch(url, {
    headers: {
      Authorization: authorization,
      "x-amz-content-sha256": payloadHash,
      "x-amz-date": amzDate,
    },
    signal: AbortSignal.timeout(30000),
  });
  const raw = await response.text();
  return { status: response.status, ok: response.ok, raw };
}

function classify(log) {
  const value = text(log);
  if (!value) return "STARTUP_LOG_EMPTY";
  if (/No module named|ModuleNotFoundError/i.test(value)) return "PYTHON_MODULE_MISSING";
  if (/unrecognized arguments|usage:.*vllm/i.test(value)) return "VLLM_ARGUMENT_REJECTED";
  if (/CUDA out of memory|OutOfMemoryError|out of memory/i.test(value)) return "GPU_MEMORY_FAILURE";
  if (/Traceback \(most recent call last\)|RuntimeError:|ValueError:/i.test(value)) return "VLLM_STARTUP_EXCEPTION";
  if (/Downloading|Fetching|safetensors|Loading model|Loading weights|Loading checkpoint|model weights/i.test(value)) return "MODEL_LOAD_OR_DOWNLOAD_IN_PROGRESS";
  if (/Uvicorn running|Application startup complete|Started server process|OpenAI API server/i.test(value)) return "VLLM_SERVER_STARTED";
  return "STARTUP_LOG_PRESENT_UNCLASSIFIED";
}

const credentials = resolveCredentials();
const credentialSummary = {
  available: Boolean(credentials.accessKey && credentials.secretKey),
  source: credentials.source || null,
  values_printed: false,
};

if (!credentialSummary.available) {
  console.log(JSON.stringify({
    success: false,
    contract: CONTRACT,
    mode: "READ_ONLY",
    diagnosis: "RUNPOD_S3_CREDENTIALS_REQUIRED",
    network_volume_id: BUCKET,
    data_center_id: REGION,
    object_key: KEY,
    credential_summary: credentialSummary,
    gpu_opened: false,
    pod_created: false,
    runpod_mutation_performed: false,
    inference_performed: false,
    production_deploy_performed: false,
    secrets_printed: false,
  }, null, 2));
  console.log(`${CONTRACT}=CREDENTIALS_REQUIRED`);
  process.exitCode = 2;
} else {
  let result;
  try {
    result = await signedGet(credentials.accessKey, credentials.secretKey);
  } catch (error) {
    console.log(JSON.stringify({
      success: false,
      contract: CONTRACT,
      mode: "READ_ONLY",
      diagnosis: "RUNPOD_S3_REQUEST_FAILED",
      error: redact(error?.message),
      credential_summary: credentialSummary,
      gpu_opened: false,
      pod_created: false,
      runpod_mutation_performed: false,
      inference_performed: false,
      production_deploy_performed: false,
      secrets_printed: false,
    }, null, 2));
    console.log(`${CONTRACT}=FAIL`);
    process.exitCode = 1;
  }

  if (result) {
    if (result.status === 404) {
      console.log(JSON.stringify({
        success: true,
        contract: CONTRACT,
        mode: "READ_ONLY",
        diagnosis: "STARTUP_LOG_MISSING",
        interpretation: "V3 did not reach persistent startup-log initialization on the shared volume before termination.",
        network_volume_id: BUCKET,
        data_center_id: REGION,
        object_key: KEY,
        credential_summary: credentialSummary,
        gpu_opened: false,
        pod_created: false,
        runpod_mutation_performed: false,
        inference_performed: false,
        production_deploy_performed: false,
        secrets_printed: false,
      }, null, 2));
      console.log(`${CONTRACT}=PASS`);
    } else if (result.status === 401 || result.status === 403) {
      console.log(JSON.stringify({
        success: false,
        contract: CONTRACT,
        mode: "READ_ONLY",
        diagnosis: "RUNPOD_S3_CREDENTIAL_REJECTED",
        http_status: result.status,
        response_excerpt: redact(result.raw).slice(0, 600),
        credential_summary: credentialSummary,
        gpu_opened: false,
        pod_created: false,
        runpod_mutation_performed: false,
        inference_performed: false,
        production_deploy_performed: false,
        secrets_printed: false,
      }, null, 2));
      console.log(`${CONTRACT}=CREDENTIAL_REJECTED`);
      process.exitCode = 3;
    } else if (!result.ok) {
      console.log(JSON.stringify({
        success: false,
        contract: CONTRACT,
        mode: "READ_ONLY",
        diagnosis: "RUNPOD_S3_HTTP_ERROR",
        http_status: result.status,
        response_excerpt: redact(result.raw).slice(0, 800),
        credential_summary: credentialSummary,
        gpu_opened: false,
        pod_created: false,
        runpod_mutation_performed: false,
        inference_performed: false,
        production_deploy_performed: false,
        secrets_printed: false,
      }, null, 2));
      console.log(`${CONTRACT}=FAIL`);
      process.exitCode = 1;
    } else {
      const safeLog = redact(result.raw);
      const diagnosis = classify(safeLog);
      console.log(JSON.stringify({
        success: true,
        contract: CONTRACT,
        mode: "READ_ONLY",
        diagnosis,
        network_volume_id: BUCKET,
        data_center_id: REGION,
        object_key: KEY,
        startup_log_bytes: Buffer.byteLength(result.raw),
        startup_log_excerpt: safeLog.slice(-3000),
        credential_summary: credentialSummary,
        gpu_opened: false,
        pod_created: false,
        runpod_mutation_performed: false,
        inference_performed: false,
        production_deploy_performed: false,
        secrets_printed: false,
      }, null, 2));
      console.log(`${CONTRACT}=PASS`);
    }
  }
}
