import { spawnSync } from "node:child_process";

const REST_BASE = "https://rest.runpod.io/v1";
const IMAGE_ENDPOINT_NAME = "avantiqo-image-v1";
const IMAGE_SOURCE_PATH = "services/avantiqo-image-engine";
const MIN_NETWORK_VOLUME_GB = 64;
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

function resolveEndpointTemplate(endpoint, templates) {
  const inline = object(endpoint?.template);
  const templateId = text(endpoint?.templateId || inline.id);
  if (!templateId) throw new Error("AVANTIQO_IMAGE_TEMPLATE_ID_REQUIRED");
  if (Object.keys(inline).length) return inline;

  const matches = templates.filter((template) => text(template?.id) === templateId);
  if (matches.length !== 1) {
    throw new Error(
      `AVANTIQO_ENDPOINT_BOUND_TEMPLATE_RESOLUTION_FAILED:id=${templateId}:matches=${matches.length}`,
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
  if (text(endpoint?.id) !== endpointId) throw new Error("AVANTIQO_IMAGE_ENDPOINT_ID_MISMATCH");
  if (text(endpoint?.name) !== IMAGE_ENDPOINT_NAME) {
    throw new Error(`AVANTIQO_IMAGE_ENDPOINT_NAME_MISMATCH:${text(endpoint?.name) || "MISSING"}`);
  }
  return {
    endpoint,
    template: resolveEndpointTemplate(endpoint, templates),
  };
}

async function inspectAllEndpointImages(managementKey) {
  const [endpoints, templates] = await Promise.all([
    restRequest(
      "/endpoints?includeTemplate=true&includeWorkers=false",
      managementKey,
    ),
    endpointBoundTemplates(managementKey),
  ]);
  if (!Array.isArray(endpoints)) throw new Error("RUNPOD_ENDPOINT_LIST_INVALID");
  const templateById = new Map(
    templates.map((template) => [text(template?.id), template]).filter(([id]) => id),
  );
  return Object.fromEntries(
    endpoints
      .map((endpoint) => {
        const inline = object(endpoint?.template);
        const templateId = text(endpoint?.templateId || inline.id);
        const template = Object.keys(inline).length
          ? inline
          : templateById.get(templateId) || {};
        return [
          text(endpoint?.id),
          {
            name: text(endpoint?.name) || null,
            image_name: text(template?.imageName) || null,
            image_tag: imageTag(template?.imageName),
            version: finite(endpoint?.version),
          },
        ];
      })
      .filter(([id]) => id),
  );
}

function validateLocalMain() {
  command("git", ["fetch", "origin", "main"], {
    errorCode: "GIT_FETCH_MAIN_FAILED",
  });
  const branch = command("git", ["branch", "--show-current"], {
    errorCode: "GIT_BRANCH_READ_FAILED",
  });
  if (branch !== "main") throw new Error(`AVANTIQO_IMAGE_REFRESH_MAIN_REQUIRED:actual=${branch || "DETACHED"}`);
  const head = command("git", ["rev-parse", "HEAD"], {
    errorCode: "GIT_HEAD_READ_FAILED",
  });
  const originMain = command("git", ["rev-parse", "origin/main"], {
    errorCode: "GIT_ORIGIN_MAIN_READ_FAILED",
  });
  if (head !== originMain) {
    throw new Error(
      `AVANTIQO_IMAGE_REFRESH_LOCAL_MAIN_NOT_CURRENT:head=${head}:origin_main=${originMain}:run_git_pull_ff_only_first`,
    );
  }
  const sourceStatus = command(
    "git",
    ["status", "--porcelain", "--untracked-files=no", "--", IMAGE_SOURCE_PATH],
    { errorCode: "GIT_IMAGE_SOURCE_STATUS_FAILED" },
  );
  if (sourceStatus) throw new Error("AVANTIQO_IMAGE_REFRESH_IMAGE_SOURCE_HAS_LOCAL_CHANGES");
  return head;
}

function verifyPythonSyntax() {
  command(
    "python3",
    [
      "-m",
      "py_compile",
      `${IMAGE_SOURCE_PATH}/handler.py`,
      `${IMAGE_SOURCE_PATH}/handler_v2.py`,
    ],
    { errorCode: "AVANTIQO_IMAGE_REFRESH_PYTHON_SYNTAX_FAILED" },
  );
}

function resolveDeployedCommit(deployedTag) {
  const tag = text(deployedTag);
  if (!/^[0-9a-f]{7,40}$/i.test(tag)) {
    throw new Error(`AVANTIQO_IMAGE_REFRESH_DEPLOYED_TAG_NOT_COMMIT_LIKE:${tag || "MISSING"}`);
  }
  return command("git", ["rev-parse", `${tag}^{commit}`], {
    errorCode: "AVANTIQO_IMAGE_REFRESH_DEPLOYED_COMMIT_NOT_IN_REPOSITORY",
  });
}

function sourceChanges(deployedCommit, head) {
  const result = command(
    "git",
    ["diff", "--name-only", `${deployedCommit}..${head}`, "--", IMAGE_SOURCE_PATH],
    { errorCode: "AVANTIQO_IMAGE_REFRESH_SOURCE_DIFF_FAILED" },
  );
  return result
    .split("\n")
    .map((value) => value.trim())
    .filter(Boolean);
}

function ghReady() {
  command("gh", ["--version"], { errorCode: "GH_CLI_REQUIRED" });
  command("gh", ["auth", "status"], { errorCode: "GH_AUTH_REQUIRED" });
}

function releaseExists(tag) {
  const result = spawnSync("gh", ["release", "view", tag, "--json", "tagName,targetCommitish,isDraft,isPrerelease"], {
    cwd: process.cwd(),
    encoding: "utf8",
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.status !== 0) return null;
  try {
    return JSON.parse(result.stdout);
  } catch {
    throw new Error("AVANTIQO_IMAGE_REFRESH_EXISTING_RELEASE_RESPONSE_INVALID");
  }
}

function createRelease(tag, head) {
  const notes = [
    "Avantiqo Image RunPod worker refresh.",
    "",
    `Target commit: ${head}`,
    `Worker source: ${IMAGE_SOURCE_PATH}`,
    "Purpose: refresh the Image worker before Qwen-Image-2512 cache/bootstrap testing.",
    "This is provider worker infrastructure, not a Vercel production deployment.",
  ].join("\n");
  command(
    "gh",
    [
      "release",
      "create",
      tag,
      "--target",
      head,
      "--title",
      `Avantiqo Image worker ${head.slice(0, 12)}`,
      "--notes",
      notes,
    ],
    { errorCode: "AVANTIQO_IMAGE_REFRESH_GITHUB_RELEASE_CREATE_FAILED" },
  );
}

function changedEndpoints(before, after) {
  const ids = [...new Set([...Object.keys(before), ...Object.keys(after)])].sort();
  return ids
    .map((id) => ({
      endpoint_id: id,
      endpoint_name: after[id]?.name || before[id]?.name || null,
      before_image_name: before[id]?.image_name || null,
      after_image_name: after[id]?.image_name || null,
      before_version: before[id]?.version ?? null,
      after_version: after[id]?.version ?? null,
    }))
    .filter(
      (entry) =>
        entry.before_image_name !== entry.after_image_name ||
        entry.before_version !== entry.after_version,
    );
}

const apply = process.argv.includes("--apply");
const managementKey = required("RUNPOD_MANAGEMENT_API_KEY");
const endpointId = required("RUNPOD_AVANTIQO_IMAGE_ENDPOINT_ID");
const waitMs = finite(process.env.AVANTIQO_IMAGE_RUNPOD_REFRESH_WAIT_MS, DEFAULT_WAIT_MS);
const pollMs = finite(process.env.AVANTIQO_IMAGE_RUNPOD_REFRESH_POLL_MS, DEFAULT_POLL_MS);

console.log(`AVANTIQO_IMAGE_RUNPOD_REFRESH_MODE=${apply ? "APPLY" : "PLAN"}`);
console.log("AVANTIQO_IMAGE_RUNPOD_REFRESH_PRODUCTION_DEPLOY_PERFORMED=false");
console.log("AVANTIQO_IMAGE_RUNPOD_REFRESH_GENERATION_SUBMITTED=false");
console.log("AVANTIQO_IMAGE_RUNPOD_REFRESH_SECRETS_PRINTED=false");

const head = validateLocalMain();
verifyPythonSyntax();
ghReady();

const [{ endpoint, template }, beforeEndpointImages] = await Promise.all([
  inspectEndpoint(managementKey, endpointId),
  inspectAllEndpointImages(managementKey),
]);
const attachedVolumeIds = endpointVolumeIds(endpoint);
if (!attachedVolumeIds.length) {
  throw new Error("AVANTIQO_IMAGE_REFRESH_NETWORK_VOLUME_REQUIRED");
}
const attachedVolumes = await Promise.all(
  attachedVolumeIds.map((volumeId) =>
    restRequest(`/networkvolumes/${encodeURIComponent(volumeId)}`, managementKey),
  ),
);
const suitableVolume = attachedVolumes.find((volume) => finite(volume?.size, 0) >= MIN_NETWORK_VOLUME_GB);
if (!suitableVolume) {
  throw new Error(
    `AVANTIQO_IMAGE_REFRESH_NETWORK_VOLUME_TOO_SMALL:min_gb=${MIN_NETWORK_VOLUME_GB}`,
  );
}

const deployedImage = text(template?.imageName);
const deployedTag = imageTag(deployedImage);
const deployedCommit = resolveDeployedCommit(deployedTag);
command("git", ["merge-base", "--is-ancestor", deployedCommit, head], {
  errorCode: "AVANTIQO_IMAGE_REFRESH_DEPLOYED_COMMIT_NOT_ANCESTOR_OF_MAIN",
});
const changedSourceFiles = sourceChanges(deployedCommit, head);
if (!changedSourceFiles.length) {
  throw new Error("AVANTIQO_IMAGE_REFRESH_NO_IMAGE_SOURCE_CHANGE_SINCE_DEPLOYED_BUILD");
}

const expectedRunpodTag = head.slice(0, 9);
const releaseTag = `runpod-image-${head.slice(0, 12)}`;
const existingRelease = releaseExists(releaseTag);
if (existingRelease && text(existingRelease.targetCommitish) && text(existingRelease.targetCommitish) !== head) {
  throw new Error(
    `AVANTIQO_IMAGE_REFRESH_RELEASE_TARGET_MISMATCH:tag=${releaseTag}:target=${text(existingRelease.targetCommitish)}`,
  );
}

const plan = {
  success: true,
  contract: "AVANTIQO_IMAGE_RUNPOD_WORKER_REFRESH_V1",
  mode: apply ? "APPLY" : "PLAN",
  mutation_performed: false,
  main_commit: head,
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
  image_source_changes_since_deployed_build: changedSourceFiles,
  release: {
    tag: releaseTag,
    target_commit: head,
    already_exists: Boolean(existingRelease),
    expected_runpod_image_tag: expectedRunpodTag,
  },
  safety: {
    apply_required_for_release_creation: true,
    runpod_release_trigger_is_repository_level: true,
    other_runpod_github_integrated_endpoints_may_rebuild: true,
    automatic_rollback_allowed: false,
    generation_submitted: false,
    production_deploy_performed: false,
  },
  next_action: apply ? "WAIT_FOR_IMAGE_BUILD" : "RUN_WITH_APPLY_TO_TRIGGER_RUNPOD_GITHUB_BUILD",
};

if (!apply) {
  console.log("AVANTIQO_IMAGE_RUNPOD_REFRESH_PLAN=READY");
  console.log(JSON.stringify(plan, null, 2));
  process.exit(0);
}

// Re-fetch main immediately before the GitHub release write and refuse stale local state.
command("git", ["fetch", "origin", "main"], { errorCode: "GIT_FETCH_MAIN_BEFORE_RELEASE_FAILED" });
const headBeforeWrite = command("git", ["rev-parse", "HEAD"], {
  errorCode: "GIT_HEAD_BEFORE_RELEASE_FAILED",
});
const originMainBeforeWrite = command("git", ["rev-parse", "origin/main"], {
  errorCode: "GIT_ORIGIN_MAIN_BEFORE_RELEASE_FAILED",
});
if (headBeforeWrite !== head || originMainBeforeWrite !== head) {
  throw new Error(
    `AVANTIQO_IMAGE_REFRESH_MAIN_MOVED_BEFORE_RELEASE:planned=${head}:head=${headBeforeWrite}:origin_main=${originMainBeforeWrite}`,
  );
}

const endpointBeforeWrite = await inspectEndpoint(managementKey, endpointId);
if (text(endpointBeforeWrite.template?.imageName) !== deployedImage) {
  throw new Error("AVANTIQO_IMAGE_REFRESH_CONCURRENT_IMAGE_CHANGE_DETECTED");
}
if (!endpointVolumeIds(endpointBeforeWrite.endpoint).includes(text(suitableVolume?.id))) {
  throw new Error("AVANTIQO_IMAGE_REFRESH_CONCURRENT_VOLUME_CHANGE_DETECTED");
}

if (!existingRelease) {
  createRelease(releaseTag, head);
  console.log(`AVANTIQO_IMAGE_RUNPOD_REFRESH_RELEASE_CREATED=${releaseTag}`);
} else {
  console.log(`AVANTIQO_IMAGE_RUNPOD_REFRESH_RELEASE_REUSED=${releaseTag}`);
}

const deadline = Date.now() + Math.max(60_000, waitMs);
let lastImageName = deployedImage;
let verified = null;
while (Date.now() < deadline) {
  await sleep(Math.max(5_000, pollMs));
  const current = await inspectEndpoint(managementKey, endpointId);
  const currentImageName = text(current.template?.imageName);
  if (currentImageName) lastImageName = currentImageName;
  const currentTag = imageTag(currentImageName);
  if (currentImageName !== deployedImage) {
    if (currentTag !== expectedRunpodTag) {
      throw new Error(
        `AVANTIQO_IMAGE_REFRESH_UNEXPECTED_IMAGE_BUILD:expected_tag=${expectedRunpodTag}:actual_tag=${currentTag || "MISSING"}`,
      );
    }
    verified = current;
    break;
  }
  console.log(`AVANTIQO_IMAGE_RUNPOD_REFRESH_WAITING image_tag=${currentTag || "MISSING"}`);
}

if (!verified) {
  throw new Error(
    `AVANTIQO_IMAGE_REFRESH_TIMEOUT:old_image=${deployedImage}:last_image=${lastImageName}:release=${releaseTag}`,
  );
}

const afterEndpointImages = await inspectAllEndpointImages(managementKey);
const changed = changedEndpoints(beforeEndpointImages, afterEndpointImages);
console.log("AVANTIQO_IMAGE_RUNPOD_REFRESH=COMPLETE");
console.log(
  JSON.stringify(
    {
      ...plan,
      mode: "APPLY",
      mutation_performed: !existingRelease,
      release_created: !existingRelease,
      release_reused: Boolean(existingRelease),
      verified_endpoint: safeEndpoint(verified.endpoint),
      verified_template: safeTemplate(verified.template),
      runpod_endpoint_changes_observed: changed,
      image_worker_refreshed: true,
      next_action: "CACHE_QWEN_IMAGE_2512",
    },
    null,
    2,
  ),
);
