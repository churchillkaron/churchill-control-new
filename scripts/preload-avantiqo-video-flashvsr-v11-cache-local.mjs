import { mkdtemp, readFile, rm } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

import { videoPodCandidateSnapshot } from "../lib/platform/service-runtime/providers/avantiqo-video/AvantiqoVideoPodRunpod.js";

const CONTRACT = "AVANTIQO_VIDEO_FLASHVSR_CACHE_PRELOAD_V1";
const APPROVAL = "AVANTIQO_VIDEO_FLASHVSR_CACHE_PRELOAD_APPROVED";
const HELPER = "scripts/preload-avantiqo-video-flashvsr-v11-cache-helper.py";
const S3_ENDPOINT = "https://s3api-eu-ro-1.runpod.io/";
const S3_REGION = "EU-RO-1";
const S3_BUCKET = "t4erb6kxi1";
const S3_VOLUME = "avantiqo-video-cache-eu-ro-1";

const text = (value) => String(value ?? "").trim();
const approved = (value) => ["YES", "TRUE", "1", "APPROVED", "ON"].includes(text(value).toUpperCase());

function parseAwsCredentials(raw) {
  const profiles = new Map();
  let current = null;
  for (const sourceLine of String(raw || "").split(/\r?\n/)) {
    const line = sourceLine.trim();
    if (!line || line.startsWith("#") || line.startsWith(";")) continue;
    const section = line.match(/^\[([^\]]+)\]$/);
    if (section) {
      current = section[1].trim();
      if (!profiles.has(current)) profiles.set(current, {});
      continue;
    }
    if (!current) continue;
    const equals = line.indexOf("=");
    if (equals < 1) continue;
    profiles.get(current)[line.slice(0, equals).trim().toLowerCase()] = line.slice(equals + 1).trim();
  }
  return profiles;
}

async function resolveS3Credential() {
  const runpodAccess = text(process.env.RUNPOD_S3_ACCESS_KEY_ID || process.env.RUNPOD_S3_ACCESS_KEY);
  const runpodSecret = text(process.env.RUNPOD_S3_SECRET_ACCESS_KEY || process.env.RUNPOD_S3_SECRET_KEY);
  if (runpodAccess && runpodSecret) {
    return { accessKey: runpodAccess, secretKey: runpodSecret, source: "RUNPOD_S3_ENV" };
  }

  const awsAccess = text(process.env.AWS_ACCESS_KEY_ID);
  const awsSecret = text(process.env.AWS_SECRET_ACCESS_KEY);
  if (awsAccess && awsSecret) {
    return { accessKey: awsAccess, secretKey: awsSecret, source: "AWS_ENV" };
  }

  const raw = await readFile(join(homedir(), ".aws", "credentials"), "utf8").catch(() => "");
  const profiles = parseAwsCredentials(raw);
  const candidates = [...profiles.entries()]
    .map(([name, profile]) => ({
      name,
      accessKey: text(profile.aws_access_key_id),
      secretKey: text(profile.aws_secret_access_key),
    }))
    .filter((entry) => entry.accessKey && entry.secretKey);

  const requested = text(process.env.AWS_PROFILE || process.env.AWS_DEFAULT_PROFILE || "default");
  const selected = candidates.find((entry) => entry.name === requested);
  if (selected) {
    return { accessKey: selected.accessKey, secretKey: selected.secretKey, source: `AWS_CREDENTIALS_FILE:${requested}` };
  }

  const shaped = candidates.filter((entry) => entry.accessKey.startsWith("user_") && entry.secretKey.startsWith("rps_"));
  if (shaped.length === 1) {
    return { accessKey: shaped[0].accessKey, secretKey: shaped[0].secretKey, source: `AWS_CREDENTIALS_FILE:${shaped[0].name}` };
  }
  if (shaped.length > 1) throw new Error("AVANTIQO_VIDEO_FLASHVSR_MULTIPLE_RUNPOD_S3_PROFILES_SET_AWS_PROFILE");
  return { accessKey: "", secretKey: "", source: null };
}

if (Number(process.versions.node.split(".")[0]) < 20) throw new Error(`AVANTIQO_VIDEO_FLASHVSR_NODE20_REQUIRED:${process.version}`);
const apply = process.argv.includes("--apply");
if (apply && !approved(process.env[APPROVAL])) throw new Error(`${APPROVAL}=YES_REQUIRED`);

const snapshot = await videoPodCandidateSnapshot();
if (text(snapshot.volume?.id) !== S3_BUCKET || text(snapshot.volume?.name) !== S3_VOLUME) {
  throw new Error("AVANTIQO_VIDEO_FLASHVSR_CACHE_VOLUME_INVALID");
}
const credential = await resolveS3Credential();
console.log(JSON.stringify({
  success: true,
  contract: CONTRACT,
  mode: apply ? "APPLY" : "PLAN",
  volume_id: S3_BUCKET,
  volume_name: S3_VOLUME,
  data_center_id: S3_REGION,
  s3_endpoint: S3_ENDPOINT,
  s3_credentials_present: Boolean(credential.accessKey && credential.secretKey),
  s3_credential_source: credential.source,
  accepted_s3_env_shapes: [
    "RUNPOD_S3_ACCESS_KEY_ID + RUNPOD_S3_SECRET_ACCESS_KEY",
    "RUNPOD_S3_ACCESS_KEY + RUNPOD_S3_SECRET_KEY",
    "AWS_ACCESS_KEY_ID + AWS_SECRET_ACCESS_KEY",
    "~/.aws/credentials",
  ],
  flashvsr_repo: "JunhaoZhuang/FlashVSR-v1.1",
  flashvsr_revision: "a258bf2d58ac5a7d7193fb6ce4326aaff98ea6cb",
  required_weight_files: 3,
  gpu_compute_used: false,
  runpod_pod_created: false,
  generation_submitted: false,
  production_deploy_performed: false,
  secrets_printed: false,
}, null, 2));

if (!apply) {
  console.log("AVANTIQO_VIDEO_FLASHVSR_CACHE_PRELOAD_APPLIED=false");
  process.exit(0);
}
if (!credential.accessKey || !credential.secretKey) throw new Error("AVANTIQO_VIDEO_FLASHVSR_S3_CREDENTIAL_REQUIRED");

const dir = await mkdtemp(join(tmpdir(), "avantiqo-video-flashvsr-preload-"));
try {
  const venv = join(dir, "venv");
  let result = spawnSync("python3", ["-m", "venv", venv], { cwd: process.cwd(), env: process.env, stdio: "inherit" });
  if (result.status !== 0) throw new Error(`AVANTIQO_VIDEO_FLASHVSR_VENV_FAILED:${result.status}`);
  const python = join(venv, "bin", "python");
  result = spawnSync(python, ["-m", "pip", "install", "--quiet", "boto3>=1.34,<2", "huggingface_hub==0.34.4"], { cwd: process.cwd(), env: process.env, stdio: "inherit" });
  if (result.status !== 0) throw new Error(`AVANTIQO_VIDEO_FLASHVSR_DEPENDENCY_INSTALL_FAILED:${result.status}`);
  result = spawnSync(python, [HELPER], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      AVANTIQO_FLASHVSR_S3_ENDPOINT: S3_ENDPOINT,
      AVANTIQO_FLASHVSR_S3_REGION: S3_REGION,
      AVANTIQO_FLASHVSR_S3_BUCKET: S3_BUCKET,
      AVANTIQO_FLASHVSR_S3_ACCESS_KEY: credential.accessKey,
      AVANTIQO_FLASHVSR_S3_SECRET_KEY: credential.secretKey,
    },
    stdio: "inherit",
  });
  if (result.status !== 0) throw new Error(`AVANTIQO_VIDEO_FLASHVSR_HELPER_FAILED:${result.status}`);
  console.log("AVANTIQO_VIDEO_FLASHVSR_CACHE_PRELOAD_APPLIED=true");
} finally {
  await rm(dir, { recursive: true, force: true });
}
