import { execFileSync } from "node:child_process";

function git(args) {
  return execFileSync("git", args, { encoding: "utf8" }).trim();
}

function fail(message) {
  console.error(`RELEASE_SAFETY_FAIL ${message}`);
  process.exitCode = 1;
}

const branch = process.env.GITHUB_HEAD_REF || git(["branch", "--show-current"]);
const inPullRequest = Boolean(process.env.GITHUB_BASE_REF);

if (!inPullRequest && branch === "main") {
  fail("normal development must not run as a mutable mission on main");
}

if (branch && branch !== "main" && !/^(work|hotfix|release)\//.test(branch)) {
  fail(`branch ${branch} is outside the allowed bounded mission namespaces`);
}

const baseRef = process.env.GITHUB_BASE_REF ? `origin/${process.env.GITHUB_BASE_REF}` : "origin/main";
let changed = [];
let status = [];
try {
  changed = git(["diff", "--name-only", `${baseRef}...HEAD`]).split("\n").filter(Boolean);
  status = git(["diff", "--name-status", `${baseRef}...HEAD`]).split("\n").filter(Boolean);
} catch (error) {
  fail(`unable to calculate change scope against ${baseRef}: ${error.message}`);
}

const forbiddenSecretFiles = changed.filter((path) => /^\.env($|\.)/.test(path));
if (forbiddenSecretFiles.length) {
  fail(`environment/secret files must never be committed: ${forbiddenSecretFiles.join(", ")}`);
}

const deletedContracts = status
  .filter((line) => line.startsWith("D\t"))
  .map((line) => line.slice(2))
  .filter((path) => /^tests\/.*contract\.test\.mjs$/.test(path));
if (deletedContracts.length) {
  fail(`contract tests may not be deleted in an ordinary mission: ${deletedContracts.join(", ")}`);
}

const protectedArchitecture = changed.filter((path) =>
  path === "app/providers/BusinessContextProvider.jsx" ||
  path === "app/api/session/bootstrap/route.js" ||
  path.startsWith("lib/platform/registry/") ||
  path.startsWith("lib/creative/registry/") ||
  path.startsWith("supabase/migrations/")
);
const changedContractTests = changed.filter((path) => /^tests\/.*contract\.test\.mjs$/.test(path));
if (protectedArchitecture.length && changedContractTests.length === 0) {
  fail(
    `protected architecture changed without a contract test. Protected files: ${protectedArchitecture.join(", ")}`,
  );
}

if (changed.length > 0) {
  console.log(`RELEASE_SAFETY branch=${branch} changed_files=${changed.length}`);
}
console.log("RELEASE_SAFETY_PASS repository mission boundaries are intact");
