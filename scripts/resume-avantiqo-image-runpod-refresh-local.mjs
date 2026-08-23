import { spawnSync } from "node:child_process";

const REST_BASE = "https://rest.runpod.io/v1";
const IMAGE_ENDPOINT_NAME = "avantiqo-image-v1";
const IMAGE_SOURCE_PATH = "services/avantiqo-image-engine";
const MIN_NETWORK_VOLUME_GB = 64;
const DEFAULT_WAIT_MS = 60 * 60 * 1000;
const DEFAULT_POLL_MS = 20_000;
const REST_RETRY_ATTEMPTS = 6;
const REST_RETRY_BASE_MS = 2_000;
const RETRYABLE_HTTP = new Set([408, 425, 429, 500, 502, 503, 504]);

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

function commandResult(commandName, args) {
  return spawnSync(commandName, args, {
    cwd: process.cwd(),
    encoding: "utf8",
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function command(commandName, args, errorCode) {
  const result = commandResult(commandName, args);
  if (result.status !== 0) {
    const detail = text(result.stderr || result.stdout).slice(0, 1200);
    throw new Error(`${errorCode}:${detail || `exit=${result.status}`}`);
  }
  return text(result.stdout);
}

function imageTag(imageName) {
  const value = text(imageName);
  if (!value) return null;
  const slash = value.lastIndexOf("/");
  const colon = value.lastIndexOf(":");
  if (colon <= slash) return null;
  return value.slice(colon + 1);
}

function endpointVolumeIds(endpoint = {}) {
  return [
    text(endpoint.networkVolumeId),
    ...(Array.isArray(endpoint.networkVolumeIds) ? endpoint.networkVolumeIds.map(text) : []),
  ].filter(Boolean);
}

function resolveCommitLikeTag(commitLike) {
  const tag = text(commitLike);
  if (!/^[0-9a-f]{7,40}$/i.test(tag)) return null;
  let result = commandResult("git", ["rev-parse", `${tag}^{commit}`]);
  if (result.status === 0) return text(result.stdout);
  command("git", ["fetch", "origin", "main"], "GIT_FETCH_MAIN_FOR_RUNPOD_TAG_FAILED");
  result = commandResult("git", ["rev-parse", `${tag}^{commit}`]);
  return result.status === 0 ? text(result.stdout) : null;
}

function sourceTreeId(commit) {
  return command(
    "git",
    ["rev-parse", `${commit}:${IMAGE_SOURCE_PATH}`],
    "AVANTIQO_IMAGE_SOURCE_TREE_READ_FAILED",
  );
}

function sourceTreeMatches(leftCommit, rightCommit) {
  return sourceTreeId(leftCommit) === sourceTreeId(rightCommit);
}

function sourceChanges(leftCommit, rightCommit) {
  const result = command(
    "git",
    ["diff", "--name-only", `${leftCommit}..${rightCommit}`, "--", IMAGE_SOURCE_PATH],
    "AVANTIQO_IMAGE_SOURCE_DIFF_FAILED",
  );
  return result
    .split("\n")
    .map((value) => value.trim())
    .filter(Boolean);
}

function isRetryableFetchError(error) {
  const code = text(error?.cause?.code || error?.code);
  const name = text(error?.name);
  return (
    name === "TimeoutError" ||
    name === "AbortError" ||
    code === "UND_ERR_CONNECT_TIMEOUT" ||
    code === "UND_ERR_HEADERS_TIMEOUT" ||
    code === "UND_ERR_SOCKET" ||
    code === "ECONNRESET" ||
    code === "ETIMEDOUT" ||
    code === "EAI_AGAIN"
  );
}

async function restRequest(path, credential) {
  let lastError = null;
  for (let attempt = 1; attempt <= REST_RETRY_ATTEMPTS; attempt += 1) {
    try {
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
      if (response.ok) return body;

      const detail = text(body?.message || body?.error || body?.detail || raw).slice(0, 1000);
      const error = new Error(`RUNPOD_HTTP_${response.status}:${detail || "EMPTY_BODY"}`);
      if (!RETRYABLE_HTTP.has(response.status) || attempt === REST_RETRY_ATTEMPTS) {
        throw error;
      }
      lastError = error;
    } catch (error) {
      if (
        !isRetryableFetchError(error) &&
        !/^RUNPOD_HTTP_(408|425|429|500|502|503|504):/.test(text(error?.message))
      ) {
        throw error;
      }
      lastError = error;
      if (attempt === REST_RETRY_ATTEMPTS) break;
    }

    const delayMs = REST_RETRY_BASE_MS * attempt;
    console.log(
      `AVANTIQO_IMAGE_RUNPOD_RESUME_TRANSIENT_RETRY attempt=${attempt}/${REST_RETRY_ATTEMPTS} delay_ms=${delayMs} reason=${text(lastError?.cause?.code || lastError?.message || lastError?.name).slice(0, 180)}`,
    );
    await sleep(delayMs);
  }
  throw new Error(
    `AVANTIQO_IMAGE_RUNPOD_RESUME_RETRIES_EXHAUSTED:${text(lastError?.cause?.code || lastError?.message || lastError).slice(0, 500)}`,
  );
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

function validateLocalMain() {
  command("git", ["fetch", "origin", "main"], "GIT_FETCH_MAIN_FAILED");
  const branch = command("git", ["branch", "--show-current"], "GIT_BRANCH_READ_FAILED");
  if (branch !== "main") {
    throw new Error(`AVANTIQO_IMAGE_RESUME_MAIN_REQUIRED:actual=${branch || "DETACHED"}`);
  }
  const head = command("git", ["rev-parse", "HEAD"], "GIT_HEAD_READ_FAILED");
  const originMain = command("git", ["rev-parse", "origin/main"], "GIT_ORIGIN_MAIN_READ_FAILED");
  if (head !== originMain) {
    throw new Error(
      `AVANTIQO_IMAGE_RESUME_LOCAL_MAIN_NOT_CURRENT:head=${head}:origin_main=${originMain}:run_git_pull_ff_only_first`,
    );
  }
  const sourceStatus = command(
    "git",
    ["status", "--porcelain", "--untracked-files=no", "--", IMAGE_SOURCE_PATH],
    "GIT_IMAGE_SOURCE_STATUS_FAILED",
  );
  if (sourceStatus) throw new Error("AVANTIQO_IMAGE_RESUME_IMAGE_SOURCE_HAS_LOCAL_CHANGES");
  return {
    head,
    imageTree: sourceTreeId(head),
  };
}

function assertMainImageSourceStillMatches(plannedImageTree) {
  command("git", ["fetch", "origin", "main"], "GIT_FETCH_MAIN_DURING_RESUME_FAILED");
  const originMain = command("git", ["rev-parse", "origin/main"], "GIT_ORIGIN_MAIN_DURING_RESUME_FAILED");
  const originImageTree = sourceTreeId(originMain);
  if (originImageTree !== plannedImageTree) {
    throw new Error(
      `AVANTIQO_IMAGE_RESUME_IMAGE_SOURCE_MOVED_REPLAN_REQUIRED:origin_main=${originMain}`,
    );
  }
  return originMain;
}

const managementKey = required("RUNPOD_MANAGEMENT_API_KEY");
const endpointId = required("RUNPOD_AVANTIQO_IMAGE_ENDPOINT_ID");
const waitMs = Math.max(
  60_000,
  finite(process.env.AVANTIQO_IMAGE_RUNPOD_REFRESH_WAIT_MS, DEFAULT_WAIT_MS),
);
const pollMs = Math.max(
  5_000,
  finite(process.env.AVANTIQO_IMAGE_RUNPOD_REFRESH_POLL_MS, DEFAULT_POLL_MS),
);

console.log("AVANTIQO_IMAGE_RUNPOD_RESUME_MODE=READ_ONLY");
console.log("AVANTIQO_IMAGE_RUNPOD_RESUME_RELEASE_CREATED=false");
console.log("AVANTIQO_IMAGE_RUNPOD_RESUME_ENDPOINT_MUTATION=false");
console.log("AVANTIQO_IMAGE_RUNPOD_RESUME_GENERATION_SUBMITTED=false");
console.log("AVANTIQO_IMAGE_RUNPOD_RESUME_PRODUCTION_DEPLOY_PERFORMED=false");
console.log("AVANTIQO_IMAGE_RUNPOD_RESUME_SECRETS_PRINTED=false");

const planned = validateLocalMain();
const initial = await inspectEndpoint(managementKey, endpointId);
const attachedVolumeIds = endpointVolumeIds(initial.endpoint);
if (!attachedVolumeIds.length) throw new Error("AVANTIQO_IMAGE_RESUME_NETWORK_VOLUME_REQUIRED");

const attachedVolumes = await Promise.all(
  attachedVolumeIds.map((volumeId) =>
    restRequest(`/networkvolumes/${encodeURIComponent(volumeId)}`, managementKey),
  ),
);
const suitableVolume = attachedVolumes.find(
  (volume) => finite(volume?.size, 0) >= MIN_NETWORK_VOLUME_GB,
);
if (!suitableVolume) {
  throw new Error(`AVANTIQO_IMAGE_RESUME_NETWORK_VOLUME_TOO_SMALL:min_gb=${MIN_NETWORK_VOLUME_GB}`);
}

const classify = (inspection) => {
  const imageName = text(inspection.template?.imageName);
  const tag = imageTag(imageName);
  const commit = resolveCommitLikeTag(tag);
  if (!commit) {
    return {
      complete: false,
      imageName,
      tag,
      commit: null,
      classification: "UNKNOWN_COMMIT_TAG",
      remainingChanges: null,
    };
  }
  if (sourceTreeMatches(commit, planned.head)) {
    return {
      complete: true,
      imageName,
      tag,
      commit,
      classification: commit === planned.head ? "EXACT_PLANNED_COMMIT" : "IMAGE_SOURCE_EQUIVALENT_COMMIT",
      remainingChanges: [],
    };
  }
  return {
    complete: false,
    imageName,
    tag,
    commit,
    classification: "IMAGE_SOURCE_NOT_CURRENT",
    remainingChanges: sourceChanges(commit, planned.head),
  };
};

let state = classify(initial);
console.log(
  `AVANTIQO_IMAGE_RUNPOD_RESUME_CURRENT image_tag=${state.tag || "MISSING"} classification=${state.classification} remaining_changes=${state.remainingChanges?.length ?? "UNKNOWN"}`,
);

if (state.complete) {
  console.log("AVANTIQO_IMAGE_RUNPOD_RESUME=COMPLETE");
  console.log(
    JSON.stringify(
      {
        success: true,
        contract: "AVANTIQO_IMAGE_RUNPOD_REFRESH_RESUME_V1",
        read_only: true,
        planned_main_commit: planned.head,
        planned_image_source_tree: planned.imageTree,
        verified_commit: state.commit,
        verified_image_tag: state.tag,
        verification_reason: state.classification,
        network_volume: {
          id: text(suitableVolume?.id) || null,
          name: text(suitableVolume?.name) || null,
          size_gb: finite(suitableVolume?.size),
          data_center_id: text(suitableVolume?.dataCenterId) || null,
        },
        release_created: false,
        endpoint_mutation_performed: false,
        generation_submitted: false,
        production_deploy_performed: false,
        image_worker_refreshed: true,
        next_action: "CACHE_QWEN_IMAGE_2512",
      },
      null,
      2,
    ),
  );
  process.exit(0);
}

const deadline = Date.now() + waitMs;
let lastTag = state.tag;
let pollCount = 0;
while (Date.now() < deadline) {
  await sleep(pollMs);
  pollCount += 1;

  if (pollCount % 15 === 0) {
    const latestMain = assertMainImageSourceStillMatches(planned.imageTree);
    console.log(`AVANTIQO_IMAGE_RUNPOD_RESUME_MAIN_CHECK=UNCHANGED_IMAGE_SOURCE origin_main=${latestMain.slice(0, 12)}`);
  }

  const current = await inspectEndpoint(managementKey, endpointId);
  state = classify(current);
  if (state.complete) {
    console.log("AVANTIQO_IMAGE_RUNPOD_RESUME=COMPLETE");
    console.log(
      JSON.stringify(
        {
          success: true,
          contract: "AVANTIQO_IMAGE_RUNPOD_REFRESH_RESUME_V1",
          read_only: true,
          planned_main_commit: planned.head,
          planned_image_source_tree: planned.imageTree,
          verified_commit: state.commit,
          verified_image_tag: state.tag,
          verification_reason: state.classification,
          network_volume: {
            id: text(suitableVolume?.id) || null,
            name: text(suitableVolume?.name) || null,
            size_gb: finite(suitableVolume?.size),
            data_center_id: text(suitableVolume?.dataCenterId) || null,
          },
          release_created: false,
          endpoint_mutation_performed: false,
          generation_submitted: false,
          production_deploy_performed: false,
          image_worker_refreshed: true,
          next_action: "CACHE_QWEN_IMAGE_2512",
        },
        null,
        2,
      ),
    );
    process.exit(0);
  }

  if (state.tag !== lastTag) {
    console.log(
      `AVANTIQO_IMAGE_RUNPOD_RESUME_INTERMEDIATE image_tag=${state.tag || "MISSING"} classification=${state.classification} remaining_changes=${state.remainingChanges?.length ?? "UNKNOWN"}`,
    );
    lastTag = state.tag;
  } else {
    console.log(
      `AVANTIQO_IMAGE_RUNPOD_RESUME_WAITING image_tag=${state.tag || "MISSING"} remaining_changes=${state.remainingChanges?.length ?? "UNKNOWN"}`,
    );
  }
}

throw new Error(
  `AVANTIQO_IMAGE_RUNPOD_RESUME_TIMEOUT:last_image_tag=${state.tag || "MISSING"}:remaining_changes=${state.remainingChanges?.length ?? "UNKNOWN"}`,
);
