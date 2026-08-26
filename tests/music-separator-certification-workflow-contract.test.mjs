import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const workflow = fs.readFileSync(
  new URL("../.github/workflows/avantiqo-music-separator-certification.yml", import.meta.url),
  "utf8",
);

test("Music separator certification workflow installs only required CI runtime dependencies", () => {
  assert.match(workflow, /npm install --no-save --package-lock=false @next\/env@14\.2\.35 @supabase\/supabase-js@2\.105\.4/);
  assert.doesNotMatch(workflow, /\brun:\s*npm ci\b/);
});

test("Music separator certification fails closed before provider work when credentials are absent", () => {
  assert.match(workflow, /AVANTIQO_MUSIC_SEPARATOR_CREDENTIAL_PREFLIGHT_V1/);
  assert.match(workflow, /RUNPOD_MANAGEMENT_API_KEY/);
  assert.match(workflow, /RUNPOD_API_KEY/);
  assert.match(workflow, /NEXT_PUBLIC_SUPABASE_URL/);
  assert.match(workflow, /SUPABASE_SERVICE_ROLE_KEY/);
  assert.match(workflow, /provider_job_submitted[^\n]*false/);
  assert.match(workflow, /endpoint_mutation_performed[^\n]*false/);
});

test("Music separator provisioning pipeline propagates node failures through tee", () => {
  assert.match(
    workflow,
    /Provision dedicated separator endpoint if missing[\s\S]*?set -euo pipefail[\s\S]*?provision-avantiqo-music-separator-runpod-local\.mjs --apply \| tee/,
  );
});

test("Music separator certification remains one-run and non-activating", () => {
  assert.match(workflow, /AVANTIQO_MUSIC_SEPARATOR_BENCHMARK_SPEND_APPROVED:\s*"YES"/);
  assert.match(workflow, /AVANTIQO_MUSIC_SEPARATOR_BENCHMARK_RIGHTS_APPROVED:\s*"YES"/);
  assert.match(workflow, /Run one controlled separator benchmark/);
  assert.match(workflow, /MUSIC_SEPARATOR_HUMAN_REVIEW=PENDING/);
  assert.match(workflow, /MUSIC_SEPARATOR_PRODUCTION_ACTIVATION=false/);
});
