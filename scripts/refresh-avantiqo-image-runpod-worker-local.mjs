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

function resolveCommitLikeTag(commitLike, fetchOnMiss = false) {
  const tag = text(commitLike);
  if (!/^[0-9a-f]{7,40}$/i.test(tag)) return null;

  const resolve = () => {
    const result = commandResult("git", ["rev-parse", `${tag}^{commit}`]);
    return result.status === 0 ? text(result.stdout) : null;
  };

  let resolved = resolve();
  if (!resolved && fetchOnMiss) {
    command("git", ["fetch", "origin", "main"], {
      errorCode: "GIT_FETCH_MAIN_FOR_RUNPOD_TAG_FAILED",
    });
    resolved = resolve();
  }
  return resolved;
}

function resolveDeployedCommit(deployedTag) {
  const resolved = resolveCommitLikeTag(deployedTag, true);
  if (!resolved) {
    throw new Error(
      `AVANTIQO_IMAGE_REFRESH_DEPLOYED_COMMIT_NOT_IN_REPOSITORY:${text(deployedTag) || "MISSING"}`,
    );
  }
  return resolved;
}

function sourceChanges(leftCommit, rightCommit) {
  const result = command(
    "git",
    ["diff", "--name-only", `${leftCommit}..${rightCommit}`, "--", IMAGE_SOURCE_PATH],
    { errorCode: "AVANTIQO_IMAGE_REFRESH_SOURCE_DIFF_FAILED" },
  );
  return result
    .split("\n")
    .map((value) => value.trim())
    .filter(Boolean);
}

function sourceTreeMatches(leftCommit, rightCommit) {
  const result = commandResult(
    "git",
    ["diff", "--quiet", leftCommit, rightCommit, "--", IMAGE_SOURCE_PATH],
  );
  if (result.status === 0) return true;
  if (result.status === 1) return false;
  const detail = text(result.stderr || result.stdout).slice(0, 800);
  throw new Error(
    `AVANTIQO_IMAGE_REFRESH_SOURCE_COMPARE_FAILED:${detail || `exit=${result.status}`}`,
  );
}

function isAncestor(ancestorCommit, descendantCommit) {
  const result = commandResult(
    "git",
    ["merge-base", "--is-ancestor", ancestorCommit, descendantCommit],
  );
  if (result.status === 0) return true;
  if (result.status === 1) return false;
  const detail = text(result.stderr || result.stdout).slice(0, 800);
  throw new Error(
    `AVANTIQO_IMAGE_REFRESH_ANCESTRY_CHECK_FAILED:${detail || `exit=${result.status}`}`,
  );
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
if (!isAncestor(deployedCommit, head) && !isAncestor(head, deployedCommit)) {
  throw new Error("AVANTIQO_IMAGE_REFRESH_DEPLOYED_COMMIT_DIVERGES_FROM_MAIN");
}
const changedSourceFiles = sourceChanges(deployedCommit, head);
const expectedRunpodTag = head.slice(0, 9);
const releaseTag = `runpod-image-${head.slice(0, 12)}`;
const existingRelease = releaseExists(releaseTag);
if (existingRelease && text(existingRelease.targetCommitish) && text(existingRelease.targetCommitish) !== head) {
  throw new Error(
    `AVANTIQO_IMAGE_REFRESH_RELEASE_TARGET_MISMATCH:tag=${releaseTag}:target=${text(existingRelease.targetCommitish)}`,
  );
}

const basePlan = {
  success: true,
  contract: "AVANTIQO_IMAGE_RUNPOD_WORKER_REFRESH_V2",
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
    acceptance_rule: "IMAGE_SOURCE_TREE_EQUALS_PLANNED_MAIN",
  },
  safety: {
    apply_required_for_release_creation: true,
    runpod_release_trigger_is_repository_level: true,
    intermediate_ancestor_builds_are_observed_not_accepted: true,
    newer_different_image_source_requires_replan: true,
    automatic_rollback_allowed: false,
    generation_submitted: false,
    production_deploy_performed: false,
  },
};

if (sourceTreeMatches(deployedCommit, head)) {
  console.log("AVANTIQO_IMAGE_RUNPOD_REFRESH_ALREADY_CURRENT=true");
  console.log("AVANTIQO_IMAGE_RUNPOD_REFRESH=COMPLETE");
  console.log(
    JSON.stringify(
      {
        ...basePlan,
        mode: apply ? "APPLY" : "PLAN",
        current_image_source_matches_main: true,
        image_worker_refreshed: true,
        refresh_action: "ALREADY_CURRENT",
        next_action: "CACHE_QWEN_IMAGE_2512",
      },
      null,
      2,
    ),
  );
  process.exit(0);
}

const plan = {
  ...basePlan,
  current_image_source_matches_main: false,
  next_action: apply ? "WAIT_FOR_IMAGE_SOURCE_EQUIVALENT_BUILD" : "RUN_WITH_APPLY_TO_TRIGGER_OR_RESUME_RUNPOD_GITHUB_BUILD",
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
const endpointBeforeWriteTag = imageTag(endpointBeforeWrite.template?.imageName);
const endpointBeforeWriteCommit = resolveDeployedCommit(endpointBeforeWriteTag);
if (sourceTreeMatches(endpointBeforeWriteCommit, head)) {
  console.log("AVANTIQO_IMAGE_RUNPOD_REFRESH_BECAME_CURRENT_BEFORE_RELEASE=true");
  console.log("AVANTIQO_IMAGE_RUNPOD_REFRESH=COMPLETE");
  console.log(
    JSON.stringify(
      {
        ...plan,
        mutation_performed: false,
        image_worker_refreshed: true,
        refresh_action: "BECAME_CURRENT_BEFORE_RELEASE",
        verified_endpoint: safeEndpoint(endpointBeforeWrite.endpoint),
        verified_template: safeTemplate(endpointBeforeWrite.template),
        verified_commit: endpointBeforeWriteCommit,
        next_action: "CACHE_QWEN_IMAGE_2512",
      },
      null,
      2,
    ),
  );
  process.exit(0);
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
let lastImageName = text(endpointBeforeWrite.template?.imageName) || deployedImage;
let verified = null;
let verifiedCommit = null;
let verifiedReason = null;
const intermediateBuilds = [];
while (Date.now() < deadline) {
  await sleep(Math.max(5_000, pollMs));
  const current = await inspectEndpoint(managementKey, endpointId);
  const currentImageName = text(current.template?.imageName);
  const currentTag = imageTag(currentImageName);

  if (!currentImageName || currentImageName === lastImageName) {
    console.log(`AVANTIQO_IMAGE_RUNPOD_REFRESH_WAITING image_tag=${currentTag || "MISSING"}`);
    continue;
  }

  lastImageName = currentImageName;
  const currentCommit = resolveCommitLikeTag(currentTag, true);
  if (!currentCommit) {
    intermediateBuilds.push({
      image_tag: currentTag || null,
      commit: null,
      classification: "UNKNOWN_COMMIT_TAG",
    });
    console.log(
      `AVANTIQO_IMAGE_RUNPOD_REFRESH_INTERMEDIATE image_tag=${currentTag || "MISSING"} classification=UNKNOWN_COMMIT_TAG`,
    );
    continue;
  }

  if (sourceTreeMatches(currentCommit, head)) {
    verified = current;
    verifiedCommit = currentCommit;
    verifiedReason = currentCommit === head ? "EXACT_PLANNED_COMMIT" : "IMAGE_SOURCE_EQUIVALENT_COMMIT";
    break;
  }

  if (isAncestor(currentCommit, head)) {
    const remainingSourceChanges = sourceChanges(currentCommit, head);
    intermediateBuilds.push({
      image_tag: currentTag,
      commit: currentCommit,
      classification: "OLDER_ANCESTOR_IMAGE_SOURCE",
      remaining_image_source_changes: remainingSourceChanges,
    });
    console.log(
      `AVANTIQO_IMAGE_RUNPOD_REFRESH_INTERMEDIATE image_tag=${currentTag} classification=OLDER_ANCESTOR_IMAGE_SOURCE remaining_changes=${remainingSourceChanges.length}`,
    );
    continue;
  }

  if (isAncestor(head, currentCommit)) {
    throw new Error(
      `AVANTIQO_IMAGE_REFRESH_NEWER_DIFFERENT_IMAGE_SOURCE_REPLAN_REQUIRED:planned=${head}:actual=${currentCommit}`,
    );
  }

  throw new Error(
    `AVANTIQO_IMAGE_REFRESH_DIVERGENT_BUILD_REJECTED:planned=${head}:actual=${currentCommit}`,
  );
}

if (!verified) {
  throw new Error(
    `AVANTIQO_IMAGE_REFRESH_TIMEOUT:initial_image=${deployedImage}:last_image=${lastImageName}:release=${releaseTag}:intermediate_builds=${intermediateBuilds.length}`,
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
      verified_commit: verifiedCommit,
      verification_reason: verifiedReason,
      intermediate_builds: intermediateBuilds,
      runpod_endpoint_changes_observed: changed,
      image_worker_refreshed: true,
      next_action: "CACHE_QWEN_IMAGE_2512",
    },
    null,
    2,
  ),
);
