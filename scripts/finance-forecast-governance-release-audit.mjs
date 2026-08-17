import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();

const FILES = Object.freeze({
  policy: "lib/finance/budgeting/runtime/ForecastGovernanceControlPolicy.js",
  auditPack: "lib/finance/budgeting/capabilities/buildForecastGovernanceAuditPack.js",
  dashboard: "lib/finance/budgeting/capabilities/buildForecastGovernanceDashboardReport.js",
  repository: "lib/finance/budgeting/repositories/ForecastGovernanceAuditRepository.js",
  api: "app/api/finance/forecast/governance/audit-pack/route.js",
  ui: "components/workspace/engines/FinanceForecastGovernanceDashboardEngine.jsx",
  closureMigration: "supabase/migrations/20260817123000_finance_forecast_override_review_closure_assurance.sql",
});

function read(relativePath) {
  const absolutePath = path.join(ROOT, relativePath);
  if (!fs.existsSync(absolutePath)) {
    throw new Error(`Missing forecast governance release file: ${relativePath}`);
  }
  return fs.readFileSync(absolutePath, "utf8");
}

function requireMatch(source, pattern, label) {
  if (!pattern.test(source)) {
    throw new Error(`${label} is missing a required forecast governance contract`);
  }
}

function requireNoMatch(source, pattern, label) {
  if (pattern.test(source)) {
    throw new Error(`${label} contains a forbidden forecast governance contract`);
  }
}

const source = Object.fromEntries(
  Object.entries(FILES).map(([key, relativePath]) => [key, read(relativePath)])
);

for (const code of [
  "REVIEW_CASE_MISSING",
  "REVIEW_NOT_RESOLVED",
  "OWNER_MISSING",
  "ACKNOWLEDGEMENT_MISSING",
  "RESOLUTION_ACTOR_MISSING",
  "RESOLUTION_TIME_MISSING",
  "RESOLUTION_EVIDENCE_MISSING",
  "CLOSURE_AUDIT_MISSING",
]) {
  requireMatch(source.policy, new RegExp(code), `Governance control ${code}`);
}

requireNoMatch(
  source.policy,
  /DUE_DATE_MISSING|due_date/,
  "Governance completion policy due-date dependency"
);
requireMatch(
  source.auditPack,
  /forecastGovernanceControlStatus/,
  "Audit pack shared governance policy"
);
requireMatch(
  source.dashboard,
  /forecastGovernanceControlStatus/,
  "Dashboard shared governance policy"
);
requireMatch(
  source.repository,
  /FORECAST_OVERRIDE_REVIEW_CLOSED/,
  "Audit repository protected closure evidence"
);
requireMatch(
  source.api,
  /finance\.accounting\.view/,
  "Audit pack read permission"
);
requireMatch(
  source.api,
  /buildForecastGovernanceAuditPackCommand/,
  "Audit pack application boundary"
);
requireMatch(
  source.api,
  /Cache-Control[\s\S]*no-store/,
  "Audit pack no-store response"
);
requireMatch(
  source.ui,
  /\/api\/finance\/forecast\/governance\/audit-pack/,
  "Governance dashboard audit-pack export"
);
requireMatch(
  source.ui,
  /Governance Complete[\s\S]*Governance Incomplete/,
  "Governance completeness dashboard summary"
);
requireMatch(
  source.ui,
  /const closureReady = Boolean\(review\.assigned_to && review\.acknowledged_by && review\.acknowledged_at && String\(form\.resolutionNote \|\| ""\)\.trim\(\)\)/,
  "Review resolution UI canonical prerequisites"
);
requireNoMatch(
  source.ui,
  /const closureReady = Boolean\([^\n]*review\.due_date/,
  "Review resolution UI due-date dependency"
);

for (const contract of [
  /security invoker/i,
  /FORECAST_OVERRIDE_REVIEW_CLOSED/,
  /finance_forecast_override_review_closure_guard/,
  /finance_forecast_override_review_closure_audit_protection/,
  /revoke all on function public\.finance_enforce_forecast_override_review_closure\(\) from authenticated/i,
]) {
  requireMatch(
    source.closureMigration,
    contract,
    "Forecast override review closure database assurance"
  );
}

console.log("FINANCE_FORECAST_GOVERNANCE_RELEASE_AUDIT=PASS");
console.log("FORECAST_GOVERNANCE_POLICY=SHARED_CANONICAL_CONTROL");
console.log("FORECAST_GOVERNANCE_AUDIT_PACK=PERMISSION_GUARDED_NO_STORE");
console.log("FORECAST_OVERRIDE_REVIEW_CLOSURE=DATABASE_PROTECTED");
console.log("FORECAST_OVERRIDE_REVIEW_DUE_DATE=NON_BLOCKING");
