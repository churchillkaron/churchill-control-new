export const AVANTIQO_MODEL_BENCHMARK_EXECUTION_CONTRACT =
  "AVANTIQO_MODEL_BENCHMARK_EXECUTION_V3";

function blocked() {
  const error = new Error("AVANTIQO_MODEL_BENCHMARK_MODAL_RUNTIME_REQUIRED");
  error.code = "AVANTIQO_MODEL_BENCHMARK_MODAL_RUNTIME_REQUIRED";
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
  infrastructure_policy: "MODAL_ONLY_FAIL_CLOSED_UNTIL_IMPLEMENTED",
  submit: submitAvantiqoModelBenchmark,
  refresh: refreshAvantiqoModelBenchmark,
});
