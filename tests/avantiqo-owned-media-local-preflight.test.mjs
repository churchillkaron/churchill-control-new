import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const PREFLIGHT = new URL(
  "../scripts/preflight-avantiqo-owned-media-local.mjs",
  import.meta.url,
);
const CERTIFY = new URL(
  "../scripts/certify-avantiqo-owned-media-local.sh",
  import.meta.url,
);

test("owned media local preflight is zero-generation and health-only", async () => {
  const source = await readFile(PREFLIGHT, "utf8");

  assert.match(source, /AVANTIQO_OWNED_MEDIA_LOCAL_PREFLIGHT_V1/);
  assert.match(source, /method:\s*"GET"/);
  assert.match(source, /\/health`/);
  assert.match(source, /runpod_generation_jobs_submitted:\s*0/);
  assert.match(source, /runpod_run_called:\s*false/);
  assert.match(source, /runpod_runsync_called:\s*false/);
  assert.match(source, /supabase_mutations_performed:\s*0/);
  assert.doesNotMatch(source, /method:\s*"POST"/);
  assert.doesNotMatch(source, /\/runsync`/);
  assert.doesNotMatch(source, /\/run`/);
});

test("certification workflow runs preflight before fixtures and GPU benchmark", async () => {
  const source = await readFile(CERTIFY, "utf8");
  const preflightIndex = source.indexOf(
    "scripts/preflight-avantiqo-owned-media-local.mjs",
  );
  const fixtureIndex = source.indexOf(
    "scripts/prepare-avantiqo-owned-media-certification-fixtures.mjs",
  );
  const benchmarkIndex = source.indexOf(
    "scripts/benchmark-avantiqo-owned-media-full.mjs",
  );

  assert.ok(preflightIndex >= 0, "preflight command must be present");
  assert.ok(fixtureIndex > preflightIndex, "fixtures must run after preflight");
  assert.ok(benchmarkIndex > fixtureIndex, "GPU benchmark must run after fixtures");
  assert.match(source, /AVANTIQO_MEDIA_CERTIFICATION_PREFLIGHT_SPEND_SAFETY_INVALID/);
});
