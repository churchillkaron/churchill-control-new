export const AVANTIQO_MODEL_BENCHMARK_EXECUTION_CONTRACT =
  "AVANTIQO_MODEL_BENCHMARK_EXECUTION_V4";

function blocked() {
  const error = new Error("AVANTIQO_MODEL_BENCHMARK_LOCAL_RUNTIME_REQUIRED");
  error.code = "AVANTIQO_MODEL_BENCHMARK_LOCAL_RUNTIME_REQUIRED";
  error.status = 503;
  return error;
}

export async function submitAvantiqoModelBenchmark() {
  throw blocked();
}

export async function refreshAvantiqoModelBenchmark() {
  throw blocked();
}

export const AvantiqoModelBenchmarkExecutionRuntime = Object.freeze({
  contract: AVANTIQO_MODEL_BENCHMARK_EXECUTION_CONTRACT,
  infrastructure_policy: "AVANTIQO_LOCAL_ONLY_FAIL_CLOSED_UNTIL_IMPLEMENTED",
  external_compute_allowed: false,
  submit: submitAvantiqoModelBenchmark,
  refresh: refreshAvantiqoModelBenchmark,
});
