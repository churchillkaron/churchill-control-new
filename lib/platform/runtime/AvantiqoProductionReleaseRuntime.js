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

export async function getVercelRollingReleasePolicy({ env = process.env, fetch_impl = globalThis.fetch } = {}) {
  const cfg = config(env);
  const response = await fetch_impl(url(`/v1/projects/${encodeURIComponent(cfg.projectId)}/rolling-release/config`, cfg.teamId), {
    headers: { Authorization: `Bearer ${cfg.token}`, Accept: "application/json" },
    cache: "no-store",
    signal: AbortSignal.timeout(20000),
  });
  const body = await json(response, "AVANTIQO_ROLLING_RELEASE_CONFIG_READ_FAILED");
  const rolling = body?.rollingRelease || null;
  return {
    success: true,
    contract: "AVANTIQO_VERCEL_ROLLING_RELEASE_POLICY_STATE_V1",
    project_id: cfg.projectId,
    rolling_release: rolling,
    configured: Boolean(rolling),
  };
}

export async function verifyVercelRollingReleasePolicy({
  env = process.env,
  fetch_impl = globalThis.fetch,
  required_percentages = [5, 25, 100],
} = {}) {
  const cfg = config(env);
  const policyState = await getVercelRollingReleasePolicy({ env, fetch_impl });
  const rolling = policyState.rolling_release;
  if (!rolling || String(rolling.target || "").toLowerCase() !== "production") {
    throw new Error("AVANTIQO_ROLLING_RELEASE_PRODUCTION_POLICY_REQUIRED");
  }
  const stages = Array.isArray(rolling.stages) ? rolling.stages : [];
  const observed = stages.map((stage) => Number(stage?.targetPercentage)).filter(Number.isFinite);
  const required = required_percentages.map(Number);
  if (observed.length !== required.length || observed.some((value, index) => value !== required[index])) {
    throw new Error(`AVANTIQO_ROLLING_RELEASE_STAGE_POLICY_MISMATCH:${observed.join(",") || "NONE"}`);
  }
  const approvalStages = stages.slice(1);
  const approvalsRequired = approvalStages.every((stage) => stage?.requireApproval === true || String(stage?.requireApproval).toLowerCase() === "true");
  if (!approvalsRequired) throw new Error("AVANTIQO_ROLLING_RELEASE_MANUAL_APPROVAL_REQUIRED");
  const gate = rolling?.gate || null;
  if (!gate || !(gate.enabled === true || String(gate.enabled).toLowerCase() === "true")) {
    throw new Error("AVANTIQO_ROLLING_RELEASE_AUTOMATIC_GATE_REQUIRED");
  }
  if (String(gate.action || "").toLowerCase() !== "rollback") {
    throw new Error("AVANTIQO_ROLLING_RELEASE_AUTOMATIC_ROLLBACK_REQUIRED");
  }
  if (gate.dryRun === true || String(gate.dryRun).toLowerCase() === "true") {
    throw new Error("AVANTIQO_ROLLING_RELEASE_ROLLBACK_DRY_RUN_FORBIDDEN");
  }
  if (!Array.isArray(gate.checks) || gate.checks.length === 0) {
    throw new Error("AVANTIQO_ROLLING_RELEASE_HEALTH_CHECK_REQUIRED");
  }
  return {
    success: true,
    contract: "AVANTIQO_VERCEL_ROLLING_RELEASE_POLICY_V1",
    project_id: cfg.projectId,
    target: "production",
    stages: observed,
    manual_approval: true,
    automatic_rollback: true,
    health_check_count: gate.checks.length,
    failure_threshold: Number(gate.failureThreshold ?? 3),
    window_size: Number(gate.windowSize ?? 5),
    verified: true,
  };
}

export async function configureVercelRollingReleasePolicy({ env = process.env, fetch_impl = globalThis.fetch } = {}) {
  const cfg = config(env);
  const desired = {
    target: "production",
    stages: [
      { targetPercentage: 5, requireApproval: false },
      { targetPercentage: 25, requireApproval: true },
      { targetPercentage: 100, requireApproval: true },
    ],
    canaryResponseHeader: true,
    gate: {
      enabled: true,
      checks: [{
        type: "error-rate-5xx",
        minSampleSize: 100,
        excludeStatusCodes: [],
        excludePaths: [],
        ingestWatermarkSeconds: 30,
      }],
      failureThreshold: 3,
      windowSize: 5,
      action: "rollback",
      dryRun: false,
    },
  };
  const response = await fetch_impl(url(`/v1/projects/${encodeURIComponent(cfg.projectId)}/rolling-release/config`, cfg.teamId), {
    method: "PATCH",
    headers: { Authorization: `Bearer ${cfg.token}`, Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify(desired),
    signal: AbortSignal.timeout(20000),
  });
  await json(response, "AVANTIQO_ROLLING_RELEASE_CONFIG_UPDATE_FAILED");
  const verified = await verifyVercelRollingReleasePolicy({ env, fetch_impl });
  return { success: true, contract: "AVANTIQO_VERCEL_ROLLING_RELEASE_CONFIG_V1", configured: true, desired, verified };
}

export async function getVercelRollingRelease({ env = process.env, fetch_impl = globalThis.fetch } = {}) {
  const cfg = config(env);
  const response = await fetch_impl(url(`/v1/projects/${encodeURIComponent(cfg.projectId)}/rolling-release`, cfg.teamId), {
    headers: { Authorization: `Bearer ${cfg.token}`, Accept: "application/json" },
    cache: "no-store",
    signal: AbortSignal.timeout(20000),
  });
  const body = await json(response, "AVANTIQO_ROLLING_RELEASE_STATUS_FAILED");
  const rolling = body?.rollingRelease || null;
  return {
    success: true,
    contract: "AVANTIQO_VERCEL_ROLLING_RELEASE_STATE_V1",
    rolling_release: rolling,
    state: text(rolling?.state, 80).toUpperCase() || null,
    substate: text(rolling?.substate, 80).toUpperCase() || null,
    canary_deployment_id: text(rolling?.canaryDeployment?.id, 300) || null,
    current_deployment_id: text(rolling?.currentDeployment?.id, 300) || null,
    current_canary_percentage: Number(rolling?.currentCanaryPercentage ?? rolling?.activeStage?.targetPercentage ?? 0) || 0,
    active_stage_index: Number.isFinite(Number(rolling?.activeStage?.index)) ? Number(rolling.activeStage.index) : null,
    next_stage_index: Number.isFinite(Number(rolling?.nextStage?.index)) ? Number(rolling.nextStage.index) : null,
    next_stage_percentage: Number.isFinite(Number(rolling?.nextStage?.targetPercentage)) ? Number(rolling.nextStage.targetPercentage) : null,
    next_stage_is_final: rolling?.nextStage?.isFinalStage === true || String(rolling?.nextStage?.isFinalStage).toLowerCase() === "true",
  };
}

export async function approveVercelRollingReleaseStage({
  canary_deployment_id,
  next_stage_index,
  env = process.env,
  fetch_impl = globalThis.fetch,
} = {}) {
  const canaryId = text(canary_deployment_id, 300);
  const nextIndex = Number(next_stage_index);
  if (!canaryId || !Number.isInteger(nextIndex) || nextIndex < 0) throw new Error("AVANTIQO_ROLLING_RELEASE_APPROVAL_INPUT_INVALID");
  await verifyVercelRollingReleasePolicy({ env, fetch_impl });
  const current = await getVercelRollingRelease({ env, fetch_impl });
  if (current.state !== "ACTIVE") throw new Error("AVANTIQO_ROLLING_RELEASE_NOT_ACTIVE");
  if (current.canary_deployment_id !== canaryId) throw new Error("AVANTIQO_ROLLING_RELEASE_CANARY_MISMATCH");
  if (current.next_stage_index !== nextIndex) throw new Error(`AVANTIQO_ROLLING_RELEASE_NEXT_STAGE_MISMATCH:${current.next_stage_index}`);
  if (current.next_stage_is_final || current.next_stage_percentage === 100) {
    throw new Error("AVANTIQO_ROLLING_RELEASE_FINAL_STAGE_REQUIRES_COMPLETE");
  }
  if (current.current_canary_percentage !== 5 || current.next_stage_percentage !== 25) {
    throw new Error(`AVANTIQO_ROLLING_RELEASE_STAGE_SEQUENCE_INVALID:${current.current_canary_percentage}->${current.next_stage_percentage}`);
  }
  const cfg = config(env);
  const response = await fetch_impl(url(`/v1/projects/${encodeURIComponent(cfg.projectId)}/rolling-release/approve-stage`, cfg.teamId), {
    method: "POST",
    headers: { Authorization: `Bearer ${cfg.token}`, Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({ nextStageIndex: nextIndex, canaryDeploymentId: canaryId }),
    signal: AbortSignal.timeout(20000),
  });
  const body = await json(response, "AVANTIQO_ROLLING_RELEASE_APPROVE_FAILED");
  return { success: true, contract: "AVANTIQO_VERCEL_ROLLING_RELEASE_APPROVAL_V1", rolling_release: body?.rollingRelease || null, canary_deployment_id: canaryId, approved_stage_index: nextIndex };
}

export async function completeVercelRollingRelease({
  canary_deployment_id,
  env = process.env,
  fetch_impl = globalThis.fetch,
} = {}) {
  const canaryId = text(canary_deployment_id, 300);
  if (!canaryId) throw new Error("AVANTIQO_ROLLING_RELEASE_CANARY_REQUIRED");
  await verifyVercelRollingReleasePolicy({ env, fetch_impl });
  const current = await getVercelRollingRelease({ env, fetch_impl });
  if (current.state !== "ACTIVE") throw new Error("AVANTIQO_ROLLING_RELEASE_NOT_ACTIVE");
  if (current.canary_deployment_id !== canaryId) throw new Error("AVANTIQO_ROLLING_RELEASE_CANARY_MISMATCH");
  if (current.current_canary_percentage !== 25 || !(current.next_stage_is_final || current.next_stage_percentage === 100)) {
    throw new Error(`AVANTIQO_ROLLING_RELEASE_COMPLETE_SEQUENCE_INVALID:${current.current_canary_percentage}->${current.next_stage_percentage}`);
  }
  const cfg = config(env);
  const response = await fetch_impl(url(`/v1/projects/${encodeURIComponent(cfg.projectId)}/rolling-release/complete`, cfg.teamId), {
    method: "POST",
    headers: { Authorization: `Bearer ${cfg.token}`, Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({ canaryDeploymentId: canaryId }),
    signal: AbortSignal.timeout(20000),
  });
  const body = await json(response, "AVANTIQO_ROLLING_RELEASE_COMPLETE_FAILED");
  return { success: true, contract: "AVANTIQO_VERCEL_ROLLING_RELEASE_COMPLETE_V1", rolling_release: body?.rollingRelease || null, canary_deployment_id: canaryId, completed: true };
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
  const rollingPolicy = await verifyVercelRollingReleasePolicy({ env, fetch_impl });
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

  const rollingState = await getVercelRollingRelease({ env, fetch_impl }).catch(() => null);
  const isActiveCanary = rollingState?.state === "ACTIVE" && rollingState?.canary_deployment_id === deploymentId;
  return {
    success: true,
    contract: CONTRACT,
    deployment_id: deploymentId,
    deployment_url: `https://${deploymentUrl}`,
    state: "READY",
    target: "production",
    requested_commit_sha: commitSha,
    observed_commit_sha: deployedCommit,
    production_deployed: !isActiveCanary,
    deployment_pending: false,
    rolling_release_active: isActiveCanary,
    rolling_release_percentage: isActiveCanary ? rollingState.current_canary_percentage : 100,
    rolling_release_state: rollingState?.state || null,
    rolling_release_policy: rollingPolicy,
  };
}

export async function verifyExistingVercelDeployment({
  deployment_id,
  expected_commit_sha,
  expected_target = null,
  env = process.env,
  fetch_impl = globalThis.fetch,
} = {}) {
  const deploymentId = text(deployment_id, 300);
  const expectedCommit = text(expected_commit_sha, 160);
  const expectedTarget = text(expected_target, 80).toLowerCase() || null;
  if (!deploymentId) throw new Error("AVANTIQO_RELEASE_DEPLOYMENT_ID_REQUIRED");
  if (!/^[0-9a-f]{40}$/i.test(expectedCommit)) throw new Error("AVANTIQO_PRODUCTION_RELEASE_COMMIT_SHA_INVALID");
  const cfg = config(env);
  const response = await fetch_impl(url(`/v13/deployments/${encodeURIComponent(deploymentId)}`, cfg.teamId), {
    headers: { Authorization: `Bearer ${cfg.token}`, Accept: "application/json" },
    cache: "no-store",
    signal: AbortSignal.timeout(20000),
  });
  const deployment = await json(response, "AVANTIQO_RELEASE_STATUS_FAILED");
  const state = text(deployment.readyState || deployment.state, 80).toUpperCase() || "UNKNOWN";
  const target = text(deployment.target, 80).toLowerCase() || null;
  const observed = observedCommit(deployment) || null;
  if (["ERROR", "CANCELED"].includes(state)) throw new Error(`AVANTIQO_PRODUCTION_RELEASE_DEPLOYMENT_FAILED:${state}`);
  if (expectedTarget && target && target !== expectedTarget) throw new Error(`AVANTIQO_RELEASE_TARGET_MISMATCH:${target}`);
  if (state !== "READY") return { success: true, contract: "AVANTIQO_VERCEL_DEPLOYMENT_VERIFICATION_V1", deployment_id: deploymentId, state, target, requested_commit_sha: expectedCommit, observed_commit_sha: observed, ready: false, deployment_pending: true };
  if (!observed) throw new Error("AVANTIQO_PRODUCTION_RELEASE_COMMIT_EVIDENCE_REQUIRED");
  if (observed.toLowerCase() !== expectedCommit.toLowerCase()) throw new Error(`AVANTIQO_PRODUCTION_RELEASE_COMMIT_MISMATCH:${observed}`);
  return { success: true, contract: "AVANTIQO_VERCEL_DEPLOYMENT_VERIFICATION_V1", deployment_id: deploymentId, deployment_url: deployment.url ? `https://${text(deployment.url,1000)}` : null, state: "READY", target, requested_commit_sha: expectedCommit, observed_commit_sha: observed, ready: true, deployment_pending: false, exact_commit_verified: true };
}

export async function verifyExistingProductionDeployment({
  deployment_id,
  expected_commit_sha,
  env = process.env,
  fetch_impl = globalThis.fetch,
} = {}) {
  const deploymentId = text(deployment_id, 300);
  const expectedCommit = text(expected_commit_sha, 160);
  if (!deploymentId) throw new Error("AVANTIQO_PRODUCTION_RELEASE_DEPLOYMENT_ID_REQUIRED");
  if (!/^[0-9a-f]{40}$/i.test(expectedCommit)) {
    throw new Error("AVANTIQO_PRODUCTION_RELEASE_COMMIT_SHA_INVALID");
  }
  const cfg = config(env);
  const response = await fetch_impl(
    url(`/v13/deployments/${encodeURIComponent(deploymentId)}`, cfg.teamId),
    {
      headers: { Authorization: `Bearer ${cfg.token}`, Accept: "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(20000),
    },
  );
  const deployment = await json(response, "AVANTIQO_PRODUCTION_RELEASE_STATUS_FAILED");
  const state = text(deployment.readyState || deployment.state, 80).toUpperCase() || "UNKNOWN";
  if (["ERROR", "CANCELED"].includes(state)) {
    throw new Error(`AVANTIQO_PRODUCTION_RELEASE_DEPLOYMENT_FAILED:${state}`);
  }
  const observed = observedCommit(deployment) || null;
  if (state !== "READY") {
    return {
      success: true,
      contract: CONTRACT,
      deployment_id: deploymentId,
      state,
      requested_commit_sha: expectedCommit,
      observed_commit_sha: observed,
      production_deployed: false,
      deployment_pending: true,
    };
  }
  if (!observed) throw new Error("AVANTIQO_PRODUCTION_RELEASE_COMMIT_EVIDENCE_REQUIRED");
  if (observed.toLowerCase() !== expectedCommit.toLowerCase()) {
    throw new Error(`AVANTIQO_PRODUCTION_RELEASE_COMMIT_MISMATCH:${observed}`);
  }
  return {
    success: true,
    contract: CONTRACT,
    deployment_id: deploymentId,
    deployment_url: deployment.url ? `https://${text(deployment.url, 1000)}` : null,
    state: "READY",
    target: "production",
    requested_commit_sha: expectedCommit,
    observed_commit_sha: observed,
    production_deployed: true,
    deployment_pending: false,
  };
}

export const AvantiqoProductionReleaseRuntime = Object.freeze({
  contract: CONTRACT,
  deployVerifiedMainCommit,
  getVercelRollingReleasePolicy,
  verifyVercelRollingReleasePolicy,
  configureVercelRollingReleasePolicy,
  getVercelRollingRelease,
  approveVercelRollingReleaseStage,
  completeVercelRollingRelease,
  verifyExistingVercelDeployment,
  verifyExistingProductionDeployment,
});
