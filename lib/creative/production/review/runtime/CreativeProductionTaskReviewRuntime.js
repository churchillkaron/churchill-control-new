import crypto from "node:crypto";

import {
  ProductionTaskRuntime,
} from "@/lib/operations/tasks/runtime/ProductionTaskRuntime";
import {
  CreativeIdentityKeyframeExecutionGate,
} from "@/lib/creative/identity/runtime/CreativeIdentityKeyframeExecutionGate";
import {
  CreativeLipSyncExecutionGate,
} from "@/lib/creative/performance/runtime/CreativeLipSyncExecutionGate";

const REVIEW_CONTRACTS = Object.freeze({
  IDENTITY_KEYFRAME_REVIEW_V1: {
    allowed_statuses: ["COMPLETED"],
    validate: (task) =>
      CreativeIdentityKeyframeExecutionGate.reviewPassed(task),
  },
  AUDIO_CONDITIONED_LIPSYNC_VALIDATION_V1: {
    allowed_statuses: ["REVIEW"],
    validate: (task) =>
      task.metadata?.automated_lipsync_validation_passed === true &&
      CreativeLipSyncExecutionGate.validationPassed(task),
  },
});

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function text(value) {
  return String(value ?? "").trim();
}

function automatedEvidence(task = {}) {
  return (
    task.output?.validation_evidence ||
    task.output?.output ||
    task.output ||
    null
  );
}

function approvalIdentity(task = {}, approver = {}) {
  return crypto.createHash("sha256").update(JSON.stringify({
    task_id: task.id,
    task_contract: task.metadata?.contract || null,
    automated_evidence: automatedEvidence(task),
    automated_validation_passed:
      task.metadata?.automated_lipsync_validation_passed ||
      null,
    approver_user_id: approver.user_id,
    approver_staff_account_id: approver.staff_account_id,
  })).digest("hex");
}

function contractPolicy(task = {}) {
  const contract = text(task.metadata?.contract);
  const policy = REVIEW_CONTRACTS[contract];
  if (!policy) {
    throw new Error(`PRODUCTION_TASK_REVIEW_CONTRACT_NOT_APPROVABLE:${contract || "MISSING"}`);
  }
  return { contract, policy };
}

export const CreativeProductionTaskReviewRuntime = {
  async approve({
    organization_id,
    task_id,
    approver,
    notes = "",
  } = {}) {
    if (!organization_id) throw new Error("organization_id required");
    if (!task_id) throw new Error("task_id required");
    if (!approver?.user_id || !approver?.staff_account_id) {
      throw new Error("AUTHENTICATED_PRODUCTION_REVIEW_APPROVER_REQUIRED");
    }

    const task = await ProductionTaskRuntime.get(task_id);
    if (!task || String(task.organization_id) !== String(organization_id)) {
      throw new Error("PRODUCTION_REVIEW_TASK_NOT_FOUND");
    }

    const { contract, policy } = contractPolicy(task);
    const identity = approvalIdentity(task, approver);
    if (
      task.review?.approved === true &&
      task.metadata?.human_review_approved === true &&
      text(task.metadata?.production_review_approval_identity) === identity
    ) {
      return { task, reused: true };
    }

    if (!policy.allowed_statuses.includes(task.status)) {
      throw new Error(
        `PRODUCTION_REVIEW_TASK_STATUS_INVALID:${contract}:${task.status}`,
      );
    }
    if (task.review?.required !== true) {
      throw new Error("PRODUCTION_REVIEW_HUMAN_APPROVAL_NOT_REQUIRED");
    }
    if (!policy.validate(task)) {
      throw new Error(`PRODUCTION_REVIEW_AUTOMATED_VALIDATION_NOT_PASSED:${contract}`);
    }

    const approvedAt = new Date().toISOString();
    const approved = await ProductionTaskRuntime.update(task.id, {
      status: "COMPLETED",
      review: {
        ...object(task.review),
        required: true,
        approved: true,
        approved_by: approver.staff_account_id,
        notes: text(notes),
      },
      metadata: {
        ...object(task.metadata),
        human_review_approved: true,
        human_review_approved_at: approvedAt,
        human_review_approved_by_user_id: approver.user_id,
        human_review_approved_by_staff_account_id: approver.staff_account_id,
        human_review_approved_by_email: approver.email || null,
        production_review_approval_identity: identity,
        downstream_blocked_until_human_approval: false,
      },
      error: null,
    });

    return {
      task: approved,
      reused: false,
      approval: {
        contract: "AUTHENTICATED_PRODUCTION_TASK_REVIEW_APPROVAL_V1",
        review_contract: contract,
        approval_identity: identity,
        approved_at: approvedAt,
        approver_user_id: approver.user_id,
        approver_staff_account_id: approver.staff_account_id,
      },
    };
  },
};
