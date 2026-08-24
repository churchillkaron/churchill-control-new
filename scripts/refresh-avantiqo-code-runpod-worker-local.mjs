import { spawnSync } from "node:child_process";

const REST_BASE = "https://rest.runpod.io/v1";
const CODE_ENDPOINT_NAME = "avantiqo-code-v1";
const CODE_SOURCE_PATH = "services/avantiqo-code-engine";
const MIN_NETWORK_VOLUME_GB = 48;
const DEFAULT_WAIT_MS = 60 * 60 * 1000;
const DEFAULT_POLL_MS = 20_000;

function text(value) {
  return String(value ?? "").trim();
}

function required(name) {
  const value = text(process.env[name]);
  if (!value) throw new Error(`${name}_REQUIRED`);
  return value;
}

function finite(value, fallback = null) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function command(commandName, args, options = {}) {
  const result = spawnSync(commandName, args, {
    cwd: process.cwd(),
    encoding: "utf8",
    env: process.env,
    stdio: options.stdio || ["ignore", "pipe", "pipe"],
  });
  if (result.status !== 0) {
    const detail = text(result.stderr || result.stdout).slice(0, 1200);
    throw new Error(
      `${options.errorCode || "COMMAND_FAILED"}:${commandName}:${detail || `exit=${result.status}`}`,
    );
  }
  return text(result.stdout);
}

function commandResult(commandName, args) {
  return spawnSync(commandName, args, {
    cwd: process.cwd(),
    encoding: "utf8",
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"],
  });
}

async function restRequest(path, credential) {
  const response = await fetch(`${REST_BASE}${path}`, {
    headers: {
      Authorization: `Bearer ${credential}`,
      Accept: "application/json",
    },
    signal: AbortSignal.timeout(30_000),
  });
  const raw = await response.text();
  let body = null;
  try {
    body = raw ? JSON.parse(raw) : null;
  } catch {
    body = null;
  }
  if (!response.ok) {
    const detail = text(body?.message || body?.error || body?.detail || raw).slice(0, 1000);
    throw new Error(`RUNPOD_HTTP_${response.status}:${detail || "EMPTY_BODY"}`);
  }
  return body;
}

async function endpointBoundTemplates(managementKey) {
  const templates = await restRequest(
    "/templates?includeEndpointBoundTemplates=true&includePublicTemplates=false&includeRunpodTemplates=false",
    managementKey,
  );
  if (!Array.isArray(templates)) throw new Error("RUNPOD_TEMPLATE_LIST_INVALID");
  return templates;
}

async function resolveCodeEndpoint(managementKey) {
  const endpoints = await restRequest(
    "/endpoints?includeTemplate=true&includeWorkers=true",
    managementKey,
  );
  if (!Array.isArray(endpoints)) throw new Error("AVANTIQO_CODE_REFRESH_ENDPOINT_LIST_INVALID");

  const configuredId = text(process.env.RUNPOD_AVANTIQO_CODE_ENDPOINT_ID);
  if (configuredId) {
    const matches = endpoints.filter((endpoint) => text(endpoint?.id) === configuredId);
    if (matches.length !== 1) {
      throw new Error(
        `AVANTIQO_CODE_REFRESH_CONFIGURED_ENDPOINT_RESOLUTION_FAILED:id=${configuredId}:matches=${matches.length}`,
      );
    }
    if (text(matches[0]?.name) !== CODE_ENDPOINT_NAME) {
      throw new Error(
        `AVANTIQO_CODE_REFRESH_CONFIGURED_ENDPOINT_NAME_MISMATCH:${text(matches[0]?.name) || "MISSING"}`,
      );
    }
    return { endpoint_id: configuredId, resolution: "CONFIGURED_ID" };
  }

  const matches = endpoints.filter((endpoint) => text(endpoint?.name) === CODE_ENDPOINT_NAME);
  if (matches.length !== 1) {
    throw new Error(
      `AVANTIQO_CODE_REFRESH_EXACT_NAME_ENDPOINT_RESOLUTION_FAILED:name=${CODE_ENDPOINT_NAME}:matches=${matches.length}`,
    );
  }
  const endpointId = text(matches[0]?.id);
  if (!endpointId) throw new Error("AVANTIQO_CODE_REFRESH_EXACT_NAME_ENDPOINT_ID_MISSING");
  return { endpoint_id: endpointId, resolution: "EXACT_NAME" };
}

function resolveEndpointTemplate(endpoint, templates) {
  const inline = object(endpoint?.template);
  const templateId = text(endpoint?.templateId || inline.id);
  if (!templateId) throw new Error("AVANTIQO_CODE_TEMPLATE_ID_REQUIRED");
  if (Object.keys(inline).length) return inline;
  const matches = templates.filter((template) => text(template?.id) === templateId);
  if (matches.length !== 1) {
    throw new Error(
      `AVANTIQO_CODE_ENDPOINT_BOUND_TEMPLATE_RESOLUTION_FAILED:id=${templateId}:matches=${matches.length}`,
    );
  }
  return matches[0];
}

function endpointVolumeIds(endpoint = {}) {
  return [
    text(endpoint.networkVolumeId),
    ...(Array.isArray(endpoint.networkVolumeIds) ? endpoint.networkVolumeIds.map(text) : []),
  ].filter(Boolean);
}

function imageTag(imageName) {
  const value = text(imageName);
  if (!value) return null;
  const slash = value.lastIndexOf("/");
  const colon = value.lastIndexOf(":");
  if (colon <= slash) return null;
  return value.slice(colon + 1);
}

function safeTemplate(template = {}) {
  return {
    id: text(template.id) || null,
    name: text(template.name) || null,
    image_name: text(template.imageName) || null,
    image_tag: imageTag(template.imageName),
    container_disk_gb: finite(template.containerDiskInGb),
    volume_mount_path: text(template.volumeMountPath) || null,
  };
}

function safeEndpoint(endpoint = {}) {
  return {
    id: text(endpoint.id) || null,
    name: text(endpoint.name) || null,
    version: finite(endpoint.version),
    template_id: text(endpoint.templateId || endpoint.template?.id) || null,
    network_volume_id: text(endpoint.networkVolumeId) || null,
    network_volume_ids: Array.isArray(endpoint.networkVolumeIds)
      ? endpoint.networkVolumeIds.map(text).filter(Boolean)
      : [],
    data_center_ids: Array.isArray(endpoint.dataCenterIds)
      ? endpoint.dataCenterIds.map(text).filter(Boolean)
      : [],
    workers_min: finite(endpoint.workersMin),
    workers_max: finite(endpoint.workersMax),
  };
}

async function inspectEndpoint(managementKey, endpointId) {
  const [endpoint, templates] = await Promise.all([
    restRequest(
      `/endpoints/${encodeURIComponent(endpointId)}?includeTemplate=true&includeWorkers=true`,
      managementKey,
    ),
    endpointBoundTemplates(managementKey),
  ]);
  if (text(endpoint?.id) !== endpointId) throw new Error("AVANTIQO_CODE_ENDPOINT_ID_MISMATCH");
  if (text(endpoint?.name) !== CODE_ENDPOINT_NAME) {
    throw new Error(`AVANTIQO_CODE_ENDPOINT_NAME_MISMATCH:${text(endpoint?.name) || "MISSING"}`);
  }
  return { endpoint, template: resolveEndpointTemplate(endpoint, templates) };
}

function validateLocalMain() {
  command("git", ["fetch", "origin", "main"], { errorCode: "GIT_FETCH_MAIN_FAILED" });
  const branch = command("git", ["branch", "--show-current"], { errorCode: "GIT_BRANCH_READ_FAILED" });
  if (branch !== "main") throw new Error(`AVANTIQO_CODE_REFRESH_MAIN_REQUIRED:actual=${branch || "DETACHED"}`);
  const head = command("git", ["rev-parse", "HEAD"], { errorCode: "GIT_HEAD_READ_FAILED" });
  const originMain = command("git", ["rev-parse", "origin/main"], { errorCode: "GIT_ORIGIN_MAIN_READ_FAILED" });
  if (head !== originMain) {
    throw new Error(
      `AVANTIQO_CODE_REFRESH_LOCAL_MAIN_NOT_CURRENT:head=${head}:origin_main=${originMain}:run_git_pull_ff_only_first`,
    );
  }
  const sourceStatus = command(
    "git",
    ["status", "--porcelain", "--untracked-files=no", "--", CODE_SOURCE_PATH],
    { errorCode: "GIT_CODE_SOURCE_STATUS_FAILED" },
  );
  if (sourceStatus) throw new Error("AVANTIQO_CODE_REFRESH_CODE_SOURCE_HAS_LOCAL_CHANGES");
  return head;
}

function verifySource() {
  command("python3", ["-m", "py_compile", `${CODE_SOURCE_PATH}/handler.py`], {
    errorCode: "AVANTIQO_CODE_REFRESH_PYTHON_SYNTAX_FAILED",
  });
  const dockerfile = command("git", ["show", `HEAD:${CODE_SOURCE_PATH}/Dockerfile.runpod`], {
    errorCode: "AVANTIQO_CODE_REFRESH_DOCKERFILE_READ_FAILED",
  });
  for (const requiredText of [
    "FROM vllm/vllm-openai:v0.27.1",
    "Qwen/Qwen3-Coder-30B-A3B-Instruct-FP8",
    "HF_HOME=/runpod-volume/huggingface-cache",
    "VLLM_USE_FLASHINFER_SAMPLER=0",
    'ENTRYPOINT ["python3", "-u", "handler.py"]',
  ]) {
    if (!dockerfile.includes(requiredText)) {
      throw new Error(`AVANTIQO_CODE_REFRESH_DOCKERFILE_CONTRACT_MISSING:${requiredText}`);
    }
  }
}

function resolveCommitLikeTag(commitLike) {
  const tag = text(commitLike);
  if (!/^[0-9a-f]{7,40}$/i.test(tag)) return null;
  const result = commandResult("git", ["rev-parse", `${tag}^{commit}`]);
  return result.status === 0 ? text(result.stdout) : null;
}

function sourceChanges(leftCommit, rightCommit) {
  const result = command(
    "git",
    ["diff", "--name-only", `${leftCommit}..${rightCommit}`, "--", CODE_SOURCE_PATH],
    { errorCode: "AVANTIQO_CODE_REFRESH_SOURCE_DIFF_FAILED" },
  );
  return result.split("\n").map((value) => value.trim()).filter(Boolean);
}

function isAncestor(ancestorCommit, descendantCommit) {
  const result = commandResult("git", ["merge-base", "--is-ancestor", ancestorCommit, descendantCommit]);
  if (result.status === 0) return true;
  if (result.status === 1) return false;
  throw new Error("AVANTIQO_CODE_REFRESH_ANCESTRY_CHECK_FAILED");
}

function ghReady() {
  command("gh", ["--version"], { errorCode: "GH_CLI_REQUIRED" });
  command("gh", ["auth", "status"], { errorCode: "GH_AUTH_REQUIRED" });
}

function releaseExists(tag) {
  const result = commandResult("gh", [
    "release", "view", tag, "--json", "tagName,targetCommitish,isDraft,isPrerelease",
  ]);
  if (result.status !== 0) return null;
  try {
    return JSON.parse(result.stdout);
  } catch {
    throw new Error("AVANTIQO_CODE_REFRESH_EXISTING_RELEASE_RESPONSE_INVALID");
  }
}

function createRelease(tag, head) {
  command("gh", [
    "release", "create", tag,
    "--target", head,
    "--title", `Avantiqo Code worker ${head.slice(0, 12)}`,
    "--notes",
    [
      "Avantiqo Code RunPod worker refresh.",
      "",
      `Target commit: ${head}`,
      `Worker source: ${CODE_SOURCE_PATH}`,
      "Purpose: refresh the Code worker with the current source-locked FP8/vLLM runtime.",
      "This is provider worker infrastructure, not a Vercel production deployment.",
    ].join("\n"),
  ], { errorCode: "AVANTIQO_CODE_REFRESH_GITHUB_RELEASE_CREATE_FAILED" });
}

const apply = process.argv.includes("--apply");
const managementKey = required("RUNPOD_MANAGEMENT_API_KEY");
const waitMs = Math.max(60_000, finite(process.env.AVANTIQO_CODE_RUNPOD_REFRESH_WAIT_MS, DEFAULT_WAIT_MS));
const pollMs = Math.max(5_000, finite(process.env.AVANTIQO_CODE_RUNPOD_REFRESH_POLL_MS, DEFAULT_POLL_MS));

console.log(`AVANTIQO_CODE_RUNPOD_REFRESH_MODE=${apply ? "APPLY" : "PLAN"}`);
console.log("AVANTIQO_CODE_RUNPOD_REFRESH_PRODUCTION_DEPLOY_PERFORMED=false");
console.log("AVANTIQO_CODE_RUNPOD_REFRESH_GENERATION_SUBMITTED=false");
console.log("AVANTIQO_CODE_RUNPOD_REFRESH_SECRETS_PRINTED=false");

const head = validateLocalMain();
verifySource();
ghReady();

const endpointResolution = await resolveCodeEndpoint(managementKey);
const endpointId = endpointResolution.endpoint_id;
console.log(`AVANTIQO_CODE_RUNPOD_REFRESH_ENDPOINT_RESOLUTION=${endpointResolution.resolution}`);
console.log(`AVANTIQO_CODE_RUNPOD_REFRESH_ENDPOINT_NAME=${CODE_ENDPOINT_NAME}`);
console.log("AVANTIQO_CODE_RUNPOD_REFRESH_ENDPOINT_SECRET_PRINTED=false");

const { endpoint, template } = await inspectEndpoint(managementKey, endpointId);
const attachedVolumeIds = endpointVolumeIds(endpoint);
if (!attachedVolumeIds.length) {
  throw new Error("AVANTIQO_CODE_REFRESH_NETWORK_VOLUME_REQUIRED:run_provision_avantiqo_code_runpod_storage_first");
}
const attachedVolumes = await Promise.all(
  attachedVolumeIds.map((volumeId) =>
    restRequest(`/networkvolumes/${encodeURIComponent(volumeId)}`, managementKey),
  ),
);
const suitableVolume = attachedVolumes.find((volume) => finite(volume?.size, 0) >= MIN_NETWORK_VOLUME_GB);
if (!suitableVolume) {
  throw new Error(`AVANTIQO_CODE_REFRESH_NETWORK_VOLUME_TOO_SMALL:min_gb=${MIN_NETWORK_VOLUME_GB}`);
}

const deployedImage = text(template?.imageName);
const deployedTag = imageTag(deployedImage);
const deployedCommit = resolveCommitLikeTag(deployedTag);
if (!deployedCommit) {
  throw new Error(`AVANTIQO_CODE_REFRESH_DEPLOYED_COMMIT_NOT_IN_REPOSITORY:${deployedTag || "MISSING"}`);
}
if (!isAncestor(deployedCommit, head) && !isAncestor(head, deployedCommit)) {
  throw new Error("AVANTIQO_CODE_REFRESH_DEPLOYED_COMMIT_DIVERGES_FROM_MAIN");
}
const changedSourceFiles = sourceChanges(deployedCommit, head);
const expectedRunpodTag = head.slice(0, 9);
const releaseTag = `runpod-code-${head.slice(0, 12)}`;
const existingRelease = releaseExists(releaseTag);
if (existingRelease && text(existingRelease.targetCommitish) && text(existingRelease.targetCommitish) !== head) {
  throw new Error(
    `AVANTIQO_CODE_REFRESH_RELEASE_TARGET_MISMATCH:tag=${releaseTag}:target=${text(existingRelease.targetCommitish)}`,
  );
}

const plan = {
  success: true,
  contract: "AVANTIQO_CODE_RUNPOD_WORKER_REFRESH_V1",
  mode: apply ? "APPLY" : "PLAN",
  mutation_performed: false,
  main_commit: head,
  endpoint_resolution: endpointResolution.resolution,
  endpoint: safeEndpoint(endpoint),
  template: safeTemplate(template),
  attached_network_volume: {
    id: text(suitableVolume?.id) || null,
    name: text(suitableVolume?.name) || null,
    size_gb: finite(suitableVolume?.size),
    data_center_id: text(suitableVolume?.dataCenterId) || null,
  },
  deployed_commit: deployedCommit,
  deployed_image_tag: deployedTag,
  code_source_changes_since_deployed_build: changedSourceFiles,
  deployed_source_equivalent_to_main: changedSourceFiles.length === 0,
  refresh_required: changedSourceFiles.length > 0,
  release: {
    tag: releaseTag,
    target_commit: head,
    already_exists: Boolean(existingRelease),
    expected_runpod_image_tag: expectedRunpodTag,
  },
  safety: {
    apply_required_for_release_creation: true,
    runpod_release_trigger_is_repository_level: true,
    generation_submitted: false,
    production_deploy_performed: false,
  },
};

if (!apply) {
  console.log("AVANTIQO_CODE_RUNPOD_REFRESH_PLAN=READY");
  console.log(JSON.stringify(plan, null, 2));
  process.exit(0);
}

if (!plan.refresh_required) {
  console.log("AVANTIQO_CODE_RUNPOD_REFRESH_ALREADY_CURRENT=true");
  console.log(JSON.stringify({ ...plan, mode: "APPLY", mutation_performed: false }, null, 2));
  process.exit(0);
}

// Fetch again immediately before the repository-level release trigger.
const latestHead = validateLocalMain();
if (latestHead !== head) {
  throw new Error(`AVANTIQO_CODE_REFRESH_MAIN_MOVED_BEFORE_RELEASE:planned=${head}:current=${latestHead}`);
}
const beforeWrite = await inspectEndpoint(managementKey, endpointId);
if (text(beforeWrite.endpoint.templateId || beforeWrite.endpoint.template?.id) !== text(endpoint.templateId || endpoint.template?.id)) {
  throw new Error("AVANTIQO_CODE_REFRESH_CONCURRENT_TEMPLATE_CHANGE_DETECTED");
}
if (!endpointVolumeIds(beforeWrite.endpoint).includes(text(suitableVolume.id))) {
  throw new Error("AVANTIQO_CODE_REFRESH_CONCURRENT_VOLUME_CHANGE_DETECTED");
}

if (!existingRelease) createRelease(releaseTag, head);
console.log(`AVANTIQO_CODE_RUNPOD_REFRESH_RELEASE=${releaseTag}`);

const deadline = Date.now() + waitMs;
let finalEndpoint = beforeWrite.endpoint;
let finalTemplate = beforeWrite.template;
let changed = false;
while (Date.now() < deadline) {
  await sleep(pollMs);
  const current = await inspectEndpoint(managementKey, endpointId);
  finalEndpoint = current.endpoint;
  finalTemplate = current.template;
  const currentTag = imageTag(finalTemplate?.imageName);
  console.log(JSON.stringify({
    event: "AVANTIQO_CODE_RUNPOD_REFRESH_PROGRESS",
    endpoint_version: finite(finalEndpoint?.version),
    image_tag: currentTag,
    expected_image_tag: expectedRunpodTag,
    generation_submitted: false,
  }));
  const currentCommit = resolveCommitLikeTag(currentTag);
  if (currentCommit && sourceChanges(currentCommit, head).length === 0) {
    changed = true;
    break;
  }
}

const result = {
  ...plan,
  success: changed,
  mode: "APPLY",
  mutation_performed: true,
  endpoint_after: safeEndpoint(finalEndpoint),
  template_after: safeTemplate(finalTemplate),
  image_refresh_verified: changed,
  generation_submitted: false,
  production_deploy_performed: false,
  next_action: changed ? "CACHE_CODE_FP8_RUNTIME_MODEL" : "INSPECT_RUNPOD_GITHUB_INTEGRATION",
};
console.log(JSON.stringify(result, null, 2));
if (!changed) process.exitCode = 2;
