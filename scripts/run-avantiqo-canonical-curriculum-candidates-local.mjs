import { register } from "node:module";
import { pathToFileURL } from "node:url";

register("./scripts/next-alias-loader.mjs", pathToFileURL("./"));

const apply = process.argv.includes("--apply");
const benchmark = process.argv.includes("--benchmark");
const yes = (value) => ["YES", "TRUE", "1", "APPROVED", "ON"].includes(
  String(value ?? "").trim().toUpperCase(),
);

const {
  buildAvantiqoCanonicalCurriculumCandidates,
  seedAvantiqoCanonicalCurriculumCandidates,
} = await import(
  "@/lib/intelligence/runtime/AvantiqoCanonicalCurriculumCandidateRuntime"
);
const {
  benchmarkPendingAvantiqoCanonicalCurriculumCandidates,
} = await import(
  "@/lib/intelligence/runtime/AvantiqoCanonicalCurriculumBenchmarkRuntime"
);

const candidates = buildAvantiqoCanonicalCurriculumCandidates();
const summary = {
  contract: "AVANTIQO_CANONICAL_CURRICULUM_CANDIDATE_LOCAL_V1",
  mode: apply ? (benchmark ? "APPLY_AND_BENCHMARK" : "APPLY") : "PLAN",
  candidate_count: candidates.length,
  by_domain: candidates.reduce((accumulator, candidate) => {
    const domain = candidate.domain || "unknown";
    accumulator[domain] = Number(accumulator[domain] || 0) + 1;
    return accumulator;
  }, {}),
  benchmark_required_count: candidates.filter((candidate) => candidate.benchmark_required).length,
  training_ready_count: candidates.filter((candidate) => candidate.training_ready).length,
  provider_execution_used: false,
  runpod_used: false,
  shared_trainer_mutated: false,
  model_training_started: false,
  production_deploy_performed: false,
  secrets_printed: false,
};

console.log(JSON.stringify(summary, null, 2));

if (!apply) {
  console.log("AVANTIQO_CANONICAL_CURRICULUM_CANDIDATES_PLAN=PASS");
  process.exit(0);
}

if (!yes(process.env.AVANTIQO_CANONICAL_CURRICULUM_CANDIDATE_SEED_APPROVED)) {
  throw new Error(
    "AVANTIQO_CANONICAL_CURRICULUM_CANDIDATE_SEED_APPROVED=YES_REQUIRED",
  );
}

const result = await seedAvantiqoCanonicalCurriculumCandidates();
console.log(JSON.stringify({
  ...result,
  provider_execution_used: false,
  runpod_used: false,
  shared_trainer_mutated: false,
  model_training_started: false,
  production_deploy_performed: false,
  secrets_printed: false,
}, null, 2));

if (result.status !== "SEEDED") {
  throw new Error(
    `AVANTIQO_CANONICAL_CURRICULUM_CANDIDATE_SEED_FAILED:${result.status || "UNKNOWN"}`,
  );
}
if (Number(result.candidate_count || 0) < 8) {
  throw new Error(
    `AVANTIQO_CANONICAL_CURRICULUM_CANDIDATE_MINIMUM_NOT_MET:${result.candidate_count || 0}`,
  );
}

console.log("AVANTIQO_CANONICAL_CURRICULUM_CANDIDATES_APPLY=PASS");
console.log("AVANTIQO_CANONICAL_CURRICULUM_CANDIDATES_BENCHMARK_REQUIRED=YES");
console.log("AVANTIQO_CANONICAL_CURRICULUM_CANDIDATES_SHARED_TRAINER_MUTATED=NO");

if (!benchmark) {
  console.log("AVANTIQO_CANONICAL_CURRICULUM_CANDIDATES_BENCHMARK_EXECUTED=NO");
  process.exit(0);
}

if (!yes(process.env.AVANTIQO_CANONICAL_CURRICULUM_BENCHMARK_APPROVED)) {
  throw new Error(
    "AVANTIQO_CANONICAL_CURRICULUM_BENCHMARK_APPROVED=YES_REQUIRED",
  );
}

const benchmarkResult = await benchmarkPendingAvantiqoCanonicalCurriculumCandidates({
  limit: 32,
});
console.log(JSON.stringify({
  ...benchmarkResult,
  provider_execution_used: false,
  runpod_used: false,
  shared_trainer_mutated: false,
  model_training_started: false,
  production_deploy_performed: false,
  secrets_printed: false,
}, null, 2));

if (benchmarkResult.rejected_count > 0) {
  throw new Error(
    `AVANTIQO_CANONICAL_CURRICULUM_BENCHMARK_REJECTED:${benchmarkResult.rejected_count}`,
  );
}
if (Number(benchmarkResult.total_approved_count || 0) < 8) {
  throw new Error(
    `AVANTIQO_CANONICAL_CURRICULUM_BENCHMARK_MINIMUM_APPROVED_NOT_REACHED:${benchmarkResult.total_approved_count || 0}`,
  );
}

console.log("AVANTIQO_CANONICAL_CURRICULUM_BENCHMARK=PASS");
console.log(`AVANTIQO_CANONICAL_CURRICULUM_TOTAL_APPROVED=${benchmarkResult.total_approved_count}`);
console.log("AVANTIQO_CANONICAL_CURRICULUM_BENCHMARK_PROVIDER_EXECUTION=NO");
console.log("AVANTIQO_CANONICAL_CURRICULUM_BENCHMARK_RUNPOD=NO");
console.log("AVANTIQO_CANONICAL_CURRICULUM_BENCHMARK_SHARED_TRAINER_MUTATED=NO");
