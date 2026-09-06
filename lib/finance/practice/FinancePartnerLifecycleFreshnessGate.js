import { evaluateFinanceReviewEvidenceFreshness } from "@/lib/finance/practice/FinanceReviewEvidenceFreshness";
import { buildFinanceReviewerEvidence } from "@/lib/finance/practice/FinanceReviewerEvidenceRuntime";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

const FRESHNESS_CONCURRENCY = 4;

function clean(value) {
  return String(value ?? "").trim();
}

async function mapWithConcurrency(rows, limit, mapper) {
  const values = new Array(rows.length);
  let cursor = 0;
  async function worker() {
    while (cursor < rows.length) {
      const index = cursor;
      cursor += 1;
      values[index] = await mapper(rows[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(Math.max(1, limit), rows.length || 1) }, worker));
  return values;
}

function chooseReviewerWorkItem(rows) {
  return (rows || [])
    .slice()
    .sort((left, right) => {
      const leftReviewer = clean(left?.required_role).toUpperCase() === "REVIEWER" ? 1 : 0;
      const rightReviewer = clean(right?.required_role).toUpperCase() === "REVIEWER" ? 1 : 0;
      if (leftReviewer !== rightReviewer) return rightReviewer - leftReviewer;
      return Number(left?.sequence_no || 0) - Number(right?.sequence_no || 0);
    })[0] || null;
}

function unproven(reason, extra = {}) {
  return {
    state: "UNPROVEN",
    trusted: false,
    reason,
    changed_sections: [],
    changed_labels: [],
    ...extra,
  };
}

export async function evaluateFinancePartnerLifecycleFreshness({ run, reviewItems = [] }) {
  const accountingFirmId = clean(run?.accounting_firm_id);
  const runId = clean(run?.id);
  const clientOrganizationId = clean(run?.organization_id);
  const reviewItemIds = reviewItems.map((row) => clean(row?.id)).filter(Boolean);

  if (!accountingFirmId || !runId || !clientOrganizationId) {
    return {
      satisfied: false,
      checked_at: new Date().toISOString(),
      blockers: [{
        code: "REVIEW_EVIDENCE_FRESHNESS_SCOPE_REQUIRED",
        message: "Accounting firm, engagement run and client organization scope are required for final review freshness",
      }],
      review_items: [],
    };
  }

  if (!reviewItemIds.length) {
    return {
      satisfied: false,
      checked_at: new Date().toISOString(),
      blockers: [{
        code: "REVIEW_EVIDENCE_FRESHNESS_EMPTY",
        message: "No governed Finance review records exist for final lifecycle freshness validation",
      }],
      review_items: [],
    };
  }

  const [signoffsResult, workItemsResult] = await Promise.all([
    supabaseAdmin
      .from("finance_review_signoffs")
      .select("id,review_item_id,signoff_role,signed_by,signed_at,metadata,cycle_no")
      .eq("organization_id", clientOrganizationId)
      .in("review_item_id", reviewItemIds)
      .eq("signoff_role", "REVIEWER")
      .is("revoked_at", null),
    supabaseAdmin
      .from("accounting_engagement_work_items")
      .select("id,run_id,finance_review_item_id,title,status,work_type,step_key,required_role,assigned_to,sequence_no,capability_id")
      .eq("accounting_firm_id", accountingFirmId)
      .eq("run_id", runId)
      .in("finance_review_item_id", reviewItemIds),
  ]);
  if (signoffsResult.error) throw signoffsResult.error;
  if (workItemsResult.error) throw workItemsResult.error;

  const reviewerSignoffByReview = new Map(
    (signoffsResult.data || []).map((row) => [row.review_item_id, row]),
  );
  const workItemsByReview = new Map();
  for (const row of workItemsResult.data || []) {
    if (!row.finance_review_item_id) continue;
    if (!workItemsByReview.has(row.finance_review_item_id)) workItemsByReview.set(row.finance_review_item_id, []);
    workItemsByReview.get(row.finance_review_item_id).push(row);
  }

  const rows = await mapWithConcurrency(reviewItems, FRESHNESS_CONCURRENCY, async (reviewItem) => {
    const reviewerSignoff = reviewerSignoffByReview.get(reviewItem.id) || null;
    const sourceWorkItem = chooseReviewerWorkItem(workItemsByReview.get(reviewItem.id) || []);
    const base = {
      review_item_id: reviewItem.id,
      record_label: reviewItem.record_label || reviewItem.record_key || null,
      source_work_item_id: sourceWorkItem?.id || null,
      source_work_item_title: sourceWorkItem?.title || null,
      reviewer_owner_id: sourceWorkItem?.assigned_to || reviewerSignoff?.signed_by || null,
      reviewer_signed_by: reviewerSignoff?.signed_by || null,
      reviewer_signed_at: reviewerSignoff?.signed_at || null,
    };

    if (!reviewerSignoff) {
      return { ...base, freshness: unproven("Reviewer sign-off is missing at lifecycle completion") };
    }
    if (!sourceWorkItem) {
      return { ...base, freshness: unproven("Reviewer workpaper linkage is missing at lifecycle completion") };
    }

    try {
      const evidence = await buildFinanceReviewerEvidence({
        accountingFirmId,
        runId,
        workItemId: sourceWorkItem.id,
      });
      return {
        ...base,
        freshness: evaluateFinanceReviewEvidenceFreshness({ evidence, reviewerSignoff }),
      };
    } catch (error) {
      return {
        ...base,
        freshness: unproven(
          "Current reviewer evidence could not be completely rebuilt at lifecycle completion",
          { control_error: error?.message || "Evidence rebuild failed" },
        ),
      };
    }
  });

  const blockers = rows
    .filter((row) => row.freshness?.trusted !== true)
    .map((row) => ({
      code: row.freshness?.state === "STALE"
        ? "REVIEW_EVIDENCE_STALE_AT_LIFECYCLE"
        : "REVIEW_EVIDENCE_UNPROVEN_AT_LIFECYCLE",
      message: row.freshness?.state === "STALE"
        ? `${row.record_label || row.source_work_item_title || "Finance review"} changed after reviewer sign-off`
        : `${row.record_label || row.source_work_item_title || "Finance review"} does not have a current provable reviewer-evidence baseline`,
      review_item_id: row.review_item_id,
      source_work_item_id: row.source_work_item_id,
      source_work_item_title: row.source_work_item_title,
      reviewer_owner_id: row.reviewer_owner_id,
      freshness_state: row.freshness?.state || "UNPROVEN",
      reason: row.freshness?.reason || null,
      changed_sections: row.freshness?.changed_sections || [],
      changed_labels: row.freshness?.changed_labels || [],
    }));

  return {
    satisfied: blockers.length === 0,
    checked_at: new Date().toISOString(),
    review_item_count: rows.length,
    current_review_items: rows.filter((row) => row.freshness?.trusted === true).length,
    stale_or_unproven_review_items: blockers.length,
    blockers,
    review_items: rows,
  };
}
