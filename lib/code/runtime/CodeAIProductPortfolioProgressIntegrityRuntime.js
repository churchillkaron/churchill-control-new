export const CODE_AI_PRODUCT_PORTFOLIO_PROGRESS_INTEGRITY_CONTRACT =
  "AVANTIQO_CODE_AI_PRODUCT_PORTFOLIO_PROGRESS_INTEGRITY_V1";

function text(value, maximum = 1000) {
  return String(value ?? "").trim().slice(0, maximum);
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

export function assessProductPortfolioProgressIntegrity({
  node = {},
  completed_objectives = [],
  verified_commit_sha = null,
  repository_ancestry_verified = false,
} = {}) {
  const commit = text(verified_commit_sha, 160);
  const baseCommit = text(node?.base_commit, 160);
  const priorCommits = new Set(
    list(completed_objectives)
      .map((entry) => text(entry?.verified_commit_sha, 160))
      .filter(Boolean),
  );
  const blockers = [];

  if (!commit) blockers.push("PRODUCT_ENGINEERING_PORTFOLIO_VERIFIED_COMMIT_REQUIRED");
  if (commit && baseCommit && commit === baseCommit) {
    blockers.push("PRODUCT_ENGINEERING_PORTFOLIO_ZERO_REPOSITORY_PROGRESS");
  }
  if (commit && priorCommits.has(commit)) {
    blockers.push("PRODUCT_ENGINEERING_PORTFOLIO_DUPLICATE_VERIFIED_COMMIT");
  }
  if (commit && baseCommit && commit !== baseCommit && repository_ancestry_verified !== true) {
    blockers.push("PRODUCT_ENGINEERING_PORTFOLIO_REPOSITORY_ANCESTRY_REQUIRED");
  }

  return {
    contract: CODE_AI_PRODUCT_PORTFOLIO_PROGRESS_INTEGRITY_CONTRACT,
    verified: blockers.length === 0,
    verified_commit_sha: commit || null,
    engineering_base_commit: baseCommit || null,
    prior_verified_commit_reused: Boolean(commit && priorCommits.has(commit)),
    repository_ancestry_verified: repository_ancestry_verified === true,
    repository_head_advanced_from_engineering_base:
      Boolean(commit && baseCommit && commit !== baseCommit && repository_ancestry_verified === true),
    blockers,
    authorization_effect: "NONE",
  };
}

export function assertProductPortfolioProgressIntegrity(input = {}) {
  const assessment = assessProductPortfolioProgressIntegrity(input);
  if (!assessment.verified) throw new Error(assessment.blockers[0]);
  return assessment;
}

export const CodeAIProductPortfolioProgressIntegrityRuntime = Object.freeze({
  contract: CODE_AI_PRODUCT_PORTFOLIO_PROGRESS_INTEGRITY_CONTRACT,
  assess: assessProductPortfolioProgressIntegrity,
  assert: assertProductPortfolioProgressIntegrity,
});

export default CodeAIProductPortfolioProgressIntegrityRuntime;
