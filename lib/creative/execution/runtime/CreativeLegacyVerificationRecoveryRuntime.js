import crypto from "node:crypto";

import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import {
  CreativeExecutionStepRepository,
} from "@/lib/creative/execution/repositories/CreativeExecutionStepRepository";
import {
  WalletRuntime,
} from "@/lib/platform/service-runtime/wallet/runtime/WalletRuntime";
import {
  UsageRuntime,
} from "@/lib/platform/service-runtime/usage/UsageRuntime";

function text(value) {
  return String(value ?? "").trim();
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function fingerprint({ candidateId, excerptId, fraction, identity }) {
  return crypto.createHash("sha256").update(JSON.stringify({
    candidate_id: candidateId,
    excerpt_id: excerptId,
    fraction,
    project_shortlist_identity: identity,
    runtime: "checkpointed-shortlist-frame-v1",
  })).digest("hex");
}

async function projectNodes({ organizationId, projectId }) {
  const { data, error } = await supabaseAdmin
    .from("creative_asset_nodes")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("creative_project_id", projectId)
    .neq("status", "ARCHIVED")
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data || [];
}

async function projectUsage({ organizationId, excerptIds }) {
  if (!excerptIds.length) return [];
  const { data, error } = await supabaseAdmin
    .from("platform_service_usage")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("capability", "ai.image.analyze")
    .in("metadata->>source_asset_node_id", excerptIds)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data || [];
}

async function usageTransactions({ organizationId, usageId }) {
  const { data, error } = await supabaseAdmin
    .from("wallet_transactions")
    .select("*")
    .eq("organization_id", organizationId)
    .or(`usage_id.eq.${usageId},reference.eq.${usageId},reference.like.${usageId}:%`)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data || [];
}

function total(rows, type) {
  return rows
    .filter((row) => text(row.type).toUpperCase() === type)
    .reduce((sum, row) => sum + finite(row.amount), 0);
}

async function closePendingUsage({ organizationId, usage }) {
  const transactions = await usageTransactions({
    organizationId,
    usageId: usage.id,
  });
  const reserve = total(transactions, "RESERVE");
  const release = total(transactions, "RELEASE");
  const charge = total(transactions, "CHARGE");
  const openReservation = Number(Math.max(0, reserve - release - charge).toFixed(6));

  if (usage.status === "PENDING") {
    await UsageRuntime.fail({
      usage_id: usage.id,
      error: new Error("LEGACY_CREATIVE_PROVIDER_OUTCOME_RECONCILED"),
      metadata: {
        ...object(usage.metadata),
        reconciliation: {
          type: "LEGACY_CREATIVE_CHECKPOINT_IMPORT",
          provider_result_confirmed: false,
          counted_against_call_limit: reserve > 0,
          reconciled_at: new Date().toISOString(),
          production_started: false,
        },
      },
    });
  }

  if (openReservation > 0) {
    await WalletRuntime.release({
      organization_id: organizationId,
      amount: openReservation,
      provider: usage.provider || "openai",
      reference: `${usage.id}:legacy-creative-reconciliation`,
      currency: usage.currency || null,
      metadata: {
        usage_id: usage.id,
        reconciliation: "LEGACY_CREATIVE_CHECKPOINT_IMPORT",
        production_started: false,
      },
    });
  }

  return {
    reserve,
    release,
    charge,
    open_reservation_released: openReservation,
    counted_call: usage.status === "SUCCESS" || reserve > 0,
  };
}

export const CreativeLegacyVerificationRecoveryRuntime = {
  async reconcile({
    job,
    project_shortlist_identity,
    sample_fractions = [0.35, 0.7],
  } = {}) {
    if (!job?.id || !job?.lease_token) {
      throw new Error("CREATIVE_RECOVERY_ACTIVE_JOB_REQUIRED");
    }

    const nodes = await projectNodes({
      organizationId: job.organization_id,
      projectId: job.creative_project_id,
    });
    const candidates = nodes.filter((node) =>
      node.type === "MOMENT" &&
      node.metadata?.local_shortlist_candidate === true &&
      node.metadata?.selected_for_ai_verification === true &&
      text(node.metadata?.project_shortlist_identity) ===
        text(project_shortlist_identity),
    );
    const excerpts = nodes.filter((node) =>
      node.type === "VIDEO" &&
      text(node.metadata?.project_shortlist_identity) ===
        text(project_shortlist_identity) &&
      Boolean(node.metadata?.local_shortlist_candidate_id),
    );
    const excerptsByCandidate = new Map();
    for (const excerpt of excerpts) {
      const candidateId = text(excerpt.metadata?.local_shortlist_candidate_id);
      if (!excerptsByCandidate.has(candidateId)) excerptsByCandidate.set(candidateId, []);
      excerptsByCandidate.get(candidateId).push(excerpt);
    }
    const usages = await projectUsage({
      organizationId: job.organization_id,
      excerptIds: excerpts.map((item) => item.id),
    });
    const imported = [];

    for (const candidate of candidates) {
      const status = text(candidate.metadata?.ai_verification_status).toUpperCase();
      const recordedCalls = finite(candidate.metadata?.paid_analysis_calls);
      const candidateExcerpts = excerptsByCandidate.get(candidate.id) || [];
      const excerpt = candidateExcerpts.at(-1) || null;
      const candidateUsage = usages.filter((usage) =>
        candidateExcerpts.some((item) =>
          item.id === text(usage.metadata?.source_asset_node_id),
        ),
      );
      const observedCalls = candidateUsage.length;
      const callCount = Math.min(
        sample_fractions.length,
        Math.max(recordedCalls, observedCalls),
      );
      if (!excerpt || callCount <= 0) continue;

      for (let index = 0; index < callCount; index += 1) {
        const fraction = sample_fractions[index];
        const step = await CreativeExecutionStepRepository.claim({
          job_id: job.id,
          job_lease_token: job.lease_token,
          step_key: `shortlist-frame:${candidate.id}:${index}`,
          step_type: "AI_IMAGE_ANALYZE",
          input_fingerprint: fingerprint({
            candidateId: candidate.id,
            excerptId: excerpt.id,
            fraction,
            identity: project_shortlist_identity,
          }),
          payload: {
            candidate_id: candidate.id,
            excerpt_node_id: excerpt.id,
            sample_fraction: fraction,
            sample_index: index,
            imported_from_legacy_execution: true,
            production_started: false,
          },
          lease_seconds: 900,
        });
        if (["COMPLETED", "AMBIGUOUS"].includes(step.status)) continue;

        const usage = candidateUsage[index] || null;
        let reconciliation = null;
        if (usage) {
          reconciliation = await closePendingUsage({
            organizationId: job.organization_id,
            usage,
          });
        }
        const terminal = status === "COMPLETE" && usage?.status === "SUCCESS";
        const stepStatus = terminal ? "COMPLETED" : "AMBIGUOUS";
        await CreativeExecutionStepRepository.reconcile({
          step_id: step.id,
          status: stepStatus,
          result: {
            usable: terminal,
            verified_moment_ids: terminal
              ? (candidate.metadata?.verified_moment_ids || [])
              : [],
            reason: terminal
              ? "LEGACY_SUCCESS_IMPORTED"
              : "LEGACY_CALL_IMPORTED_CONSERVATIVELY",
            imported_from_legacy_execution: true,
            production_started: false,
          },
          error: terminal ? {} : {
            code: "LEGACY_PROVIDER_OUTCOME_NOT_REPLAYABLE",
            retry_same_frame: false,
          },
          usage_ids: usage ? [usage.id] : [],
          provider_call_count: 1,
        });
        imported.push({
          candidate_id: candidate.id,
          sample_index: index,
          usage_id: usage?.id || null,
          status: stepStatus,
          reconciliation,
        });
      }
    }

    return {
      imported_step_count: imported.length,
      imported,
      production_started: false,
    };
  },
};
