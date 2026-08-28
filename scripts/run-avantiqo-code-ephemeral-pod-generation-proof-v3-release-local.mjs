import { spawnSync } from "node:child_process";
import { writeFileSync, unlinkSync } from "node:fs";
import { pathToFileURL } from "node:url";

const CONTRACT = "AVANTIQO_CODE_EPHEMERAL_POD_GENERATION_PROOF_V3_RELEASE_LAUNCHER";
const SOURCE_PATH = "scripts/run-avantiqo-code-ephemeral-pod-generation-proof-v3-local.mjs";
const OLD_RELEASE_SHA = "0ae554d2cee35b16a9e94af5d957d85b07995945";
const RELEASE_SHA = "4e163cb3d476577a003cb67df264cc67b5c31d4f";
const RELEASE_TAG = `sha-${RELEASE_SHA.slice(0, 12)}`;

const text = (value) => String(value ?? "").trim();

function git(args, code) {
  const result = spawnSync("git", args, {
    cwd: process.cwd(),
    encoding: "utf8",
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.status !== 0) {
    throw new Error(`${code}:${text(result.stderr || result.stdout).slice(0, 1200) || `exit=${result.status}`}`);
  }
  return String(result.stdout || "");
}

console.log(`${CONTRACT}_MODE=APPLY_ONLY`);
console.log(`${CONTRACT}_RELEASE_SHA=${RELEASE_SHA}`);
console.log(`${CONTRACT}_RELEASE_TAG=${RELEASE_TAG}`);
console.log(`${CONTRACT}_WORKING_TREE_MUTATION=false`);
console.log(`${CONTRACT}_SECRETS_PRINTED=false`);

git(["fetch", "origin", "main"], `${CONTRACT}_GIT_FETCH_FAILED`);
const source = git(["show", `origin/main:${SOURCE_PATH}`], `${CONTRACT}_SOURCE_READ_FAILED`);
if (!source.includes(OLD_RELEASE_SHA)) {
  throw new Error(`${CONTRACT}_EXPECTED_OLD_RELEASE_SHA_MISSING:${OLD_RELEASE_SHA}`);
}
const transformed = source.replaceAll(OLD_RELEASE_SHA, RELEASE_SHA);
if (transformed.includes(OLD_RELEASE_SHA) || !transformed.includes(RELEASE_SHA)) {
  throw new Error(`${CONTRACT}_RELEASE_TRANSFORM_FAILED`);
}
const tempPath = `/tmp/avantiqo-code-v3-release-${process.pid}.mjs`;
writeFileSync(tempPath, transformed, "utf8");
try {
  await import(`${pathToFileURL(tempPath).href}?v=${Date.now()}`);
  console.log(`${CONTRACT}_PASS=true`);
} finally {
  try { unlinkSync(tempPath); } catch {}
}
