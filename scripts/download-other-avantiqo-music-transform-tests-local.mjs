#!/usr/bin/env node

import os from "node:os";
import path from "node:path";
import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";

import { loadAvantiqoEnv } from "./load-avantiqo-env.mjs";

loadAvantiqoEnv();

const TMP = "/tmp";
const BENCHMARK_CONTRACT = "AVANTIQO_MUSIC_TRANSFORM_CERTIFICATION_BENCHMARK_V2";
const METAL_PROFILE = "DYNAMIC_METAL";
const DOWNLOADS = path.join(os.homedir(), "Downloads");

const text = (value) => String(value ?? "").trim();
function required(name) {
  const value = text(process.env[name]);
  if (!value) throw new Error(`${name}_REQUIRED`);
  return value;
}
function parseStorageReference(value) {
  const match = /^storage:\/\/([^/]+)\/(.+)$/i.exec(text(value));
  if (!match) return null;
  return { bucket: match[1], objectPath: match[2] };
}
function encodeObjectPath(bucket, objectPath) {
  return [bucket, ...text(objectPath).split("/").filter(Boolean)]
    .map((part) => encodeURIComponent(part))
    .join("/");
}
function safeName(value) {
  return text(value)
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "Music-Test";
}

const candidates = [];
for (const name of await readdir(TMP)) {
  if (!/^music-transform-.*\.json$/i.test(name)) continue;
  const reportPath = path.resolve(TMP, name);
  try {
    const report = JSON.parse(await readFile(reportPath, "utf8"));
    const storage = parseStorageReference(report?.output?.storage_reference);
    if (
      report?.contract !== BENCHMARK_CONTRACT ||
      report?.passed !== true ||
      report?.provider_jobs_submitted !== 1 ||
      !storage ||
      text(report?.source_fixture?.profile) === METAL_PROFILE
    ) continue;
    const fileStat = await stat(reportPath);
    candidates.push({ reportPath, report, storage, mtimeMs: fileStat.mtimeMs });
  } catch {
    // Ignore unrelated or incomplete temporary files.
  }
}

candidates.sort((a, b) => {
  const aTime = Date.parse(text(a.report?.generated_at));
  const bTime = Date.parse(text(b.report?.generated_at));
  if (Number.isFinite(aTime) && Number.isFinite(bTime) && aTime !== bTime) return bTime - aTime;
  return b.mtimeMs - a.mtimeMs;
});

const unique = [];
const seenJobs = new Set();
for (const candidate of candidates) {
  const jobId = text(candidate.report?.job_id) || candidate.storage.objectPath;
  if (seenJobs.has(jobId)) continue;
  seenJobs.add(jobId);
  unique.push(candidate);
  if (unique.length === 2) break;
}

if (unique.length < 2) {
  throw new Error(`AVANTIQO_MUSIC_OTHER_TESTS_NOT_FOUND:found=${unique.length}:required=2`);
}

const supabaseUrl = required("NEXT_PUBLIC_SUPABASE_URL").replace(/\/+$/, "");
const serviceRoleKey = required("SUPABASE_SERVICE_ROLE_KEY");
await mkdir(DOWNLOADS, { recursive: true });

const downloaded = [];
for (let index = 0; index < unique.length; index += 1) {
  const { report, storage, reportPath } = unique[index];
  const objectUrl = `${supabaseUrl}/storage/v1/object/${encodeObjectPath(storage.bucket, storage.objectPath)}`;
  const response = await fetch(objectUrl, {
    headers: {
      Authorization: `Bearer ${serviceRoleKey}`,
      apikey: serviceRoleKey,
      Accept: "audio/wav,application/octet-stream",
    },
    signal: AbortSignal.timeout(60_000),
  });
  if (!response.ok) {
    const raw = await response.text();
    throw new Error(`AVANTIQO_MUSIC_OTHER_TEST_DOWNLOAD_HTTP_${response.status}:${text(raw).slice(0, 300)}`);
  }
  const audio = Buffer.from(await response.arrayBuffer());
  if (audio.length < 10_000) throw new Error("AVANTIQO_MUSIC_OTHER_TEST_AUDIO_TOO_SMALL");

  const capability = safeName(text(report?.capability) || "Music-Transform");
  const sourceMode = safeName(text(report?.source_mode) || text(report?.source_fixture?.profile) || `Test-${index + 1}`);
  const fileName = `Avantiqo-Music-Test-${index + 1}-${capability}-${sourceMode}.wav`;
  const outputPath = path.join(DOWNLOADS, fileName);
  await writeFile(outputPath, audio);
  downloaded.push({
    test: index + 1,
    capability: text(report?.capability) || null,
    source_mode: text(report?.source_mode) || null,
    source_profile: text(report?.source_fixture?.profile) || null,
    job_id: text(report?.job_id) || null,
    report_path: reportPath,
    output_path: outputPath,
    bytes: audio.length,
  });
}

console.log(JSON.stringify({
  success: true,
  contract: "AVANTIQO_MUSIC_OTHER_TEST_DOWNLOADS_V1",
  provider_jobs_submitted: 0,
  runpod_lease_opened: false,
  production_activation_performed: false,
  downloads_folder: DOWNLOADS,
  downloaded,
}, null, 2));
