import fs from "node:fs";

const required = [
  "lib/platform/service-runtime/providers/avantiqo-image/AvantiqoImageProvider.js",
  "lib/platform/service-runtime/providers/avantiqo-video/AvantiqoVideoProviderV2.js",
  "lib/platform/service-runtime/providers/avantiqo-image/AvantiqoImageProviderRegistration.js",
  "lib/platform/service-runtime/providers/avantiqo-video/AvantiqoVideoProviderRegistration.js",
  "scripts/local-node/avantiqo-node01-worker.ps1",
];

const missing = required.filter((file) => !fs.existsSync(file));
if (missing.length) {
  throw new Error(`AVANTIQO_OWNED_MEDIA_LOCAL_RUNTIME_FILES_MISSING:${missing.join(",")}`);
}

const result = {
  success: false,
  contract: "AVANTIQO_OWNED_MEDIA_CORE_LOCAL_CERTIFICATION_V2",
  status: "ENGINE_SPECIFIC_CERTIFICATION_REQUIRED",
  local_runtime_files_present: true,
  current_infrastructure: "AVANTIQO_LOCAL_NODE_V1",
  retired_monolithic_benchmark_reused: false,
  generation_performed: false,
  quality_review_required: true,
  economics_measurement_required: true,
  image_engine_certification_required: true,
  cinema_engine_certification_required: true,
  production_certified: false,
  production_activation_performed: false,
  production_deploy_performed: false,
  fail_closed: true,
};

console.log(JSON.stringify(result, null, 2));
process.exitCode = 2;
