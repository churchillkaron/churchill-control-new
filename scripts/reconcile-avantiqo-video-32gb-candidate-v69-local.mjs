#!/usr/bin/env node

import {
  VIDEO_32GB_CANDIDATE_APPROVED_GPUS,
  VIDEO_32GB_CANDIDATE_CONTRACT,
  VIDEO_32GB_CANDIDATE_ENDPOINT_NAME,
  VIDEO_32GB_CANDIDATE_POOL_ID,
  assertVideoProductionUnchanged,
  inspectVideo32gbCandidate,
  text,
} from "./lib/avantiqo-video-32gb-candidate-contract-v69.mjs";
import { loadAvantiqoEnv } from "./load-avantiqo-env.mjs";

loadAvantiqoEnv();

const CONTRACT = "AVANTIQO_VIDEO_32GB_CANDIDATE_RECONCILIATION_V69";

const managementKey = text(process.env.RUNPOD_MANAGEMENT_API_KEY || process.env.RUNPOD_API_KEY);
const productionEndpointId = text(process.env.RUNPOD_AVANTIQO_VIDEO_PRODUCTION_ENDPOINT_ID);
if (!managementKey) throw new Error("RUNPOD_MANAGEMENT_API_KEY_REQUIRED");
if (!productionEndpointId) throw new Error("RUNPOD_AVANTIQO_VIDEO_PRODUCTION_ENDPOINT_ID_REQUIRED");

const inspected = await inspectVideo32gbCandidate({ managementKey, productionEndpointId });
const productionAfter = await assertVideoProductionUnchanged({
  managementKey,
  productionEndpointId,
  before: inspected.production_endpoint_snapshot,
});

console.log(JSON.stringify({
  success: true,
  contract: CONTRACT,
  candidate_contract: VIDEO_32GB_CANDIDATE_CONTRACT,
  mode: "READ_ONLY_RECONCILIATION",
  endpoint_name: VIDEO_32GB_CANDIDATE_ENDPOINT_NAME,
  endpoint_id: text(inspected.candidate_endpoint?.id),
  endpoint_parked_0_0: true,
  serverless_pool_id: inspected.candidate_serverless_pool_id,
  serverless_pool_verified: inspected.candidate_serverless_pool_id === VIDEO_32GB_CANDIDATE_POOL_ID,
  approved_runtime_gpu_types: [...VIDEO_32GB_CANDIDATE_APPROVED_GPUS],
  live_gpu_evidence: inspected.live_gpu_evidence,
  physical_gpu_runtime_verification_required: true,
  immutable_image: inspected.immutable_image.image,
  cache_volume: inspected.cache_volume,
  production_endpoint_before: inspected.production_endpoint_snapshot,
  production_endpoint_after: productionAfter,
  production_endpoint_unchanged: true,
  candidate_endpoint_mutation_performed: false,
  production_endpoint_mutation_performed: false,
  runpod_worker_mutation_performed: false,
  workers_opened: false,
  video_generation_submitted: false,
  inference_performed: false,
  model_download_performed: false,
  storage_mutation_performed: false,
  external_paid_provider_contacted: false,
  image_endpoint_mutated: false,
  safe_lease_modified: false,
  secrets_printed: false,
  next_action: "V70_RUNTIME_PROBE_ONLY",
}, null, 2));
console.log("AVANTIQO_VIDEO_32GB_CANDIDATE_RECONCILIATION_V69=PASS");
