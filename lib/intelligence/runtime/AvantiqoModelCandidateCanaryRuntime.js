export const AVANTIQO_MODEL_CANDIDATE_CANARY_CONTRACT =
  "AVANTIQO_MODEL_CANDIDATE_CANARY_V3";

export async function certifyAvantiqoModelCandidateCanary() {
  const error = new Error("AVANTIQO_MODEL_CANDIDATE_CANARY_LOCAL_RUNTIME_REQUIRED");
  error.code = "AVANTIQO_MODEL_CANDIDATE_CANARY_LOCAL_RUNTIME_REQUIRED";
  error.status = 503;
  throw error;
}

export const AvantiqoModelCandidateCanaryRuntime = Object.freeze({
  contract: AVANTIQO_MODEL_CANDIDATE_CANARY_CONTRACT,
  infrastructure_policy: "AVANTIQO_LOCAL_ONLY_FAIL_CLOSED_UNTIL_IMPLEMENTED",
  external_compute_allowed: false,
  certify: certifyAvantiqoModelCandidateCanary,
});
