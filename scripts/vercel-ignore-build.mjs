const BUILD_MARKERS = Object.freeze([
  "[vercel-build]",
  "[deploy-production]",
]);

const commitMessage = String(
  process.env.VERCEL_GIT_COMMIT_MESSAGE || "",
).toLowerCase();

const forceBuild = String(
  process.env.FORCE_VERCEL_BUILD || "",
).toLowerCase();

const hasBuildMarker = BUILD_MARKERS.some((marker) => (
  commitMessage.includes(marker)
));

const hasForceFlag = ["1", "true", "yes"].includes(forceBuild);

console.log(`VERCEL_GIT_COMMIT_MESSAGE=${commitMessage || "(empty)"}`);

// Vercel convention:
// exit 0 = cancel/skip this build
// exit 1 = continue with the build
if (hasBuildMarker || hasForceFlag) {
  console.log(
    hasBuildMarker
      ? "VERCEL_BUILD=RUN reason=explicit-commit-marker"
      : "VERCEL_BUILD=RUN reason=force-environment-flag",
  );
  process.exit(1);
}

console.log(
  "VERCEL_BUILD=SKIP reason=no-explicit-production-build-request",
);
process.exit(0);
