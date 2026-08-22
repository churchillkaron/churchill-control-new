// Hard production build gate.
// Ordinary commits to main MUST NOT consume Vercel production build minutes.
// Only an explicit final-release commit may build production.
// Finance closeout audit marker executes certification before the final release.
import { spawnSync } from "node:child_process";

const FINAL_BUILD_MARKER = "[deploy-production-final]";
const FINANCE_AUDIT_MARKER = "[finance-closeout-audit]";

const commitMessage = String(
  process.env.VERCEL_GIT_COMMIT_MESSAGE || "",
).toLowerCase();

const hasFinalBuildMarker = commitMessage.includes(FINAL_BUILD_MARKER);
const hasFinanceAuditMarker = commitMessage.includes(FINANCE_AUDIT_MARKER);

console.log(`VERCEL_GIT_COMMIT_MESSAGE=${commitMessage || "(empty)"}`);

function runAudit(script, label = "RELEASE_AUDIT") {
  const audit = spawnSync(process.execPath, [script], {
    cwd: process.cwd(),
    encoding: "utf8",
  });

  if (audit.stdout) process.stdout.write(audit.stdout);
  if (audit.stderr) process.stderr.write(audit.stderr);

  const passed = audit.status === 0;
  console.log(
    `${label} script=${script} result=${passed ? "PASS" : "FAIL"} exit=${audit.status ?? "unknown"}`,
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

// Vercel convention:
// exit 0 = cancel/skip this build
// exit 1 = continue with the build
if (hasFinalBuildMarker) {
  const intelligencePassed = runAudit(
    "scripts/avantiqo-intelligence-release-audit.mjs",
    "AVANTIQO_INTELLIGENCE_AUDIT",
  );
  if (!intelligencePassed) {
    console.log(
      "VERCEL_BUILD=SKIP reason=avantiqo-intelligence-runtime-not-certified",
    );
    process.exit(0);
  }

  console.log("VERCEL_BUILD=RUN reason=explicit-final-production-release");
  process.exit(1);
}

console.log(
  "VERCEL_BUILD=SKIP reason=production-locked-until-final-release",
);
process.exit(0);
