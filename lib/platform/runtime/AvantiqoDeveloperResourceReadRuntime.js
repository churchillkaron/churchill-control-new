export const AVANTIQO_DEVELOPER_RESOURCE_READ_CONTRACT =
  "AVANTIQO_DEVELOPER_RESOURCE_READ_V1";

const DEFAULT_GITHUB_REPOSITORY = "churchillkaron/churchill-control-new";
const VERCEL_API = "https://api.vercel.com";
const MAX_EVENT_TEXT = 500;
const MAX_EVENTS = 20;

function text(value, maximum = 2000) {
  return String(value ?? "").trim().slice(0, maximum);
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

function resourceIntent(value) {
  const focus = text(value, 4000).toLowerCase();
  return {
    vercel_diagnostics:
      /\b(vercel|deploy|deployment|production|runtime|build|log|error|500|timeout|crash)\b/.test(focus),
  };
}

function vercelConfiguration() {
  const token = text(process.env.VERCEL_TOKEN, 4000);
  const teamId = text(process.env.VERCEL_TEAM_ID || process.env.VERCEL_ORG_ID, 300);
  const projectId = text(process.env.VERCEL_PROJECT_ID, 300);
  return {
    configured: Boolean(token && projectId),
    token,
    team_id: teamId || null,
    project_id: projectId || null,
  };
}

function vercelUrl(pathname, query = {}) {
  const url = new URL(`${VERCEL_API}${pathname}`);
  for (const [key, value] of Object.entries(query)) {
    if (value !== null && value !== undefined && String(value).length) {
      url.searchParams.set(key, String(value));
    }
  }
  return url.toString();
}

async function vercelGet(pathname, query, config) {
  const response = await fetch(vercelUrl(pathname, {
    ...query,
    ...(config.team_id ? { teamId: config.team_id } : {}),
  }), {
    method: "GET",
    headers: {
      Authorization: `Bearer ${config.token}`,
      Accept: "application/json",
    },
    cache: "no-store",
    signal: AbortSignal.timeout(20_000),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(
      `DEVELOPER_RESOURCE_VERCEL_HTTP_${response.status}:${text(body?.error?.message || body?.message || body?.error, 300) || "UNKNOWN"}`,
    );
  }
  return body;
}

function deploymentSummary(value) {
  const deployment = object(value);
  return {
    id: text(deployment.uid || deployment.id, 300) || null,
    name: text(deployment.name, 300) || null,
    url: text(deployment.url, 500) || null,
    state: text(deployment.state || deployment.readyState, 80) || null,
    ready_state: text(deployment.readyState, 80) || null,
    target: text(deployment.target, 80) || null,
    created_at: deployment.createdAt || deployment.created_at || null,
    ready_at: deployment.ready || deployment.readyAt || null,
    source: text(deployment.source, 120) || null,
    git_commit_sha:
      text(
        deployment.meta?.githubCommitSha ||
        deployment.meta?.gitCommitSha ||
        deployment.gitSource?.sha,
        160,
      ) || null,
    git_commit_message:
      text(
        deployment.meta?.githubCommitMessage ||
        deployment.meta?.gitCommitMessage,
        500,
      ) || null,
    error_code: text(deployment.errorCode || deployment.error?.code, 160) || null,
    error_message: text(deployment.errorMessage || deployment.error?.message, 500) || null,
  };
}

function eventSummary(value) {
  const event = object(value);
  const payload = object(event.payload);
  return {
    type: text(event.type || payload.type, 120) || null,
    created_at: event.created || event.createdAt || payload.createdAt || null,
    text:
      text(
        event.text ||
        event.message ||
        payload.text ||
        payload.message ||
        payload.info?.name,
        MAX_EVENT_TEXT,
      ) || null,
  };
}

function runtimeLogSummary(value) {
  const log = object(value);
  return {
    timestamp: log.timestamp || log.createdAt || log.created_at || null,
    level: text(log.level, 80) || null,
    source: text(log.source, 120) || null,
    message: text(log.message || log.text, MAX_EVENT_TEXT) || null,
    request_id: text(log.requestId || log.request_id, 200) || null,
  };
}

async function readVercel({ focus = null } = {}) {
  const config = vercelConfiguration();
  if (!config.configured) {
    return {
      configured: false,
      status: "VERCEL_SERVER_CREDENTIALS_UNAVAILABLE",
      project_id_present: Boolean(config.project_id),
      team_id_present: Boolean(config.team_id),
      token_present: Boolean(config.token),
      token_exposed: false,
      read_only: true,
    };
  }

  const intent = resourceIntent(focus);
  const deploymentsBody = await vercelGet("/v6/deployments", {
    projectId: config.project_id,
    limit: 5,
    target: "production",
  }, config);
  const deployments = list(deploymentsBody.deployments).map(deploymentSummary);
  const latest = deployments[0] || null;
  let buildEvents = [];
  let runtimeLogs = [];
  let diagnosticError = null;

  if (intent.vercel_diagnostics && latest?.id) {
    try {
      const eventsBody = await vercelGet(
        `/v3/deployments/${encodeURIComponent(latest.id)}/events`,
        { limit: MAX_EVENTS },
        config,
      );
      buildEvents = (Array.isArray(eventsBody) ? eventsBody : list(eventsBody.events))
        .slice(-MAX_EVENTS)
        .map(eventSummary)
        .filter((event) => event.type || event.text);
    } catch (error) {
      diagnosticError = text(error?.message || error, 500);
    }

    try {
      const logsBody = await vercelGet(
        `/v1/projects/${encodeURIComponent(config.project_id)}/deployments/${encodeURIComponent(latest.id)}/runtime-logs`,
        { limit: MAX_EVENTS },
        config,
      );
      runtimeLogs = (Array.isArray(logsBody) ? logsBody : list(logsBody.logs))
        .slice(-MAX_EVENTS)
        .map(runtimeLogSummary)
        .filter((entry) => entry.message || entry.level);
    } catch (error) {
      diagnosticError = diagnosticError || text(error?.message || error, 500);
    }
  }

  return {
    configured: true,
    status: "READ_OK",
    project_id: config.project_id,
    team_id_present: Boolean(config.team_id),
    token_present: true,
    token_exposed: false,
    latest_production_deployment: latest,
    recent_production_deployments: deployments,
    diagnostics_requested: intent.vercel_diagnostics,
    build_events: buildEvents,
    runtime_logs: runtimeLogs,
    diagnostic_error: diagnosticError,
    read_only: true,
    deploy_authority: false,
    environment_write_authority: false,
  };
}

export async function readAvantiqoDeveloperResources({
  focus = null,
  repository = DEFAULT_GITHUB_REPOSITORY,
} = {}) {
  const vercel = await readVercel({ focus }).catch((error) => ({
    configured: true,
    status: "VERCEL_READ_FAILED",
    error: text(error?.message || error, 500),
    token_exposed: false,
    read_only: true,
    deploy_authority: false,
    environment_write_authority: false,
  }));

  return {
    contract: AVANTIQO_DEVELOPER_RESOURCE_READ_CONTRACT,
    repository,
    github: {
      repository,
      source_of_truth: "CURRENT_REPOSITORY_ASSESSMENT",
      read_only: true,
      commit_authority: false,
    },
    vercel,
    safety: {
      read_only: true,
      secrets_returned: false,
      production_deploy_performed: false,
      environment_mutation_performed: false,
      authorization_effect: "NONE",
    },
    observed_at: new Date().toISOString(),
  };
}

export const AvantiqoDeveloperResourceReadRuntime = Object.freeze({
  contract: AVANTIQO_DEVELOPER_RESOURCE_READ_CONTRACT,
  read: readAvantiqoDeveloperResources,
});

export default AvantiqoDeveloperResourceReadRuntime;
