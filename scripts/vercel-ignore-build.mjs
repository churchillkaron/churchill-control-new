import { execFileSync } from "node:child_process";

function git(args) {
  return execFileSync("git", args, {
    cwd: process.cwd(),
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

function canResolve(reference) {
  if (!reference) return false;

  try {
    git(["rev-parse", "--verify", `${reference}^{commit}`]);
    return true;
  } catch {
    return false;
  }
}

function changedFiles() {
  const current = process.env.VERCEL_GIT_COMMIT_SHA || "HEAD";
  const previous = process.env.VERCEL_GIT_PREVIOUS_SHA || null;

  const candidates = [
    previous,
    `${current}^`,
    "HEAD^",
  ].filter(Boolean);

  for (const base of candidates) {
    if (!canResolve(base) || !canResolve(current)) continue;

    try {
      const output = git(["diff", "--name-only", base, current]);
      return output ? output.split("\n").filter(Boolean) : [];
    } catch {
      // Try the next safe base reference.
    }
  }

  return null;
}

const BUILD_NEUTRAL_PATTERNS = Object.freeze([
  /^\.github\//,
  /^supabase\//,
  /^docs?\//,
  /^reports?\//,
  /^audit-results?\//,
  /^screenshots?\//,
  /(^|\/)README(?:\.[^/]+)?$/i,
  /(^|\/)CHANGELOG(?:\.[^/]+)?$/i,
  /\.md$/i,
  /\.txt$/i,
]);

function isBuildNeutral(file) {
  return BUILD_NEUTRAL_PATTERNS.some((pattern) => pattern.test(file));
}

const files = changedFiles();

// Exit 1 means Vercel must build. Fail open whenever the comparison is uncertain.
if (!files || files.length === 0) {
  console.log("VERCEL_BUILD=RUN reason=unable-to-prove-build-is-unnecessary");
  process.exit(1);
}

const relevantFiles = files.filter((file) => !isBuildNeutral(file));

console.log(`VERCEL_CHANGED_FILES=${files.length}`);
console.log(files.join("\n"));

if (relevantFiles.length === 0) {
  console.log("VERCEL_BUILD=SKIP reason=build-neutral-files-only");
  process.exit(0);
}

console.log(`VERCEL_RELEVANT_FILES=${relevantFiles.length}`);
console.log(relevantFiles.join("\n"));
console.log("VERCEL_BUILD=RUN reason=application-source-changed");
process.exit(1);
