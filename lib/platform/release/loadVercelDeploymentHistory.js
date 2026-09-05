const DEFAULT_PROJECT_ID = "prj_5K2x3kGkhs3d2PU8VOQQPyNT24A9";
const DEFAULT_TEAM_ID = "team_40jy42BqQOs4U6pVdkawwEfp";
const DEFAULT_LIMIT = 20;

function configuredToken() {
  return (
    process.env.AVANTIQO_VERCEL_ACCESS_TOKEN ||
    process.env.VERCEL_ACCESS_TOKEN ||
    process.env.VERCEL_TOKEN ||
    null
  );
}

function normalizeDeployment(row) {
  const meta = row?.meta || {};

  return {
    id: row?.uid || row?.id || null,
    name: row?.name || null,
    url: row?.url || null,
    state: row?.state || row?.readyState || "unknown",
    target: row?.target || null,
    createdAt: row?.createdAt || row?.created || null,
    readyAt: row?.ready || row?.readyAt || null,
    buildingAt: row?.buildingAt || null,
    source: row?.source || null,
    creator: row?.creator?.username || row?.creator?.email || null,
    commitSha: meta.githubCommitSha || null,
    commitRef: meta.githubCommitRef || null,
    commitMessage: meta.githubCommitMessage || null,
    commitAuthor: meta.githubCommitAuthorName || meta.githubCommitAuthorLogin || null,
    inspectorUrl: row?.inspectorUrl || null,
  };
}

function unverified(source, error = null) {
  return {
    status: "unverified",
    source,
    checkedAt: new Date().toISOString(),
    deployments: [],
    error,
  };
}

export default async function loadVercelDeploymentHistory({ limit = DEFAULT_LIMIT } = {}) {
  const token = configuredToken();
  const projectId = process.env.AVANTIQO_VERCEL_PROJECT_ID || DEFAULT_PROJECT_ID;
  const teamId = process.env.AVANTIQO_VERCEL_TEAM_ID || DEFAULT_TEAM_ID;

  if (!token) {
    return unverified("VERCEL_DEPLOYMENT_API_TOKEN_NOT_CONFIGURED");
  }

  const params = new URLSearchParams({
    projectId,
    teamId,
    target: "production",
    limit: String(Math.max(1, Math.min(Number(limit) || DEFAULT_LIMIT, 100))),
  });

  try {
    const response = await fetch(`https://api.vercel.com/v6/deployments?${params.toString()}`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
      cache: "no-store",
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      return unverified(
        "VERCEL_DEPLOYMENT_API_REQUEST_FAILED",
        `Vercel deployment API returned ${response.status}${body ? `: ${body.slice(0, 240)}` : ""}`,
      );
    }

    const body = await response.json();
    const deployments = Array.isArray(body?.deployments)
      ? body.deployments.map(normalizeDeployment)
      : [];

    return {
      status: "verified",
      source: "VERCEL_DEPLOYMENT_API",
      checkedAt: new Date().toISOString(),
      projectId,
      teamId,
      deployments,
    };
  } catch (error) {
    return unverified(
      "VERCEL_DEPLOYMENT_API_EXCEPTION",
      error?.message || "Vercel deployment history probe failed",
    );
  }
}
