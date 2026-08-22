// Hard production build gate.
// Ordinary commits to main MUST NOT consume Vercel production build minutes.
// Only an explicit final-release commit may build production.
// Optional certification/diagnostic markers run only the checks they own.
import { spawnSync } from "node:child_process";

const FINAL_BUILD_MARKER = "[deploy-production-final]";
const FINANCE_AUDIT_MARKER = "[finance-closeout-audit]";
const INTELLIGENCE_AUDIT_MARKER = "[certify-avantiqo-intelligence]";
const INTELLIGENCE_DIAGNOSTIC_MARKER = "[diagnose-avantiqo-intelligence]";
const INTELLIGENCE_AUDIT_TIMEOUT_MS = 60000;
const INTELLIGENCE_PROFILE_TIMEOUT_MS = 30000;
const INTELLIGENCE_DIAGNOSTIC_TIMEOUT_MS = 210000;

const commitMessage = String(
  process.env.VERCEL_GIT_COMMIT_MESSAGE || "",
).toLowerCase();

const hasFinalBuildMarker = commitMessage.includes(FINAL_BUILD_MARKER);
const hasFinanceAuditMarker = commitMessage.includes(FINANCE_AUDIT_MARKER);
const hasIntelligenceAuditMarker = commitMessage.includes(INTELLIGENCE_AUDIT_MARKER);
const hasIntelligenceDiagnosticMarker = commitMessage.includes(INTELLIGENCE_DIAGNOSTIC_MARKER);

console.log(`VERCEL_GIT_COMMIT_MESSAGE=${commitMessage || "(empty)"}`);

function runAudit(script, label = "RELEASE_AUDIT", timeout = undefined) {
  console.log(`${label} script=${script} state=STARTED`);
  const audit = spawnSync(process.execPath, [script], {
    cwd: process.cwd(),
    stdio: "inherit",
    ...(Number.isFinite(Number(timeout)) ? { timeout: Number(timeout) } : {}),
  });

  const timedOut = Boolean(audit.error && audit.error.code === "ETIMEDOUT");
  const passed = audit.status === 0 && !timedOut;
  console.log(
    `${label} script=${script} result=${passed ? "PASS" : "FAIL"} exit=${audit.status ?? "unknown"} timed_out=${timedOut}`,
  );
  return passed;
}

function runDiagnostic(script, label = "RELEASE_DIAGNOSTIC", timeout = undefined) {
  console.log(`${label} script=${script} state=STARTED`);
  const result = spawnSync(process.execPath, [script], {
    cwd: process.cwd(),
    stdio: "inherit",
    ...(Number.isFinite(Number(timeout)) ? { timeout: Number(timeout) } : {}),
  });
  const timedOut = Boolean(result.error && result.error.code === "ETIMEDOUT");
  const passed = result.status === 0 && !timedOut;
  console.log(
    `${label} script=${script} result=${passed ? "PASS" : "UNAVAILABLE"} exit=${result.status ?? "unknown"} timed_out=${timedOut}`,
  );
  return passed;
}

if (hasFinanceAuditMarker) {
  const closeoutPassed = runAudit(
    "scripts/finance-closeout-audit.mjs",
    "FINANCE_AUDIT",
  );
  const regressionPassed = closeoutPassed
    ? runAudit(
        "scripts/finance-closeout-regression-audit.mjs",
        "FINANCE_AUDIT",
      )
    : false;

  if (!closeoutPassed || !regressionPassed) {
    console.log("VERCEL_BUILD=SKIP reason=finance-certification-failed");
    process.exit(0);
  }

  console.log("FINANCE_CLOSEOUT_AUDIT=PASS");
}

if (hasIntelligenceDiagnosticMarker) {
  const diagnosticPassed = runDiagnostic(
    "scripts/avantiqo-intelligence-coldstart-diagnostic.mjs",
    "AVANTIQO_INTELLIGENCE_COLDSTART_DIAGNOSTIC",
    INTELLIGENCE_DIAGNOSTIC_TIMEOUT_MS,
  );
  console.log(
    `VERCEL_BUILD=SKIP reason=avantiqo-intelligence-diagnostic-only diagnostic_passed=${diagnosticPassed}`,
  );
  process.exit(0);
}

if (hasIntelligenceAuditMarker) {
  if (!hasFinalBuildMarker) {
    console.log(
      "VERCEL_BUILD=SKIP reason=intelligence-certification-requires-final-release-marker",
    );
    process.exit(0);
  }

  // This diagnostic never authorizes the build. It exposes only sanitized
  // endpoint/GPU economics and never prints the API key or endpoint ID.
  runDiagnostic(
    "scripts/avantiqo-intelligence-runpod-profile.mjs",
    "AVANTIQO_INTELLIGENCE_PROFILE",
    INTELLIGENCE_PROFILE_TIMEOUT_MS,
  );

  const intelligencePassed = runAudit(
    "scripts/avantiqo-intelligence-release-audit.mjs",
    "AVANTIQO_INTELLIGENCE_AUDIT",
    INTELLIGENCE_AUDIT_TIMEOUT_MS,
  );
  if (!intelligencePassed) {
    console.log(
      "VERCEL_BUILD=SKIP reason=avantiqo-intelligence-runtime-not-certified",
    );
    process.exit(0);
  }

  console.log("AVANTIQO_INTELLIGENCE_CERTIFICATION=PASS");
}

// Vercel convention:
// exit 0 = cancel/skip this build
// exit 1 = continue with the build
if (hasFinalBuildMarker) {
  console.log("VERCEL_BUILD=RUN reason=explicit-final-production-release");
  process.exit(1);
}

console.log(
  "VERCEL_BUILD=SKIP reason=production-locked-until-final-release",
);
process.exit(0);
