import { spawnSync } from "node:child_process";
import { writeFileSync, unlinkSync } from "node:fs";
import { pathToFileURL } from "node:url";

const CONTRACT = "AVANTIQO_CODE_EPHEMERAL_POD_GENERATION_PROOF_V3_RELEASE_LAUNCHER";
const SOURCE_PATH = "scripts/run-avantiqo-code-ephemeral-pod-generation-proof-v3-local.mjs";
const OLD_RELEASE_SHA = "0ae554d2cee35b16a9e94af5d957d85b07995945";
const RELEASE_SHA = "4e163cb3d476577a003cb67df264cc67b5c31d4f";
const RELEASE_TAG = `sha-${RELEASE_SHA.slice(0, 12)}`;
const IMAGE_REPOSITORY_PATH = "churchillkaron/avantiqo-code-pod";
const IMAGE_READY_TIMEOUT_MS = 30 * 60_000;
const IMAGE_READY_POLL_MS = 15_000;

const text = (value) => String(value ?? "").trim();
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

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

async function ghcrToken() {
  const url = new URL("https://ghcr.io/token");
  url.searchParams.set("service", "ghcr.io");
  url.searchParams.set("scope", `repository:${IMAGE_REPOSITORY_PATH}:pull`);
  const response = await fetch(url, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(30_000),
  });
  const raw = await response.text();
  let body = null;
  try { body = raw ? JSON.parse(raw) : null; } catch { body = null; }
  if (!response.ok) {
    throw new Error(`${CONTRACT}_GHCR_TOKEN_HTTP_${response.status}:${text(body?.message || raw).slice(0, 500)}`);
  }
  const token = text(body?.token || body?.access_token);
  if (!token) throw new Error(`${CONTRACT}_GHCR_TOKEN_MISSING`);
  return token;
}

async function releaseImageReady(token) {
  const response = await fetch(
    `https://ghcr.io/v2/${IMAGE_REPOSITORY_PATH}/manifests/${encodeURIComponent(RELEASE_TAG)}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.oci.image.index.v1+json, application/vnd.oci.image.manifest.v1+json, application/vnd.docker.distribution.manifest.list.v2+json, application/vnd.docker.distribution.manifest.v2+json",
      },
      signal: AbortSignal.timeout(30_000),
    },
  );
  if (response.status === 404) return null;
  const raw = await response.text();
  if (!response.ok) {
    throw new Error(`${CONTRACT}_GHCR_MANIFEST_HTTP_${response.status}:${raw.slice(0, 500)}`);
  }
  const digest = text(response.headers.get("docker-content-digest")).toLowerCase();
  if (!/^sha256:[a-f0-9]{64}$/.test(digest)) {
    throw new Error(`${CONTRACT}_GHCR_IMMUTABLE_DIGEST_INVALID:${digest}`);
  }
  return digest;
}

async function waitForReleaseImage() {
  const token = await ghcrToken();
  const started = Date.now();
  let pollCount = 0;
  while (Date.now() - started < IMAGE_READY_TIMEOUT_MS) {
    pollCount += 1;
    const digest = await releaseImageReady(token);
    if (digest) {
      console.log(`${CONTRACT}_IMAGE_READY=true`);
      console.log(`${CONTRACT}_IMMUTABLE_DIGEST=${digest}`);
      return digest;
    }
    console.log(JSON.stringify({
      event: "AVANTIQO_CODE_V3_RELEASE_PROGRESS",
      phase: "IMAGE_PUBLICATION_WAIT",
      release_tag: RELEASE_TAG,
      poll_count: pollCount,
      pod_created: false,
      inference_performed: false,
      secrets_printed: false,
    }));
    await sleep(IMAGE_READY_POLL_MS);
  }
  throw new Error(`${CONTRACT}_IMAGE_PUBLICATION_TIMEOUT:${RELEASE_TAG}`);
}

console.log(`${CONTRACT}_MODE=APPLY_ONLY`);
console.log(`${CONTRACT}_RELEASE_SHA=${RELEASE_SHA}`);
console.log(`${CONTRACT}_RELEASE_TAG=${RELEASE_TAG}`);
console.log(`${CONTRACT}_WORKING_TREE_MUTATION=false`);
console.log(`${CONTRACT}_POD_CREATED_BEFORE_IMAGE_READY=false`);
console.log(`${CONTRACT}_SECRETS_PRINTED=false`);

await waitForReleaseImage();

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
