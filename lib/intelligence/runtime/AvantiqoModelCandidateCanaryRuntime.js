export const AVANTIQO_MODEL_CANDIDATE_CANARY_CONTRACT =
  "AVANTIQO_MODEL_CANDIDATE_CANARY_V2";

export async function certifyAvantiqoModelCandidateCanary() {
  const error = new Error("AVANTIQO_MODEL_CANDIDATE_CANARY_MODAL_RUNTIME_REQUIRED");
  error.code = "AVANTIQO_MODEL_CANDIDATE_CANARY_MODAL_RUNTIME_REQUIRED";
  error.status = 503;
  throw error;
}

export const AvantiqoModelCandidateCanaryRuntime = Object.freeze({
  contract: AVANTIQO_MODEL_CANDIDATE_CANARY_CONTRACT,
  infrastructure_policy: "MODAL_ONLY_FAIL_CLOSED_UNTIL_IMPLEMENTED",
  certify: certifyAvantiqoModelCandidateCanary,
});
