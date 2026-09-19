#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { loadAvantiqoEnv } from "./load-avantiqo-env.mjs";

loadAvantiqoEnv();

const CONTRACT = "AVANTIQO_MUSIC_EDIT_MODAL_CERTIFICATION_PREFLIGHT_V1";
const CAPABILITY = "ai.audio.edit";
const MODAL_APP = "avantiqo-audio-owned";
const MODAL_FUNCTION = "generate";
const ROOT = resolve(process.cwd());
function text(value) { return String(value ?? "").trim(); }
function enabled(value) { return ["1", "true", "yes", "on"].includes(text(value).toLowerCase()); }
function certifiedCapabilities() {
  return new Set(text(process.env.AVANTIQO_AUDIO_CERTIFIED_CAPABILITIES || "ai.music.generate")
    .split(",").map((value) => value.trim()).filter(Boolean));
}

const [engineSource, providerSource] = await Promise.all([
  readFile(resolve(ROOT, "services/avantiqo-audio-engine/handler.py"), "utf8"),
  readFile(resolve(ROOT, "lib/platform/service-runtime/providers/avantiqo-audio/AvantiqoAudioProviderRegistration.js"), "utf8"),
]);

const staticChecks = {
  worker_implements_edit: engineSource.includes('"ai.audio.edit"'),
  provider_declares_edit: providerSource.includes('"ai.audio.edit"'),
  provider_uses_modal_direct: providerSource.includes("MODAL_DIRECT_A10G_ASYNC_V1"),
  engine_contract_present: engineSource.includes("AVANTIQO_AUDIO_ENGINE_V1"),
};

const blockers = Object.entries(staticChecks)
  .filter(([, passed]) => !passed)
  .map(([name]) => name);
const alreadyCertified = certifiedCapabilities().has(CAPABILITY);
const engineEnabled = enabled(process.env.AVANTIQO_AUDIO_ENGINE_ENABLED);
if (!engineEnabled) blockers.push("AUDIO_ENGINE_DISABLED");

const report = {
  success: blockers.length === 0,
  contract: CONTRACT,
  capability: CAPABILITY,
  modal_app: MODAL_APP,
  modal_function: MODAL_FUNCTION,
  static_checks: staticChecks,
  audio_engine_enabled: engineEnabled,
  already_certified: alreadyCertified,
  certification_state: alreadyCertified ? "CERTIFIED_CONFIGURED" : "BENCHMARK_REQUIRED",
  ready_for_one_job_benchmark: blockers.length === 0 && !alreadyCertified,
  blockers,
  provider_jobs_submitted: 0,
  gpu_inference_performed: false,
  production_activation_performed: false,
  pricing_activation_performed: false,
  provider_selection_changed: false,
  production_deploy_performed: false,
};

console.log(JSON.stringify(report, null, 2));
if (blockers.length) process.exitCode = 1;
