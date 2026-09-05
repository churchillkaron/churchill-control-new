// Released-knowledge authenticity lifecycle: fail closed and reseal every trusted mutation.
import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import {
  AVANTIQO_FINAL_KNOWLEDGE_RELEASE_CONTRACT,
  reconcileAvantiqoReleasedKnowledgeRevalidation,
} from "@/lib/intelligence/runtime/AvantiqoFinalKnowledgeReleaseRuntime";
import {
  createAvantiqoReleasedKnowledgeAuthenticityVerifier,
  sealAvantiqoReleasedKnowledgeAuthenticity,
} from "@/lib/intelligence/runtime/AvantiqoReleasedKnowledgeAuthenticityRuntime";

export const AVANTIQO_RELEASED_KNOWLEDGE_LIFECYCLE_CONTRACT =
  "AVANTIQO_RELEASED_KNOWLEDGE_LIFECYCLE_V2";

const MEMORY_TABLE = "intelligence_memories";
const KNOWLEDGE_SCOPE = "platform_knowledge";
const RELEASE_SOURCE = "avantiqo_explicit_final_knowledge_release";
const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_ROWS = 500;

function text(value, limit = 12000) {
  return String(value ?? "").trim().slice(0, limit);
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

function learningOrganizationId() {
  return text(process.env.AVANTIQO_INTELLIGENCE_LEARNING_ORGANIZATION_ID, 160);
}

function validityDays(stability) {
  return text(stability, 40).toLowerCase() === "mutable" ? 30 : 90;
}

async function renewHealthyRows({ organizationId, startedAt, persist }) {
  if (!persist) {
    return {
      inspected_count: 0,
      renewed_count: 0,
      renewal_performed: false,
      authenticity_verified_count: 0,
      authenticity_reseal_failure_count: 0,
    };
  }

  const verifier = createAvantiqoReleasedKnowledgeAuthenticityVerifier();
  if (verifier.available !== true) {
    return {
      inspected_count: 0,
      renewed_count: 0,
      renewal_performed: false,
      authenticity_verified_count: 0,
      authenticity_reseal_failure_count: 0,
      blocked: true,
      reason: "RELEASED_KNOWLEDGE_AUTHENTICITY_KEYRING_REQUIRED",
    };
  }

  const result = await supabaseAdmin
    .from(MEMORY_TABLE)
    .select("id,organization_id,party_id,entity_id,conversation_id,source_turn_id,memory_scope,memory_key,memory_type,subject,content,importance,confidence,source,active,valid_until,superseded_by,superseded_at,forgotten_at,metadata,updated_at,created_at")
    .eq("organization_id", organizationId)
    .eq("memory_scope", KNOWLEDGE_SCOPE)
    .eq("source", RELEASE_SOURCE)
    .eq("active", true)
    .order("updated_at", { ascending: false })
    .limit(MAX_ROWS);
  if (result.error) throw result.error;

  let renewedCount = 0;
  let authenticityVerifiedCount = 0;
  let authenticityResealFailureCount = 0;
  for (const row of list(result.data)) {
    const metadata = object(row.metadata);
    if (text(metadata.release_status, 80) !== "RELEASED_MONITORED") continue;
    if (!verifier.verify(row)) continue;
    authenticityVerifiedCount += 1;

    const revalidatedAt = Date.parse(text(metadata.last_revalidated_at, 120));
    if (!Number.isFinite(revalidatedAt) || revalidatedAt < startedAt) continue;

    const days = validityDays(metadata.stability);
    const validUntil = new Date(revalidatedAt + days * DAY_MS).toISOString();
    const nowIso = new Date().toISOString();
    const nextMetadata = {
      ...metadata,
      release_validity_days: days,
      valid_until_renewed_at: nowIso,
      valid_until_renewed_from_revalidation_at: metadata.last_revalidated_at,
      ttl_renewal_requires_successful_revalidation: true,
      released_knowledge_authenticity_resealed_after_ttl_renewal: true,
    };
    const resealed = sealAvantiqoReleasedKnowledgeAuthenticity({
      ...row,
      valid_until: validUntil,
      metadata: nextMetadata,
    });
    if (resealed.success !== true || !resealed.row) {
      authenticityResealFailureCount += 1;
      continue;
    }

    const update = await supabaseAdmin
      .from(MEMORY_TABLE)
      .update({
        valid_until: validUntil,
        metadata: resealed.row.metadata,
        updated_at: nowIso,
      })
      .eq("organization_id", organizationId)
      .eq("id", row.id)
      .eq("updated_at", row.updated_at)
      .select("id")
      .maybeSingle();
    if (update.error) throw update.error;
    if (update.data?.id) renewedCount += 1;
  }

  return {
    inspected_count: list(result.data).length,
    renewed_count: renewedCount,
    renewal_performed: renewedCount > 0,
    authenticity_verified_count: authenticityVerifiedCount,
    authenticity_reseal_failure_count: authenticityResealFailureCount,
  };
}

export async function reconcileAvantiqoReleasedKnowledgeLifecycle({ persist = true } = {}) {
  const startedAt = Date.now();
  const organizationId = learningOrganizationId();
  const revalidation = await reconcileAvantiqoReleasedKnowledgeRevalidation({ persist });

  if (!organizationId || revalidation.status === "DISABLED") {
    return {
      ...revalidation,
      lifecycle_contract: AVANTIQO_RELEASED_KNOWLEDGE_LIFECYCLE_CONTRACT,
      ttl_renewal: {
        inspected_count: 0,
        renewed_count: 0,
        renewal_performed: false,
        authenticity_verified_count: 0,
        authenticity_reseal_failure_count: 0,
      },
    };
  }

  const ttlRenewal = await renewHealthyRows({ organizationId, startedAt, persist });
  return {
    ...revalidation,
    final_release_contract: AVANTIQO_FINAL_KNOWLEDGE_RELEASE_CONTRACT,
    lifecycle_contract: AVANTIQO_RELEASED_KNOWLEDGE_LIFECYCLE_CONTRACT,
    ttl_renewal: ttlRenewal,
    lifecycle_policy: {
      healthy_revalidation_renews_valid_until: true,
      quarantine_never_renews_valid_until: true,
      ttl_renewal_requires_same_cycle_successful_revalidation: true,
      ttl_renewal_requires_valid_released_knowledge_authenticity: true,
      ttl_renewal_reseals_released_knowledge_authenticity: true,
      unsigned_legacy_release_renewal_allowed: false,
      database_only_ttl_extension_allowed: false,
      automatic_unquarantine_allowed: false,
      provider_free: true,
    },
    governance: {
      ...object(revalidation.governance),
      released_knowledge_authenticity_required_for_ttl_renewal: true,
      automatic_knowledge_release: false,
      automatic_unquarantine: false,
      runpod_job_submitted: false,
      runpod_endpoint_mutated: false,
      authorization_effect: "NONE",
    },
  };
}

export const AvantiqoReleasedKnowledgeLifecycleRuntime = Object.freeze({
  contract: AVANTIQO_RELEASED_KNOWLEDGE_LIFECYCLE_CONTRACT,
  reconcile: reconcileAvantiqoReleasedKnowledgeLifecycle,
});
