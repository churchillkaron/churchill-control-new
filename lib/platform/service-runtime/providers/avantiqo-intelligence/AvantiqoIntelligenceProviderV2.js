import {
  executeIntelligenceModalDirect,
  getIntelligenceModalDirectStatus,
  cancelIntelligenceModalDirect,
  isIntelligenceModalDirectJob,
} from "./AvantiqoIntelligenceModalDirectRuntime.js";
import {
  executeIntelligenceLocal,
  shouldUseLocalIntelligence,
} from "./AvantiqoIntelligenceLocalRuntime.js";
import {
  executeIntelligenceLocalQueue,
  getIntelligenceLocalQueueStatus,
  cancelIntelligenceLocalQueue,
  isIntelligenceLocalQueueJob,
  shouldUseLocalIntelligenceQueue,
  localIntelligenceContextFits,
  assessLocalIntelligenceCapacity,
} from "./AvantiqoIntelligenceLocalQueueRuntime.js";
import {
  executeHierarchicalLocalIntelligence,
  shouldUseHierarchicalLocalIntelligence,
} from "./AvantiqoIntelligenceHierarchicalLocalRuntime.js";
import {
  buildIntelligenceModalOverflowProof,
  intelligenceModalOverflowApprovalRequested,
  intelligenceModalOverflowProposalWorkflowEnabled,
} from "./AvantiqoIntelligenceModalOverflowPolicy.js";
import {
  createIntelligenceModalOverflowProposal,
  intelligenceModalOverflowApprovalRequiredError,
  resolveApprovedIntelligenceModalOverflowBinding,
} from "../../governance/IntelligenceModalOverflowProposalRuntime.js";
import { intelligenceModalOverflowRequestFingerprint } from "../../governance/IntelligenceModalOverflowFingerprintPolicy.js";

function text(value, limit = 1000) {
  return String(value ?? "").trim().slice(0, limit);
}

function lane(input = {}) {
  return text(input.execution_lane || input.executionLane, 40).toLowerCase() || "fast";
}

function overflowProposalCreationAllowed(input = {}) {
  if (!intelligenceModalOverflowProposalWorkflowEnabled()) return false;
  return input.modal_overflow_proposal_allowed === true ||
    input.modalOverflowProposalAllowed === true ||
    input.metadata?.modal_overflow_proposal_allowed === true;
}

function overflowProposalId(input = {}) {
  return text(
    input.modal_overflow_proposal_id ||
      input.modalOverflowProposalId ||
      input.context?.modal_overflow_proposal_id ||
      input.metadata?.modal_overflow_proposal_id ||
      input.provider_parameters?.modal_overflow_proposal_id,
    120,
  );
}

function requestedOverflowReason(input = {}) {
  return text(
    input.intelligence_modal_overflow_reason_code ||
      input.modal_overflow_reason_code ||
      input.metadata?.intelligence_modal_overflow_reason_code ||
      input.provider_parameters?.intelligence_modal_overflow_reason_code,
    120,
  ).toUpperCase();
}

function localAssessmentReference(input = {}) {
  return text(
    input.local_assessment_reference ||
      input.localAssessmentReference ||
      input.metadata?.local_assessment_reference ||
      input.provider_parameters?.local_assessment_reference,
    240,
  );
}

function localRuntimeError({ input, localAttempted, localCapacityFits, localFailure } = {}) {
  const error = new Error("AVANTIQO_INTELLIGENCE_LOCAL_RUNTIME_REQUIRED");
  error.code = "AVANTIQO_INTELLIGENCE_LOCAL_RUNTIME_REQUIRED";
  error.status = 503;
  error.external_compute_allowed = false;
  error.external_provider_job_submitted = false;
  error.local_first = true;
  error.modal_overflow_available_with_approval =
    lane(input) !== "front" && intelligenceModalOverflowProposalWorkflowEnabled();
  error.local_attempted = localAttempted === true;
  error.local_capacity_fits = localCapacityFits === true;
  error.local_failure_code = text(localFailure?.code || localFailure?.message, 240) || null;
  return error;
}

function assertOverflowReasonMatchesLocalEvidence({
  input,
  reasonCode,
  localCapacityFits,
  localAttempted,
  localFailure,
}) {
  if (!reasonCode) {
    throw new Error("AVANTIQO_INTELLIGENCE_MODAL_OVERFLOW_REASON_REQUIRED");
  }
  if (
    ["LOCAL_CONTEXT_CAPACITY_EXCEEDED", "LOCAL_OUTPUT_CAPACITY_EXCEEDED"].includes(reasonCode) &&
    localCapacityFits
  ) {
    throw new Error("AVANTIQO_INTELLIGENCE_MODAL_OVERFLOW_CAPACITY_PROOF_MISMATCH");
  }
  if (reasonCode === "LOCAL_GPU_MEMORY_INSUFFICIENT") {
    const failure = text(localFailure?.code || localFailure?.message, 1000).toUpperCase();
    if (!localAttempted || !/(OUT.?OF.?MEMORY|OOM|GPU.?MEMORY|VRAM)/.test(failure)) {
      throw new Error("AVANTIQO_INTELLIGENCE_MODAL_OVERFLOW_GPU_MEMORY_PROOF_REQUIRED");
    }
  }
  if (
    reasonCode === "LOCAL_LARGE_MODEL_CAPABILITY_REQUIRED" &&
    !localAssessmentReference(input)
  ) {
    throw new Error("AVANTIQO_INTELLIGENCE_MODAL_OVERFLOW_LOCAL_ASSESSMENT_REQUIRED");
  }
}

export const AvantiqoIntelligenceProviderV2 = {
  id: "avantiqo-intelligence",

  async execute(input = {}) {
    let effectiveInput = input;
    let approvedProposalBinding = null;
    const proposalId = overflowProposalId(input);
    if (proposalId && !intelligenceModalOverflowProposalWorkflowEnabled()) {
      throw new Error("AVANTIQO_INTELLIGENCE_MODAL_PAID_EXECUTION_DISABLED_OUTSIDE_PRODUCTION");
    }
    if (proposalId) {
      approvedProposalBinding = await resolveApprovedIntelligenceModalOverflowBinding({
        organizationId: text(input.context?.organization_id, 120),
        proposalId,
      });
      const currentFingerprint = intelligenceModalOverflowRequestFingerprint(
        input,
        approvedProposalBinding.execution_lane,
      );
      if (
        !approvedProposalBinding.intelligence_modal_overflow_request_fingerprint ||
        currentFingerprint !== approvedProposalBinding.intelligence_modal_overflow_request_fingerprint
      ) {
        throw new Error("INTELLIGENCE_MODAL_OVERFLOW_APPROVED_REQUEST_FINGERPRINT_MISMATCH");
      }
      effectiveInput = { ...input, ...approvedProposalBinding };
    }
    const executionLane = lane(effectiveInput);
    const currentLocalCapacity = assessLocalIntelligenceCapacity(effectiveInput, executionLane);
    const approvedLocalEvidence = approvedProposalBinding?.intelligence_modal_overflow_local_evidence || null;
    const localCapacity = approvedLocalEvidence || currentLocalCapacity;
    const localCapacityFits = localCapacity.fits === true;
    let localAttempted = approvedProposalBinding ? localCapacity.local_attempted === true : false;
    let localFailure = approvedProposalBinding && localCapacity.local_failure_code
      ? { message: localCapacity.local_failure_code }
      : null;

    if (!approvedProposalBinding && shouldUseHierarchicalLocalIntelligence(effectiveInput)) {
      localAttempted = true;
      try {
        return await executeHierarchicalLocalIntelligence(effectiveInput);
      } catch (error) {
        localFailure = error;
        console.error("AVANTIQO_HIERARCHICAL_LOCAL_INTELLIGENCE_FAILED", {
          lane: executionLane,
          error: text(error?.message || error, 500),
          external_compute_started: false,
        });
      }
    }

    if (!approvedProposalBinding && shouldUseLocalIntelligenceQueue(effectiveInput)) {
      localAttempted = true;
      try {
        return await executeIntelligenceLocalQueue(effectiveInput);
      } catch (error) {
        localFailure = error;
        console.error("AVANTIQO_LOCAL_INTELLIGENCE_QUEUE_FAILED", {
          lane: executionLane,
          error: text(error?.message || error, 500),
          external_compute_started: false,
        });
      }
    }

    if (!approvedProposalBinding && ["front", "fast"].includes(executionLane) && shouldUseLocalIntelligence(effectiveInput)) {
      localAttempted = true;
      try {
        return await executeIntelligenceLocal(effectiveInput);
      } catch (error) {
        localFailure = error;
        console.error("AVANTIQO_LOCAL_INTELLIGENCE_DIRECT_FAILED", {
          lane: executionLane,
          error: text(error?.message || error, 500),
          external_compute_started: false,
        });
      }
    }

    if (executionLane === "front") {
      throw localRuntimeError({ input: effectiveInput, localAttempted, localCapacityFits, localFailure });
    }

    if (!intelligenceModalOverflowApprovalRequested(effectiveInput)) {
      let proposalReason = localCapacity.reason_code;
      const localFailureText = text(localFailure?.code || localFailure?.message, 1000).toUpperCase();
      if (!proposalReason && localAttempted && /(OUT.?OF.?MEMORY|OOM|GPU.?MEMORY|VRAM)/.test(localFailureText)) {
        proposalReason = "LOCAL_GPU_MEMORY_INSUFFICIENT";
      }
      if (proposalReason && overflowProposalCreationAllowed(effectiveInput)) {
        const proposal = await createIntelligenceModalOverflowProposal({
          organizationId: text(effectiveInput.context?.organization_id, 120),
          usageId: text(effectiveInput.context?.usage_id, 240),
          partyId: effectiveInput.context?.party_id || null,
          entityId: effectiveInput.context?.entity_id || null,
          capability: text(effectiveInput.capability, 200),
          lane: executionLane,
          reasonCode: proposalReason,
          localEvidence: {
            ...localCapacity,
            local_attempted: localAttempted,
            local_failure_code: text(localFailure?.code || localFailure?.message, 500) || null,
          },
          requestFingerprint: intelligenceModalOverflowRequestFingerprint(effectiveInput, executionLane),
          requestInput: effectiveInput,
        });
        throw intelligenceModalOverflowApprovalRequiredError(proposal);
      }
      throw localRuntimeError({ input: effectiveInput, localAttempted, localCapacityFits, localFailure });
    }

    const reasonCode = requestedOverflowReason(effectiveInput);
    assertOverflowReasonMatchesLocalEvidence({
      input: effectiveInput,
      reasonCode,
      localCapacityFits,
      localAttempted,
      localFailure,
    });

    const overflowProof = buildIntelligenceModalOverflowProof({
      input: effectiveInput,
      lane: executionLane,
      reasonCode,
      localCapacityChecked: approvedProposalBinding ? Boolean(localCapacity.reason_code) : true,
      localAttempted,
      localFailureCode: localFailure?.code || localFailure?.message || null,
      localAssessmentReference: localAssessmentReference(effectiveInput) || text(localCapacity.local_assessment_reference, 240) || null,
    });

    return executeIntelligenceModalDirect({
      ...effectiveInput,
      intelligence_modal_overflow: overflowProof,
    });
  },

  async cancel(input = {}) {
    const jobId = text(input.job_id || input.jobId || input.provider_job_id, 500);
    if (!jobId) throw new Error("AVANTIQO_INTELLIGENCE_JOB_ID_REQUIRED");
    if (isIntelligenceLocalQueueJob(jobId)) {
      return cancelIntelligenceLocalQueue({ ...input, job_id: jobId });
    }
    if (isIntelligenceModalDirectJob(jobId)) {
      return cancelIntelligenceModalDirect({ ...input, job_id: jobId });
    }
    throw new Error("AVANTIQO_INTELLIGENCE_JOB_ID_UNSUPPORTED");
  },

  async getStatus(input = {}) {
    const jobId = text(input.job_id || input.jobId || input.provider_job_id, 500);
    if (!jobId) throw new Error("AVANTIQO_INTELLIGENCE_JOB_ID_REQUIRED");
    if (isIntelligenceLocalQueueJob(jobId)) {
      return getIntelligenceLocalQueueStatus({ ...input, job_id: jobId });
    }
    if (isIntelligenceModalDirectJob(jobId)) {
      return getIntelligenceModalDirectStatus({ ...input, job_id: jobId });
    }
    throw new Error("AVANTIQO_INTELLIGENCE_JOB_ID_UNSUPPORTED");
  },
};
