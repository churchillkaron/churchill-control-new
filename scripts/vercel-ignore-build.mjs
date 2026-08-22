// Hard production build gate.
// Ordinary commits to main MUST NOT consume Vercel production build minutes.
// Only an explicit final-release commit may build production.
// Finance closeout audit marker may execute certification without deploying.
import { spawnSync } from "node:child_process";

const FINAL_BUILD_MARKER = "[deploy-production-final]";
const FINANCE_AUDIT_MARKER = "[finance-closeout-audit]";

const commitMessage = String(
  process.env.VERCEL_GIT_COMMIT_MESSAGE || "",
).toLowerCase();

const hasFinalBuildMarker = commitMessage.includes(FINAL_BUILD_MARKER);
const hasFinanceAuditMarker = commitMessage.includes(FINANCE_AUDIT_MARKER);

console.log(`VERCEL_GIT_COMMIT_MESSAGE=${commitMessage || "(empty)"}`);

if (hasFinanceAuditMarker) {
  const audit = spawnSync(process.execPath, ["scripts/finance-closeout-audit.mjs"], {
    cwd: process.cwd(),
    encoding: "utf8",
  });

  if (audit.stdout) process.stdout.write(audit.stdout);
  if (audit.stderr) process.stderr.write(audit.stderr);

  console.log(
    `FINANCE_CLOSEOUT_AUDIT=${audit.status === 0 ? "PASS" : "FAIL"} exit=${audit.status ?? "unknown"}`,
  );
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
