import { readFile, unlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

const CONTRACT = "AVANTIQO_CODE_REAL_WRITE_E2E_PROOF_V5_LAUNCHER";
const V1_PATH = "scripts/run-avantiqo-code-real-write-e2e-proof-v1-local.mjs";
const V3_PATH = "scripts/run-avantiqo-code-real-write-e2e-proof-v3-local.mjs";
const V1_DECLARATION = 'const V1_PATH = "scripts/run-avantiqo-code-real-write-e2e-proof-v1-local.mjs";';
const CREATE_START = "async function createPod() {";
const DELETE_START = "async function deleteVerified() {";
const REPORT_MARKER = "const report = {\n  success:";
const CONTRACT_PROOF_MARKER = "  contract: CONTRACT,\n  proof: {";
const MAX_POD_CREATE_ATTEMPTS = 12;
const POD_CREATE_RETRY_MS = 10_000;
const PRELOADED_CODE_IMAGE = "ghcr.io/churchillkaron/avantiqo-code-pod@sha256:c636b7fc23ab2cd433978cf0ba0470acff7df0df6747b3a64b5e71d1ec762a41";

process.env.AVANTIQO_CODE_E2E_IMAGE = String(process.env.AVANTIQO_CODE_E2E_IMAGE || PRELOADED_CODE_IMAGE).trim();

const v1Temp = path.join(os.tmpdir(), `avantiqo-code-real-write-v5-v1-${process.pid}-${Date.now()}.mjs`);
const v3Temp = path.join(os.tmpdir(), `avantiqo-code-real-write-v5-v3-${process.pid}-${Date.now()}.mjs`);

console.log(JSON.stringify({
  event: "AVANTIQO_CODE_REAL_WRITE_E2E_V5_START",
  contract: CONTRACT,
  image_digest: process.env.AVANTIQO_CODE_E2E_IMAGE.split("@")[1] || null,
  immutable_preloaded_image_required: true,
  dynamic_live_volume_discovery: true,
  low_stock_allocator: "bounded-exact-error-retry",
  max_pod_create_attempts: MAX_POD_CREATE_ATTEMPTS,
  pod_create_retry_ms: POD_CREATE_RETRY_MS,
  proof_max_model_len: Number(process.env.AVANTIQO_CODE_MAX_MODEL_LEN || 8192),
  exact_generated_source_visible: true,
  production_deploy_performed: false,
  secrets_printed: false,
}));

try {
  const [v1Source, v3Source] = await Promise.all([
    readFile(V1_PATH, "utf8"),
    readFile(V3_PATH, "utf8"),
  ]);

  const createStart = v1Source.indexOf(CREATE_START);
  const deleteStart = v1Source.indexOf(DELETE_START);
  if (createStart < 0 || deleteStart <= createStart) {
    throw new Error(`${CONTRACT}_V1_CREATE_POD_BOUNDARY_MISSING`);
  }
  if (!v1Source.includes(REPORT_MARKER)) throw new Error(`${CONTRACT}_V1_REPORT_MARKER_MISSING`);
  if (!v1Source.includes(CONTRACT_PROOF_MARKER)) throw new Error(`${CONTRACT}_V1_PROOF_MARKER_MISSING`);
  if (!v3Source.includes(V1_DECLARATION)) throw new Error(`${CONTRACT}_V3_V1_DECLARATION_MISSING`);

  const retryingCreatePod = `async function createPod() {
  const createBody = {
    allowedCudaVersions: ALLOWED_CUDA_VERSIONS,
    cloudType: "SECURE",
    computeType: "GPU",
    containerDiskInGb: 50,
    dataCenterIds: [DATA_CENTER_ID],
    dataCenterPriority: "availability",
    env: {
      AVANTIQO_CODE_POD_TOKEN: podToken,
      AVANTIQO_CODE_MAX_MODEL_LEN: text(process.env.AVANTIQO_CODE_MAX_MODEL_LEN || "8192"),
      AVANTIQO_CODE_MAX_NEW_TOKENS: text(process.env.AVANTIQO_CODE_MAX_NEW_TOKENS || "2048"),
      AVANTIQO_CODE_GPU_MEMORY_UTILIZATION: text(process.env.AVANTIQO_CODE_GPU_MEMORY_UTILIZATION || "0.90"),
    },
    gpuCount: 1,
    gpuTypeIds: GPU_TYPE_IDS,
    gpuTypePriority: "availability",
    imageName: IMAGE,
    interruptible: false,
    locked: false,
    name: podName,
    networkVolumeId: NETWORK_VOLUME_ID,
    ports: ["8000/http"],
    supportPublicIp: true,
    volumeMountPath: "/workspace",
  };
  const maxAttempts = ${MAX_POD_CREATE_ATTEMPTS};
  const retryMs = ${POD_CREATE_RETRY_MS};
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    podCreateAttempts = attempt;
    try {
      const created = await rest("/pods", {
        method: "POST",
        timeoutMs: 60_000,
        body: createBody,
      });
      podId = text(created?.id);
      if (!podId) throw new Error(\`${'${CONTRACT}'}_POD_ID_REQUIRED\`);
      podCreatePerformed = true;
      podBaseUrl = \`https://${'${podId}'}-8000.proxy.runpod.net\`;
      console.log(JSON.stringify({
        event: "AVANTIQO_CODE_REAL_WRITE_E2E_PROGRESS",
        phase: "POD_ALLOCATED",
        pod_create_attempt: attempt,
        secrets_printed: false,
      }));
      return created;
    } catch (error) {
      const message = text(error?.message || error);
      const exactCapacityMiss = message.includes("RUNPOD_HTTP_500:create pod: There are no instances currently available");
      if (!exactCapacityMiss || attempt >= maxAttempts) throw error;
      console.log(JSON.stringify({
        event: "AVANTIQO_CODE_REAL_WRITE_E2E_PROGRESS",
        phase: "LOW_STOCK_ALLOCATION_RETRY",
        pod_create_attempt: attempt,
        next_attempt: attempt + 1,
        retry_ms: retryMs,
        inference_performed: false,
        secrets_printed: false,
      }));
      await sleep(retryMs);
    }
  }
  throw new Error(\`${'${CONTRACT}'}_POD_CREATE_ATTEMPTS_EXHAUSTED\`);
}

`;

  let visibleV1 = `${v1Source.slice(0, createStart)}${retryingCreatePod}${v1Source.slice(deleteStart)}`;
  const stateMarker = 'let podCreatePerformed = false;';
  if (!visibleV1.includes(stateMarker)) throw new Error(`${CONTRACT}_POD_CREATE_STATE_MARKER_MISSING`);
  visibleV1 = visibleV1.replace(stateMarker, `${stateMarker}\nlet podCreateAttempts = 0;`);

  visibleV1 = visibleV1
    .replace(
      REPORT_MARKER,
      [
        "if (generatedTestsPassed && generatedSource) {",
        "  console.log(\"AVANTIQO_CODE_GENERATED_SOURCE_BEGIN\");",
        "  process.stdout.write(generatedSource.endsWith(\"\\n\") ? generatedSource : `${generatedSource}\\n`);",
        "  console.log(\"AVANTIQO_CODE_GENERATED_SOURCE_END\");",
        "}",
        "",
        REPORT_MARKER,
      ].join("\n"),
    )
    .replace(
      CONTRACT_PROOF_MARKER,
      [
        "  contract: CONTRACT,",
        "  generated_file: {",
        "    path: MODULE_NAME,",
        "    content: generatedSource || null,",
        "    sha256: generatedSourceSha256 || null,",
        "  },",
        "  allocation: {",
        "    pod_create_attempts: podCreateAttempts,",
        `    max_pod_create_attempts: ${MAX_POD_CREATE_ATTEMPTS},`,
        `    retry_ms: ${POD_CREATE_RETRY_MS},`,
        "    proof_max_model_len: Number(process.env.AVANTIQO_CODE_MAX_MODEL_LEN || 8192),",
        "    immutable_preloaded_image: process.env.AVANTIQO_CODE_E2E_IMAGE,",
        "  },",
        "  proof: {",
      ].join("\n"),
    );

  const visibleV3 = v3Source.replace(V1_DECLARATION, `const V1_PATH = ${JSON.stringify(v1Temp)};`);

  await writeFile(v1Temp, visibleV1, "utf8");
  await writeFile(v3Temp, visibleV3, "utf8");
  await import(`${pathToFileURL(v3Temp).href}?v=${Date.now()}`);
  console.log(`${CONTRACT}=PASS`);
} finally {
  await Promise.all([
    unlink(v1Temp).catch(() => {}),
    unlink(v3Temp).catch(() => {}),
  ]);
}
