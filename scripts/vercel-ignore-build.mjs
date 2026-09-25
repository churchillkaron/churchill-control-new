// Vercel Ignored Build Step must remain constant-time and side-effect free.
// All certification, diagnostics, benchmarks, probes, and cleanup run locally before release.
const FINAL_BUILD_MARKER = "[deploy-production-final]";
const commitMessage = String(process.env.VERCEL_GIT_COMMIT_MESSAGE || "").toLowerCase();
const explicitFinalRelease = commitMessage.includes(FINAL_BUILD_MARKER);
console.log(`VERCEL_GIT_COMMIT_MESSAGE=${commitMessage || "(empty)"}`);
console.log(`VERCEL_BUILD=${explicitFinalRelease ? "RUN" : "SKIP"} reason=${explicitFinalRelease ? "explicit-final-production-release" : "production-locked-until-final-release"}`);
process.exit(explicitFinalRelease ? 1 : 0);
