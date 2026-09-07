import {
  ProductionTaskRuntime,
} from "@/lib/operations/tasks/runtime/ProductionTaskRuntime";
import * as ShotRepository
from "@/lib/creative/shots/repositories/ShotRepository";

const INSTALL_FLAG = Symbol.for(
  "avantiqo.creative.continuity-qc-authority-guard.v1",
);
const CONTRACT = "AVANTIQO_CONTINUITY_QC_AUTHORITY_GUARD_V1";
const QC_CONTRACT = "AVANTIQO_CONTINUITY_QC_GATE_V1";
const QC_SEAL_CONTRACT = "AVANTIQO_CONTINUITY_QC_SEAL_V1";
const REVIEW_CONTRACT = "GENERATED_MEDIA_PERCEPTUAL_REVIEW_V1";
const REPLACEMENT_REVIEW_CONTRACT =
  "GENERATED_MEDIA_PERCEPTUAL_REPLACEMENT_REVIEW_V1";
const STATE_CONTRACT = "CREATIVE_CINEMATIC_STATE_MEMORY_V1";

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function list(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function text(value) {
  return String(value ?? "").trim();
}

function perceptualReview(task = {}) {
  return text(task.metadata?.contract) === REVIEW_CONTRACT ||
    text(task.metadata?.repair_payload_contract) === REPLACEMENT_REVIEW_CONTRACT;
}

function sourceTaskId(review = {}) {
  return text(
    review.metadata?.source_generation_task_id ||
    review.metadata?.repaired_source_task_id ||
    review.input?.provider_parameters?.source_generation_task_id ||
    list(review.depends_on)[0],
  ) || null;
}

function cinemaSource(source = {}) {
  return text(source.capability || source.service_code || source.service_id)
    .toLowerCase()
    .startsWith("ai.video.");
}

function matchedQcSeal(review = {}, source = {}) {
  const reviewHash = text(review.metadata?.continuity_qc_seal_hash);
  const sourceHash = text(source.metadata?.continuity_qc_seal_hash);
  return review.metadata?.continuity_qc_contract === QC_CONTRACT &&
    source.metadata?.continuity_qc_contract === QC_CONTRACT &&
    review.metadata?.continuity_qc_seal_contract === QC_SEAL_CONTRACT &&
    source.metadata?.continuity_qc_seal_contract === QC_SEAL_CONTRACT &&
    review.metadata?.continuity_qc_sealed === true &&
    source.metadata?.continuity_qc_sealed === true &&
    Boolean(reviewHash) &&
    reviewHash === sourceHash;
}

function withoutPublishedState(metadata = {}, reviewId) {
  const current = object(metadata);
  if (
    text(current.cinematic_state_memory_review_task_id) !== text(reviewId) ||
    text(current.cinematic_state_memory?.contract) !== STATE_CONTRACT
  ) {
    return current;
  }
  const {
    cinematic_state_memory,
    cinematic_state_memory_contract,
    cinematic_state_memory_state_hash,
    cinematic_state_memory_chain_hash,
    cinematic_state_memory_review_task_id,
    cinematic_state_memory_source_task_id,
    cinematic_state_memory_published_at,
    cinematic_state_memory_reviewed_only,
    cinematic_state_memory_promptless,
    ...rest
  } = current;
  return rest;
}

async function rollbackPublishedAuthority(review = {}, source = {}) {
  if (source.shot_id) {
    const shot = await ShotRepository.get(source.shot_id);
    if (
      shot &&
      text(shot.organization_id) === text(source.organization_id) &&
      text(shot.creative_project_id) === text(source.creative_project_id)
    ) {
      const nextMetadata = withoutPublishedState(shot.metadata, review.id);
      if (nextMetadata !== shot.metadata) {
        await ShotRepository.update(shot.id, {
          metadata: {
            ...nextMetadata,
            continuity_qc_authority_guard_contract: CONTRACT,
            continuity_qc_authority_rollback_review_task_id: review.id,
            continuity_qc_authority_rollback_reason:
              "MATCHED_CONTINUITY_QC_SEAL_REQUIRED",
          },
        });
      }
    }
  }

  await ProductionTaskRuntime.update(source.id, {
    status: "FAILED",
    error: "CONTINUITY_QC_SEAL_REQUIRED_FOR_CINEMATIC_AUTHORITY",
    metadata: {
      ...object(source.metadata),
      continuity_qc_authority_guard_contract: CONTRACT,
      continuity_qc_authority_passed: false,
      continuity_qc_authority_rollback_applied: true,
      approved_for_downstream_after_perceptual_review: false,
      perceptual_validation_failed: true,
      rejected_before_editing: true,
    },
  });

  return ProductionTaskRuntime.update(review.id, {
    status: "FAILED",
    error: "CONTINUITY_QC_SEAL_REQUIRED_FOR_CINEMATIC_AUTHORITY",
    review: {
      ...object(review.review),
      required: false,
      approved: false,
      approved_by: "AVANTIQO_CONTINUITY_QC_AUTHORITY_GUARD",
    },
    metadata: {
      ...object(review.metadata),
      continuity_qc_authority_guard_contract: CONTRACT,
      continuity_qc_authority_passed: false,
      continuity_qc_authority_rollback_applied: true,
      automated_perceptual_validation_passed: false,
      generated_media_released_for_downstream: false,
    },
  });
}

async function enforce(review = {}) {
  if (!perceptualReview(review)) return review;
  const sourceId = sourceTaskId(review);
  const source = sourceId ? await ProductionTaskRuntime.get(sourceId) : null;
  if (!source || !cinemaSource(source)) return review;

  const authorityAttempted =
    text(review.status).toUpperCase() === "COMPLETED" ||
    review.metadata?.generated_media_released_for_downstream === true ||
    source.metadata?.approved_for_downstream_after_perceptual_review === true;
  if (!authorityAttempted) return review;

  if (!matchedQcSeal(review, source)) {
    return rollbackPublishedAuthority(review, source);
  }

  if (
    review.metadata?.continuity_qc_authority_guard_contract === CONTRACT &&
    review.metadata?.continuity_qc_authority_passed === true &&
    source.metadata?.continuity_qc_authority_passed === true
  ) {
    return review;
  }

  await ProductionTaskRuntime.update(source.id, {
    metadata: {
      ...object(source.metadata),
      continuity_qc_authority_guard_contract: CONTRACT,
      continuity_qc_authority_passed: true,
      continuity_qc_authority_seal_hash:
        source.metadata?.continuity_qc_seal_hash || null,
      cinematic_state_authority_requires_continuity_qc_seal: true,
    },
  });

  return ProductionTaskRuntime.update(review.id, {
    metadata: {
      ...object(review.metadata),
      continuity_qc_authority_guard_contract: CONTRACT,
      continuity_qc_authority_passed: true,
      continuity_qc_authority_seal_hash:
        review.metadata?.continuity_qc_seal_hash || null,
      cinematic_state_authority_requires_continuity_qc_seal: true,
    },
  });
}

function install() {
  if (ProductionTaskRuntime[INSTALL_FLAG]) return;
  const dispatchWithoutAuthorityGuard = ProductionTaskRuntime.dispatch.bind(
    ProductionTaskRuntime,
  );
  Object.defineProperty(ProductionTaskRuntime, INSTALL_FLAG, {
    value: true,
    enumerable: false,
    configurable: false,
  });

  ProductionTaskRuntime.dispatch = async function dispatchWithContinuityQcAuthorityGuard(id) {
    const before = await ProductionTaskRuntime.get(id);
    const shouldEnforce = perceptualReview(before);
    const result = await dispatchWithoutAuthorityGuard(id);
    if (!shouldEnforce) return result;
    const after = await ProductionTaskRuntime.get(id) || result;
    return after ? enforce(after) : result;
  };
}

install();

export const CreativeContinuityQcAuthorityGuardBootstrap = Object.freeze({
  installed: true,
  contract: CONTRACT,
  qcContract: QC_CONTRACT,
  sealContract: QC_SEAL_CONTRACT,
  matchedQcSeal,
  enforce,
  rollbackPublishedAuthority,
  fail_closed: true,
});
