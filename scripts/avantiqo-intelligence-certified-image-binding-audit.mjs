import fs from "node:fs";
import path from "node:path";

const root = process.cwd();

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function assert(condition, code) {
  if (!condition) throw new Error(code);
}

const binding = read("lib/intelligence/runtime/AvantiqoRunPodCertifiedImageBinding.js");
const training = read("lib/intelligence/runtime/AvantiqoModelTrainingExecutionRuntime.js");
const canary = read("lib/intelligence/runtime/AvantiqoModelCandidateCanaryRuntime.js");

const sourceSha = "bef2ff27b4774e66960a08322ebe8e5ee9f19dfb";
const trainerImage =
  "ghcr.io/churchillkaron/avantiqo-intelligence-trainer@sha256:eb24423075767c15d476c2ad0c9695482addf68e28b2b85af4768dc6a606bb4f";
const candidateImage =
  "ghcr.io/churchillkaron/avantiqo-intelligence-candidate@sha256:3e19d865a23567ae24bbef9ec562261cbceaa79bacaee71a36475cd911848ee7";

assert(
  binding.includes("AVANTIQO_RUNPOD_CERTIFIED_IMAGE_BINDING_V1"),
  "INTELLIGENCE_CERTIFIED_IMAGE_BINDING_CONTRACT_REQUIRED",
);
assert(binding.includes(sourceSha), "INTELLIGENCE_CERTIFIED_IMAGE_SOURCE_SHA_REQUIRED");
assert(binding.includes(trainerImage), "INTELLIGENCE_CERTIFIED_TRAINER_DIGEST_REQUIRED");
assert(binding.includes(candidateImage), "INTELLIGENCE_CERTIFIED_CANDIDATE_DIGEST_REQUIRED");
assert(
  binding.includes("includeEndpointBoundTemplates=true"),
  "INTELLIGENCE_ENDPOINT_BOUND_TEMPLATE_RESOLUTION_REQUIRED",
);
assert(
  binding.includes("actualImage !== expectedImage"),
  "INTELLIGENCE_CERTIFIED_IMAGE_EXACT_MATCH_REQUIRED",
);
assert(
  binding.includes("AVANTIQO_INTELLIGENCE_CERTIFIED_IMAGE_BINDING_MANAGEMENT_KEY_REQUIRED"),
  "INTELLIGENCE_CERTIFIED_IMAGE_MANAGEMENT_KEY_REQUIRED",
);
assert(binding.includes("mutation_performed: false"), "INTELLIGENCE_BINDING_MUTATION_FORBIDDEN");
assert(binding.includes("provider_job_submitted: false"), "INTELLIGENCE_BINDING_PROVIDER_JOB_FORBIDDEN");
assert(binding.includes("production_model_promoted: false"), "INTELLIGENCE_BINDING_PROMOTION_FORBIDDEN");

assert(
  training.includes("assertAvantiqoRunPodCertifiedImageBinding"),
  "INTELLIGENCE_TRAINING_CERTIFIED_BINDING_CALL_REQUIRED",
);
assert(
  training.includes('component: "trainer"'),
  "INTELLIGENCE_TRAINING_CERTIFIED_TRAINER_COMPONENT_REQUIRED",
);
assert(
  training.includes("RUNPOD_MANAGEMENT_API_KEY"),
  "INTELLIGENCE_TRAINING_MANAGEMENT_KEY_REQUIRED",
);
assert(
  training.indexOf("assertAvantiqoRunPodCertifiedImageBinding") <
    training.indexOf('`${config.baseUrl}/run`'),
  "INTELLIGENCE_TRAINING_BINDING_MUST_PRECEDE_PAID_RUN",
);
assert(
  training.includes("certified_trainer_image_binding_verified"),
  "INTELLIGENCE_TRAINING_BINDING_EVIDENCE_REQUIRED",
);

assert(
  canary.includes("assertAvantiqoRunPodCertifiedImageBinding"),
  "INTELLIGENCE_CANARY_CERTIFIED_BINDING_CALL_REQUIRED",
);
assert(
  canary.includes('component: "candidate"'),
  "INTELLIGENCE_CANARY_CERTIFIED_CANDIDATE_COMPONENT_REQUIRED",
);
assert(
  canary.includes("RUNPOD_MANAGEMENT_API_KEY"),
  "INTELLIGENCE_CANARY_MANAGEMENT_KEY_REQUIRED",
);
assert(
  canary.indexOf("assertAvantiqoRunPodCertifiedImageBinding") <
    canary.indexOf('`${candidateConfig.apiBase}/health`'),
  "INTELLIGENCE_CANARY_BINDING_MUST_PRECEDE_PROVIDER_PROBE",
);
assert(
  canary.includes("exact_candidate_image_binding_verified"),
  "INTELLIGENCE_CANARY_BINDING_EVIDENCE_REQUIRED",
);
assert(
  canary.includes("ordinary_provider_routing_enabled: false"),
  "INTELLIGENCE_CANARY_ORDINARY_ROUTING_FORBIDDEN",
);
assert(
  canary.includes("production_endpoint_mutated: false"),
  "INTELLIGENCE_CANARY_PRODUCTION_MUTATION_FORBIDDEN",
);

console.log("AVANTIQO_INTELLIGENCE_CERTIFIED_IMAGE_BINDING_AUDIT=PASS");
console.log(`AVANTIQO_INTELLIGENCE_CERTIFIED_IMAGE_SOURCE_SHA=${sourceSha}`);
console.log(`AVANTIQO_INTELLIGENCE_CERTIFIED_TRAINER_IMAGE=${trainerImage}`);
console.log(`AVANTIQO_INTELLIGENCE_CERTIFIED_CANDIDATE_IMAGE=${candidateImage}`);
console.log("AVANTIQO_INTELLIGENCE_TRAINING_PROVIDER_JOB_SUBMITTED=NO");
console.log("AVANTIQO_INTELLIGENCE_RUNPOD_ENDPOINT_MUTATED=NO");
console.log("AVANTIQO_INTELLIGENCE_PRODUCTION_DEPLOY=NO");
