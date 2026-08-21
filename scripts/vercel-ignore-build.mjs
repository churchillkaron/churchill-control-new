// Hard production build gate.
// Ordinary commits to main MUST NOT consume Vercel production build minutes.
// Only an explicit final-release commit may build production.
const FINAL_BUILD_MARKER = "[deploy-production-final]";

const commitMessage = String(
  process.env.VERCEL_GIT_COMMIT_MESSAGE || "",
).toLowerCase();

const hasFinalBuildMarker = commitMessage.includes(FINAL_BUILD_MARKER);

console.log(`VERCEL_GIT_COMMIT_MESSAGE=${commitMessage || "(empty)"}`);

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
