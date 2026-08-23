import { verifyCodeMissionStateAttestation } from "./CodeMissionAttestationRuntime.js";

const CONTRACT = "AVANTIQO_CODE_GITHUB_COMMIT_V1";
const MISSION_CONTRACT = "AVANTIQO_CODE_AI_MISSION_V1";
const GITHUB_API = "https://api.github.com";
const VERCEL_CONNECT_API = "https://api.vercel.com/v1/connect/token";
const API_VERSION = "2026-03-10";
const MAX_FILES = 30;
const MAX_TOTAL_BYTES = 1024 * 1024;
const RECOVERY_HISTORY_LIMIT = 50;
const RECOVERY_NOT_FOUND = "CODE_AI_GITHUB_RECOVERY_VERIFIED_COMMIT_NOT_FOUND";

function text(value) {
  return String(value ?? "").trim();
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function recoveryNotFoundError({ expectedBase, currentMainHead }) {
  const error = new Error(RECOVERY_NOT_FOUND);
  error.expected_base_commit = text(expectedBase) || null;
  error.current_main_head = text(currentMainHead) || null;
  error.main_advanced_from_expected_base = Boolean(
    error.expected_base_commit &&
    error.current_main_head &&
    error.expected_base_commit !== error.current_main_head,
  );
  error.recovery_history_limit = RECOVERY_HISTORY_LIMIT;
  return error;
}

function parseRepository(value) {
  const repositoryUrl = text(value).replace(/\.git$/i, "");
  const match = repositoryUrl.match(/^https:\/\/github\.com\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)$/i);
  if (!match) throw new Error("CODE_AI_GITHUB_REPOSITORY_URL_INVALID");
  return {
    owner: match[1],
    repo: match[2],
    full_name: `${match[1]}/${match[2]}`,
    url: repositoryUrl,
  };
}

function configuredRepositories(env) {
  return new Set(
    text(env.AVANTIQO_CODE_GITHUB_REPOSITORIES)
      .split(",")
      .map((item) => item.trim().toLowerCase())
      .filter(Boolean),
  );
}

function assertRepositoryAllowed(repository, env) {
  const allowed = configuredRepositories(env);
  if (!allowed.size) throw new Error("AVANTIQO_CODE_GITHUB_REPOSITORIES_REQUIRED");
  if (!allowed.has(repository.full_name.toLowerCase())) {
    throw new Error("CODE_AI_GITHUB_REPOSITORY_NOT_ALLOWED");
  }
}

function normalizedChanges(state) {
  const changes = list(state?.source_changes).map((change) => ({
    path: text(change?.path).replaceAll("\\", "/"),
    content: String(change?.content ?? ""),
  }));
  if (!changes.length) throw new Error("CODE_AI_GITHUB_SOURCE_CHANGES_REQUIRED");
  if (changes.length > MAX_FILES) throw new Error("CODE_AI_GITHUB_FILE_LIMIT_EXCEEDED");
  const paths = new Set();
  let totalBytes = 0;
  for (const change of changes) {
    if (!change.path || change.path.startsWith("/") || change.path.startsWith("../") || change.path.includes("/../")) {
      throw new Error("CODE_AI_GITHUB_SOURCE_PATH_INVALID");
    }
    if (change.path === ".git" || change.path.startsWith(".git/") || /^\.env(?:\.|$)/i.test(change.path)) {
      throw new Error("CODE_AI_GITHUB_PROTECTED_PATH_BLOCKED");
    }
    if (paths.has(change.path)) throw new Error("CODE_AI_GITHUB_DUPLICATE_SOURCE_PATH");
    paths.add(change.path);
    totalBytes += Buffer.byteLength(change.content, "utf8");
  }
  if (totalBytes > MAX_TOTAL_BYTES) throw new Error("CODE_AI_GITHUB_CHANGESET_TOO_LARGE");
  return { changes, totalBytes };
}

function assertMissionReady(state, repository) {
  if (text(state?.contract) !== MISSION_CONTRACT) throw new Error("CODE_AI_GITHUB_MISSION_CONTRACT_INVALID");
  if (text(state?.status) !== "completed") throw new Error("CODE_AI_GITHUB_MISSION_NOT_COMPLETED");
  if (list(state?.blockers).length) throw new Error("CODE_AI_GITHUB_MISSION_HAS_BLOCKERS");
  if (!text(state?.base_commit)) throw new Error("CODE_AI_GITHUB_BASE_COMMIT_REQUIRED");
  if (text(state?.ref) !== "main") throw new Error("CODE_AI_GITHUB_MAIN_ONLY");
  if (parseRepository(state?.repository_url).full_name.toLowerCase() !== repository.full_name.toLowerCase()) {
    throw new Error("CODE_AI_GITHUB_MISSION_REPOSITORY_MISMATCH");
  }
  if (!list(state?.verification).some((item) => item?.passed === true)) {
    throw new Error("CODE_AI_GITHUB_VERIFICATION_REQUIRED");
  }
}

async function jsonResponse(response, errorPrefix) {
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = text(body?.message || body?.error || body?.documentation_url);
    const error = new Error(`${errorPrefix}:${response.status}${detail ? `:${detail}` : ""}`);
    error.status = response.status;
    throw error;
  }
  return body;
}

async function connectGitHubToken({ env, fetchImpl }) {
  const connector = text(env.AVANTIQO_CODE_GITHUB_CONNECTOR);
  const oidcToken = text(env.VERCEL_OIDC_TOKEN);
  if (!connector) throw new Error("AVANTIQO_CODE_GITHUB_CONNECTOR_REQUIRED");
  if (!oidcToken) throw new Error("VERCEL_OIDC_TOKEN_REQUIRED");
  const response = await fetchImpl(`${VERCEL_CONNECT_API}/${encodeURIComponent(connector)}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${oidcToken}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({ subject: { type: "app" } }),
  });
  const body = await jsonResponse(response, "CODE_AI_GITHUB_CONNECT_TOKEN_FAILED");
  const token = text(body?.token);
  if (!token) throw new Error("CODE_AI_GITHUB_CONNECT_TOKEN_MISSING");
  return token;
}

function githubRequestFactory({ repository, token, fetchImpl }) {
  return async function githubRequest(path, { method = "GET", body = undefined } = {}) {
    const response = await fetchImpl(`${GITHUB_API}/repos/${encodeURIComponent(repository.owner)}/${encodeURIComponent(repository.repo)}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "Content-Type": "application/json",
        "X-GitHub-Api-Version": API_VERSION,
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    return jsonResponse(response, `CODE_AI_GITHUB_API_FAILED:${method}:${path}`);
  };
}

function modeMap(treeBody) {
  const modes = new Map();
  for (const entry of list(treeBody?.tree)) {
    const path = text(entry?.path);
    const mode = text(entry?.mode);
    if (path && ["100644", "100755", "120000"].includes(mode)) modes.set(path, mode);
  }
  return modes;
}

function encodedRepositoryPath(value) {
  return text(value)
    .split("/")
    .map((part) => encodeURIComponent(part))
    .join("/");
}

function samePathSet(actualPaths, expectedChanges) {
  const actual = [...new Set(actualPaths.map(text).filter(Boolean))].sort();
  const expected = [...new Set(expectedChanges.map((change) => change.path))].sort();
  return (
    actual.length === expected.length &&
    actual.every((path, index) => path === expected[index])
  );
}

async function candidateMatchesAttestedChanges({
  github,
  baseCommit,
  candidateSha,
  changes,
}) {
  const comparison = await github(
    `/compare/${encodeURIComponent(baseCommit)}...${encodeURIComponent(candidateSha)}`,
  );
  const comparedFiles = list(comparison?.files).map((file) => text(file?.filename));
  if (!samePathSet(comparedFiles, changes)) return null;

  for (const change of changes) {
    const contentBody = await github(
      `/contents/${encodedRepositoryPath(change.path)}?ref=${encodeURIComponent(candidateSha)}`,
    );
    if (
      text(contentBody?.type).toLowerCase() !== "file" ||
      text(contentBody?.encoding).toLowerCase() !== "base64" ||
      !text(contentBody?.content)
    ) {
      return null;
    }
    const actual = Buffer.from(
      String(contentBody.content).replace(/\s+/g, ""),
      "base64",
    ).toString("utf8");
    if (actual !== change.content) return null;
  }

  const commit = await github(`/git/commits/${encodeURIComponent(candidateSha)}`);
  const parents = list(commit?.parents);
  const treeSha = text(commit?.tree?.sha);
  if (
    parents.length !== 1 ||
    text(parents[0]?.sha) !== baseCommit ||
    !treeSha
  ) {
    return null;
  }
  return { tree_sha: treeSha };
}

export async function recoverVerifiedCodeMissionCommit({
  mission_state,
  env = process.env,
  fetch_impl = globalThis.fetch,
} = {}) {
  if (typeof fetch_impl !== "function") throw new Error("CODE_AI_GITHUB_FETCH_REQUIRED");
  const state = object(mission_state);
  verifyCodeMissionStateAttestation(state, { env });
  const repository = parseRepository(state.repository_url);
  assertRepositoryAllowed(repository, env);
  assertMissionReady(state, repository);
  const { changes, totalBytes } = normalizedChanges(state);
  const expectedBase = text(state.base_commit);

  const token = await connectGitHubToken({ env, fetchImpl: fetch_impl });
  const github = githubRequestFactory({ repository, token, fetchImpl: fetch_impl });
  const currentRef = await github("/git/ref/heads/main");
  const currentMainHead = text(currentRef?.object?.sha);
  if (!currentMainHead) throw new Error("CODE_AI_GITHUB_RECOVERY_MAIN_HEAD_MISSING");
  if (currentMainHead === expectedBase) {
    throw recoveryNotFoundError({ expectedBase, currentMainHead });
  }

  const history = await github(`/commits?sha=main&per_page=${RECOVERY_HISTORY_LIMIT}`);
  const candidates = list(history).filter((commit) => {
    const parents = list(commit?.parents);
    return (
      parents.length === 1 &&
      text(parents[0]?.sha) === expectedBase &&
      Boolean(text(commit?.sha))
    );
  });

  for (const candidate of candidates) {
    const candidateSha = text(candidate?.sha);
    const matched = await candidateMatchesAttestedChanges({
      github,
      baseCommit: expectedBase,
      candidateSha,
      changes,
    });
    if (!matched) continue;

    return {
      success: true,
      contract: CONTRACT,
      repository: repository.full_name,
      branch: "main",
      previous_commit: expectedBase,
      commit_sha: candidateSha,
      tree_sha: matched.tree_sha,
      file_count: changes.length,
      source_bytes: totalBytes,
      force: false,
      verified: true,
      recovered_from_attested_artifact: true,
      recovery_history_limit: RECOVERY_HISTORY_LIMIT,
      current_main_head: currentMainHead,
      commit_is_current_main_head: candidateSha === currentMainHead,
      main_advanced_after_commit: candidateSha !== currentMainHead,
    };
  }

  throw recoveryNotFoundError({ expectedBase, currentMainHead });
}

export async function commitVerifiedCodeMission({
  mission_state,
  commit_message,
  env = process.env,
  fetch_impl = globalThis.fetch,
} = {}) {
  if (typeof fetch_impl !== "function") throw new Error("CODE_AI_GITHUB_FETCH_REQUIRED");
  const state = object(mission_state);
  verifyCodeMissionStateAttestation(state, { env });
  const repository = parseRepository(state.repository_url);
  assertRepositoryAllowed(repository, env);
  assertMissionReady(state, repository);
  const { changes, totalBytes } = normalizedChanges(state);
  const message = text(commit_message);
  if (!message) throw new Error("CODE_AI_GITHUB_COMMIT_MESSAGE_REQUIRED");
  if (message.length > 200) throw new Error("CODE_AI_GITHUB_COMMIT_MESSAGE_TOO_LONG");

  const token = await connectGitHubToken({ env, fetchImpl: fetch_impl });
  const github = githubRequestFactory({ repository, token, fetchImpl: fetch_impl });

  const beforeRef = await github("/git/ref/heads/main");
  const actualBase = text(beforeRef?.object?.sha);
  if (!actualBase || actualBase !== text(state.base_commit)) {
    const error = new Error("CODE_AI_GITHUB_BASE_COMMIT_MOVED_REPLAN_REQUIRED");
    error.expected_base_commit = text(state.base_commit);
    error.actual_base_commit = actualBase || null;
    throw error;
  }

  const baseCommit = await github(`/git/commits/${encodeURIComponent(actualBase)}`);
  const baseTreeSha = text(baseCommit?.tree?.sha);
  if (!baseTreeSha) throw new Error("CODE_AI_GITHUB_BASE_TREE_MISSING");
  const baseTree = await github(`/git/trees/${encodeURIComponent(baseTreeSha)}?recursive=1`);
  if (baseTree?.truncated === true) throw new Error("CODE_AI_GITHUB_BASE_TREE_TRUNCATED");
  const modes = modeMap(baseTree);

  const createdTree = await github("/git/trees", {
    method: "POST",
    body: {
      base_tree: baseTreeSha,
      tree: changes.map((change) => ({
        path: change.path,
        mode: modes.get(change.path) || "100644",
        type: "blob",
        content: change.content,
      })),
    },
  });
  const treeSha = text(createdTree?.sha);
  if (!treeSha) throw new Error("CODE_AI_GITHUB_CREATED_TREE_MISSING");

  const createdCommit = await github("/git/commits", {
    method: "POST",
    body: {
      message,
      tree: treeSha,
      parents: [actualBase],
    },
  });
  const commitSha = text(createdCommit?.sha);
  if (!commitSha) throw new Error("CODE_AI_GITHUB_CREATED_COMMIT_MISSING");

  await github("/git/refs/heads/main", {
    method: "PATCH",
    body: { sha: commitSha, force: false },
  });

  const [verifiedRef, verifiedCommit] = await Promise.all([
    github("/git/ref/heads/main"),
    github(`/git/commits/${encodeURIComponent(commitSha)}`),
  ]);
  const verifiedSha = text(verifiedRef?.object?.sha);
  const parentSha = text(list(verifiedCommit?.parents)[0]?.sha);
  const verifiedTreeSha = text(verifiedCommit?.tree?.sha);
  if (verifiedSha !== commitSha || parentSha !== actualBase || verifiedTreeSha !== treeSha) {
    throw new Error("CODE_AI_GITHUB_POST_COMMIT_VERIFICATION_FAILED");
  }

  return {
    success: true,
    contract: CONTRACT,
    repository: repository.full_name,
    branch: "main",
    previous_commit: actualBase,
    commit_sha: commitSha,
    tree_sha: treeSha,
    file_count: changes.length,
    source_bytes: totalBytes,
    force: false,
    verified: true,
  };
}

export const CodeGitHubCommitRuntime = Object.freeze({
  contract: CONTRACT,
  commit: commitVerifiedCodeMission,
  recover: recoverVerifiedCodeMissionCommit,
});
