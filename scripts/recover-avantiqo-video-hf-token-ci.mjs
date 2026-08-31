import { appendFile } from "node:fs/promises";

const REST_BASE = "https://rest.runpod.io/v1";
const TOKEN_KEYS = Object.freeze([
  "HF_TOKEN",
  "HUGGING_FACE_HUB_TOKEN",
  "HUGGINGFACE_HUB_TOKEN",
  "HUGGING_FACE_HUB_ACCESS_TOKEN",
]);

const text = (value) => String(value ?? "").trim();
const object = (value) => value && typeof value === "object" && !Array.isArray(value) ? value : {};

function normalizeEnv(value) {
  if (Array.isArray(value)) {
    return Object.fromEntries(
      value
        .map((entry) => [text(entry?.key || entry?.name), String(entry?.value ?? "")])
        .filter(([key]) => Boolean(key)),
    );
  }
  return Object.fromEntries(Object.entries(object(value)).map(([key, child]) => [String(key), String(child ?? "")]));
}

function normalizeList(value, keys = [], depth = 0) {
  if (Array.isArray(value)) return value;
  if (!value || typeof value !== "object" || depth > 4) return null;
  for (const key of [...keys, "data", "items", "results"]) {
    if (!Object.prototype.hasOwnProperty.call(value, key)) continue;
    const found = normalizeList(value[key], keys, depth + 1);
    if (found) return found;
  }
  return null;
}

function normalizeToken(value) {
  const raw = text(value).replace(/^Bearer\s+/i, "");
  if (!/^hf_[A-Za-z0-9_-]{20,}$/.test(raw)) return "";
  return raw;
}

async function readJson(response, label) {
  const raw = await response.text();
  let body = null;
  try { body = raw ? JSON.parse(raw) : null; } catch {}
  if (!response.ok) {
    const detail = text(body?.message || body?.error || body?.detail || raw).slice(0, 500);
    throw new Error(`${label}_HTTP_${response.status}:${detail || "EMPTY_BODY"}`);
  }
  return body ?? {};
}

async function rest(pathname, key) {
  return readJson(await fetch(`${REST_BASE}${pathname}`, {
    headers: { Authorization: `Bearer ${key}`, Accept: "application/json" },
    signal: AbortSignal.timeout(30_000),
  }), "AVANTIQO_VIDEO_HF_TOKEN_RECOVERY_REST");
}

function sourceScore(template) {
  const haystack = [
    template?.name,
    template?.imageName,
    template?.image,
    template?.containerImage,
    template?.dockerImage,
  ].map(text).join(" ").toLowerCase();
  let score = 0;
  if (haystack.includes("avantiqo")) score += 20;
  if (haystack.includes("video")) score += 20;
  if (haystack.includes("ltx")) score += 30;
  if (haystack.includes("cinema")) score += 15;
  return score;
}

function continueWithCacheCheck(reason) {
  console.log(`AVANTIQO_VIDEO_HF_TOKEN_RECOVERY=${reason}_CACHE_CHECK_WILL_DECIDE`);
}

if (Number(process.versions.node.split(".")[0]) < 24) {
  throw new Error(`AVANTIQO_VIDEO_HF_TOKEN_RECOVERY_NODE24_REQUIRED:${process.version}`);
}

const githubEnv = text(process.env.GITHUB_ENV);
if (!githubEnv) throw new Error("AVANTIQO_VIDEO_HF_TOKEN_RECOVERY_GITHUB_ENV_REQUIRED");

let recovered = normalizeToken(process.env.HF_TOKEN_SECRET);
let source = recovered ? { kind: "github-actions", id: "HF_TOKEN", name: "HF_TOKEN", key: "HF_TOKEN" } : null;

if (!recovered) {
  const managementKey = text(process.env.RUNPOD_MANAGEMENT_API_KEY || process.env.RUNPOD_API_KEY);
  if (!managementKey) {
    continueWithCacheCheck("NOT_AVAILABLE");
    process.exit(0);
  }

  let templates = null;
  try {
    const raw = await rest("/templates?includeEndpointBoundTemplates=true&includePublicTemplates=false&includeRunpodTemplates=false", managementKey);
    templates = normalizeList(raw, ["templates"]);
  } catch {
    continueWithCacheCheck("LOOKUP_UNAVAILABLE");
    process.exit(0);
  }

  if (!templates) {
    continueWithCacheCheck("TEMPLATE_LIST_INVALID");
    process.exit(0);
  }

  const candidates = [];
  for (const template of templates) {
    const env = normalizeEnv(template?.env);
    for (const key of TOKEN_KEYS) {
      const token = normalizeToken(env[key]);
      if (!token) continue;
      candidates.push({
        token,
        key,
        score: sourceScore(template),
        id: text(template?.id) || "unknown-template",
        name: text(template?.name) || "unnamed-template",
      });
    }
  }

  candidates.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
  const winner = candidates[0];
  if (!winner) {
    continueWithCacheCheck("NOT_FOUND");
    process.exit(0);
  }
  recovered = winner.token;
  source = { kind: "runpod-template", id: winner.id, name: winner.name, key: winner.key };
}

console.log(`::add-mask::${recovered}`);
await appendFile(githubEnv, `HF_TOKEN=${recovered}\n`, { encoding: "utf8", mode: 0o600 });
console.log(`AVANTIQO_VIDEO_HF_TOKEN_RECOVERY_SOURCE=${source.kind}:${source.id}:${source.name}:${source.key}`);
console.log("AVANTIQO_VIDEO_HF_TOKEN_RECOVERY=PASS");
