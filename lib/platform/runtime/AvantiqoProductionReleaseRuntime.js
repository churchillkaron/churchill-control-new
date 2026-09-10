const CONTRACT = "AVANTIQO_PRODUCTION_RELEASE_V1";
const VERCEL_API = "https://api.vercel.com";
const DEFAULT_PROJECT_NAME = "churchill-control";
const DEFAULT_REPOSITORY_ID = 1210794056;

function text(value, limit = 4000) {
  return String(value ?? "").trim().slice(0, limit);
}

function config(env = process.env) {
  const token = text(env.VERCEL_TOKEN, 4000);
  const teamId = text(env.VERCEL_TEAM_ID || env.VERCEL_ORG_ID, 300);
  const projectId = text(env.VERCEL_PROJECT_ID, 300);
  const repositoryId = Number(env.AVANTIQO_CODE_GITHUB_REPOSITORY_ID || DEFAULT_REPOSITORY_ID);
  if (!token) throw new Error("AVANTIQO_PRODUCTION_RELEASE_VERCEL_TOKEN_REQUIRED");
  if (!projectId) throw new Error("AVANTIQO_PRODUCTION_RELEASE_PROJECT_ID_REQUIRED");
  if (!Number.isInteger(repositoryId) || repositoryId <= 0) {
    throw new Error("AVANTIQO_PRODUCTION_RELEASE_REPOSITORY_ID_INVALID");
  }
  return { token, teamId: teamId || null, projectId, repositoryId };
}

function url(pathname, teamId) {
  const target = new URL(`${VERCEL_API}${pathname}`);
  if (teamId) target.searchParams.set("teamId", teamId);
  return target.toString();
}

async function json(response, prefix) {
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`${prefix}:${response.status}:${text(body?.error?.message || body?.message || body?.error, 700) || "UNKNOWN"}`);
  }
  return body;
}

function observedCommit(deployment = {}) {
  return text(
    deployment?.meta?.githubCommitSha ||
      deployment?.meta?.gitCommitSha ||
      deployment?.gitSource?.sha ||
      deployment?.gitSource?.ref,
    160,
  );
}

export async function deployVerifiedMainCommit({
  commit_sha,
  env = process.env,
  fetch_impl = globalThis.fetch,
  poll_interval_ms = 2500,
  timeout_ms = 180000,
} = {}) {
  const commitSha = text(commit_sha, 160);
  if (!/^[0-9a-f]{40}$/i.test(commitSha)) {
    throw new Error("AVANTIQO_PRODUCTION_RELEASE_COMMIT_SHA_INVALID");
  }
  const cfg = config(env);
  const response = await fetch_impl(url("/v13/deployments", cfg.teamId), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${cfg.token}`,
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      name: text(env.VERCEL_PROJECT_NAME, 120) || DEFAULT_PROJECT_NAME,
      project: cfg.projectId,
      target: "production",
      gitSource: {
        type: "github",
        ref: commitSha,
        repoId: cfg.repositoryId,
      },
    }),
    signal: AbortSignal.timeout(30000),
  });
  const created = await json(response, "AVANTIQO_PRODUCTION_RELEASE_CREATE_FAILED");
  const deploymentId = text(created.id || created.uid, 300);
  const deploymentUrl = text(created.url, 1000);
  if (!deploymentId || !deploymentUrl) {
    throw new Error("AVANTIQO_PRODUCTION_RELEASE_DEPLOYMENT_ID_URL_REQUIRED");
  }

  const deadline = Date.now() + Math.max(15000, Math.min(Number(timeout_ms) || 180000, 240000));
  let lastState = text(created.readyState || created.state, 80).toUpperCase() || "QUEUED";
  let last = created;

  while (Date.now() < deadline) {
    if (["READY", "ERROR", "CANCELED"].includes(lastState)) break;
    await new Promise((resolve) => setTimeout(resolve, Math.max(500, Number(poll_interval_ms) || 2500)));
    const poll = await fetch_impl(url(`/v13/deployments/${encodeURIComponent(deploymentId)}`, cfg.teamId), {
      headers: { Authorization: `Bearer ${cfg.token}`, Accept: "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(20000),
    });
    last = await json(poll, "AVANTIQO_PRODUCTION_RELEASE_STATUS_FAILED");
    lastState = text(last.readyState || last.state, 80).toUpperCase() || lastState;
  }

  if (lastState === "ERROR" || lastState === "CANCELED") {
    throw new Error(`AVANTIQO_PRODUCTION_RELEASE_DEPLOYMENT_FAILED:${lastState}`);
  }
  if (lastState !== "READY") {
    return {
      success: true,
      contract: CONTRACT,
      deployment_id: deploymentId,
      deployment_url: `https://${deploymentUrl}`,
      state: lastState,
      target: "production",
      requested_commit_sha: commitSha,
      observed_commit_sha: observedCommit(last) || null,
      production_deployed: false,
      deployment_pending: true,
    };
  }

  const deployedCommit = observedCommit(last);
  if (!deployedCommit) {
    throw new Error("AVANTIQO_PRODUCTION_RELEASE_COMMIT_EVIDENCE_REQUIRED");
  }
  if (deployedCommit.toLowerCase() !== commitSha.toLowerCase()) {
    throw new Error(`AVANTIQO_PRODUCTION_RELEASE_COMMIT_MISMATCH:${deployedCommit}`);
  }

  return {
    success: true,
    contract: CONTRACT,
    deployment_id: deploymentId,
    deployment_url: `https://${deploymentUrl}`,
    state: "READY",
    target: "production",
    requested_commit_sha: commitSha,
    observed_commit_sha: deployedCommit,
    production_deployed: true,
    deployment_pending: false,
  };
}

export const AvantiqoProductionReleaseRuntime = Object.freeze({
  contract: CONTRACT,
  deployVerifiedMainCommit,
});
