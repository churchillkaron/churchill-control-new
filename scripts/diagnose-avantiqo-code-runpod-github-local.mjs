import { spawnSync } from "node:child_process";

const GRAPHQL_URL = "https://api.runpod.io/graphql";
const CODE_ENDPOINT_NAME = "avantiqo-code-v1";
const EXPECTED_REPO = "churchill-control-new";
const EXPECTED_BRANCH = "main";
const EXPECTED_DOCKERFILE = "services/avantiqo-code-engine/Dockerfile.runpod";
const RELEASE_PREFIX = "runpod-code-";

function text(value) {
  return String(value ?? "").trim();
}

function required(name, fallback = null) {
  const value = text(process.env[name] || fallback);
  if (!value) throw new Error(`${name}_REQUIRED`);
  return value;
}

function commandResult(commandName, args) {
  return spawnSync(commandName, args, {
    cwd: process.cwd(),
    encoding: "utf8",
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function parseJsonResult(result, errorCode) {
  if (result.status !== 0) {
    const detail = text(result.stderr || result.stdout).slice(0, 1200);
    throw new Error(`${errorCode}:${detail || `exit=${result.status}`}`);
  }
  try {
    return JSON.parse(result.stdout);
  } catch {
    throw new Error(`${errorCode}_INVALID_JSON`);
  }
}

function latestCodeRelease() {
  const list = parseJsonResult(
    commandResult("gh", [
      "release",
      "list",
      "--limit",
      "100",
      "--json",
      "tagName,publishedAt,isDraft,isPrerelease",
    ]),
    "AVANTIQO_CODE_GITHUB_RELEASE_LIST_FAILED",
  );
  const release = list
    .filter((entry) => text(entry?.tagName).startsWith(RELEASE_PREFIX))
    .filter((entry) => entry?.isDraft !== true && entry?.isPrerelease !== true)
    .sort((a, b) => Date.parse(b?.publishedAt || 0) - Date.parse(a?.publishedAt || 0))[0];
  if (!release?.tagName) throw new Error("AVANTIQO_CODE_GITHUB_RELEASE_REQUIRED");
  return parseJsonResult(
    commandResult("gh", [
      "release",
      "view",
      release.tagName,
      "--json",
      "tagName,targetCommitish,isDraft,isPrerelease,publishedAt",
    ]),
    "AVANTIQO_CODE_GITHUB_RELEASE_VIEW_FAILED",
  );
}

async function runpodGraphql(apiKey) {
  const query = `
    query AvantiqoCodeRunpodGithubDiagnostic {
      myself {
        githubAccountInfo {
          username
        }
        endpoints {
          id
          name
          version
          templateId
          activeBuildid
          repo {
            repoName
            repoId
            branch
            dockerFilePath
            buildContext
          }
          builds {
            id
            commitHash
            commitMessage
            branch
            commitDate
            state
            startedAt
            completedAt
            error
            repoId
            imageName
          }
        }
      }
    }
  `;
  const response = await fetch(GRAPHQL_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query }),
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
    throw new Error(`RUNPOD_GRAPHQL_HTTP_${response.status}:${text(raw).slice(0, 1000)}`);
  }
  if (Array.isArray(body?.errors) && body.errors.length) {
    const detail = body.errors.map((entry) => text(entry?.message)).filter(Boolean).join(" | ");
    throw new Error(`RUNPOD_GRAPHQL_ERROR:${detail.slice(0, 1500)}`);
  }
  return body?.data?.myself || null;
}

function buildTime(build = {}) {
  return Math.max(
    Date.parse(build.completedAt || 0) || 0,
    Date.parse(build.startedAt || 0) || 0,
    Date.parse(build.commitDate || 0) || 0,
  );
}

function safeBuild(build = {}, activeBuildId = null) {
  return {
    id: text(build.id) || null,
    active: text(build.id) === text(activeBuildId),
    state: text(build.state) || null,
    commit_hash: text(build.commitHash) || null,
    commit_message: text(build.commitMessage) || null,
    branch: text(build.branch) || null,
    commit_date: build.commitDate || null,
    started_at: build.startedAt || null,
    completed_at: build.completedAt || null,
    error: text(build.error) || null,
    image_name: text(build.imageName) || null,
    repo_id: text(build.repoId) || null,
  };
}

function commitMatches(buildCommit, expectedCommit) {
  const build = text(buildCommit).toLowerCase();
  const expected = text(expectedCommit).toLowerCase();
  if (!build || !expected) return false;
  return build === expected || build.startsWith(expected) || expected.startsWith(build);
}

function repoNameMatches(value) {
  const repo = text(value).toLowerCase();
  return repo === EXPECTED_REPO || repo.endsWith(`/${EXPECTED_REPO}`);
}

function classify({ githubAccount, endpoint, release, targetBuild }) {
  if (!githubAccount?.username) {
    return {
      diagnosis: "RUNPOD_GITHUB_ACCOUNT_CONNECTION_MISSING",
      next_action: "RECONNECT_RUNPOD_GITHUB_ACCOUNT",
    };
  }
  if (!endpoint?.repo) {
    return {
      diagnosis: "RUNPOD_CODE_ENDPOINT_REPOSITORY_BINDING_MISSING",
      next_action: "REBIND_CODE_ENDPOINT_GITHUB_REPOSITORY",
    };
  }
  if (!repoNameMatches(endpoint.repo.repoName)) {
    return {
      diagnosis: "RUNPOD_CODE_ENDPOINT_WRONG_REPOSITORY",
      next_action: "REBIND_CODE_ENDPOINT_GITHUB_REPOSITORY",
    };
  }
  if (text(endpoint.repo.branch) !== EXPECTED_BRANCH) {
    return {
      diagnosis: "RUNPOD_CODE_ENDPOINT_WRONG_BRANCH",
      next_action: "CORRECT_CODE_ENDPOINT_GITHUB_BRANCH",
    };
  }
  if (text(endpoint.repo.dockerFilePath) !== EXPECTED_DOCKERFILE) {
    return {
      diagnosis: "RUNPOD_CODE_ENDPOINT_WRONG_DOCKERFILE",
      next_action: "CORRECT_CODE_ENDPOINT_GITHUB_DOCKERFILE",
    };
  }
  if (!targetBuild) {
    return {
      diagnosis: "RUNPOD_GITHUB_RELEASE_NOT_INGESTED",
      next_action: "REPAIR_RUNPOD_GITHUB_REPOSITORY_ACCESS_OR_RELEASE_DELIVERY",
    };
  }
  if (["FAILED", "TEST_FAILED", "CANCELLED"].includes(text(targetBuild.state))) {
    return {
      diagnosis: `RUNPOD_CODE_BUILD_${text(targetBuild.state)}`,
      next_action: "FIX_RUNPOD_CODE_BUILD_FAILURE",
    };
  }
  if (["PENDING", "BUILDING", "UPLOADING", "TESTING"].includes(text(targetBuild.state))) {
    return {
      diagnosis: `RUNPOD_CODE_BUILD_${text(targetBuild.state)}`,
      next_action: "WAIT_FOR_EXISTING_RUNPOD_CODE_BUILD",
    };
  }
  if (text(targetBuild.state) === "COMPLETED" && text(endpoint.activeBuildid) !== text(targetBuild.id)) {
    return {
      diagnosis: "RUNPOD_CODE_BUILD_COMPLETED_NOT_ACTIVE",
      next_action: "INSPECT_RUNPOD_BUILD_ACTIVATION",
    };
  }
  if (text(targetBuild.state) === "COMPLETED" && text(endpoint.activeBuildid) === text(targetBuild.id)) {
    return {
      diagnosis: "RUNPOD_CODE_BUILD_ACTIVE",
      next_action: "VERIFY_CODE_ENDPOINT_IMAGE_THEN_CACHE_FP8_MODEL",
    };
  }
  return {
    diagnosis: `RUNPOD_CODE_BUILD_STATE_UNKNOWN:${text(targetBuild.state) || "MISSING"}`,
    next_action: "INSPECT_RUNPOD_CODE_BUILD_STATE",
  };
}

const endpointId = required("RUNPOD_AVANTIQO_CODE_ENDPOINT_ID");
const apiKey = required(
  "RUNPOD_MANAGEMENT_API_KEY",
  process.env.RUNPOD_API_KEY,
);

console.log("AVANTIQO_CODE_RUNPOD_GITHUB_DIAGNOSTIC_MODE=READ_ONLY");
console.log("AVANTIQO_CODE_RUNPOD_GITHUB_DIAGNOSTIC_MUTATION_PERFORMED=false");
console.log("AVANTIQO_CODE_RUNPOD_GITHUB_DIAGNOSTIC_GENERATION_SUBMITTED=false");
console.log("AVANTIQO_CODE_RUNPOD_GITHUB_DIAGNOSTIC_PRODUCTION_DEPLOY_PERFORMED=false");
console.log("AVANTIQO_CODE_RUNPOD_GITHUB_DIAGNOSTIC_SECRETS_PRINTED=false");

const [release, runpod] = await Promise.all([
  Promise.resolve().then(latestCodeRelease),
  runpodGraphql(apiKey),
]);

const endpoints = Array.isArray(runpod?.endpoints) ? runpod.endpoints : [];
const endpoint = endpoints.find((entry) => text(entry?.id) === endpointId);
if (!endpoint) throw new Error(`AVANTIQO_CODE_RUNPOD_ENDPOINT_NOT_FOUND:${endpointId}`);
if (text(endpoint.name) !== CODE_ENDPOINT_NAME) {
  throw new Error(`AVANTIQO_CODE_RUNPOD_ENDPOINT_NAME_MISMATCH:${text(endpoint.name) || "MISSING"}`);
}

const builds = (Array.isArray(endpoint.builds) ? endpoint.builds : [])
  .slice()
  .sort((a, b) => buildTime(b) - buildTime(a));
const targetCommit = text(release.targetCommitish);
const targetBuild = builds.find((build) => commitMatches(build.commitHash, targetCommit)) || null;
const classification = classify({
  githubAccount: runpod.githubAccountInfo,
  endpoint,
  release,
  targetBuild,
});

const result = {
  success: classification.diagnosis === "RUNPOD_CODE_BUILD_ACTIVE",
  contract: "AVANTIQO_CODE_RUNPOD_GITHUB_DIAGNOSTIC_V1",
  mutation_performed: false,
  generation_submitted: false,
  production_deploy_performed: false,
  github_release: {
    tag: text(release.tagName) || null,
    target_commit: targetCommit || null,
    published_at: release.publishedAt || null,
    draft: release.isDraft === true,
    prerelease: release.isPrerelease === true,
  },
  runpod_github_connection: {
    connected: Boolean(runpod?.githubAccountInfo?.username),
    username: text(runpod?.githubAccountInfo?.username) || null,
  },
  endpoint: {
    id: text(endpoint.id) || null,
    name: text(endpoint.name) || null,
    version: Number.isFinite(Number(endpoint.version)) ? Number(endpoint.version) : null,
    template_id: text(endpoint.templateId) || null,
    active_build_id: text(endpoint.activeBuildid) || null,
  },
  repository_binding: endpoint.repo
    ? {
        repo_name: text(endpoint.repo.repoName) || null,
        repo_id: text(endpoint.repo.repoId) || null,
        branch: text(endpoint.repo.branch) || null,
        dockerfile_path: text(endpoint.repo.dockerFilePath) || null,
        build_context: text(endpoint.repo.buildContext) || null,
        expected_repo: EXPECTED_REPO,
        expected_branch: EXPECTED_BRANCH,
        expected_dockerfile_path: EXPECTED_DOCKERFILE,
      }
    : null,
  target_build: targetBuild ? safeBuild(targetBuild, endpoint.activeBuildid) : null,
  recent_builds: builds.slice(0, 12).map((build) => safeBuild(build, endpoint.activeBuildid)),
  diagnosis: classification.diagnosis,
  next_action: classification.next_action,
};

console.log(JSON.stringify(result, null, 2));
if (!result.success) process.exitCode = 2;
