import {
  supabaseAdmin,
} from "@/lib/shared/supabase/admin";

const TABLE = "creative_outcome_observations";

function limitValue(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 100;
  return Math.max(1, Math.min(500, Math.floor(parsed)));
}

export async function createOrGet(observation = {}) {
  const { data, error } = await supabaseAdmin
    .from(TABLE)
    .insert(observation)
    .select("*")
    .single();

  if (!error) return { observation: data, created: true };

  if (String(error.code || "") !== "23505") {
    throw new Error(error.message);
  }

  const existing = await supabaseAdmin
    .from(TABLE)
    .select("*")
    .eq("organization_id", observation.organization_id)
    .eq("idempotency_key", observation.idempotency_key)
    .maybeSingle();

  if (existing.error) throw new Error(existing.error.message);
  if (!existing.data) throw new Error("CREATIVE_OUTCOME_IDEMPOTENCY_LOOKUP_FAILED");

  return { observation: existing.data, created: false };
}

export async function list({
  organization_id,
  creative_project_id = null,
  brand_id = null,
  campaign_id = null,
  eligible_for_direction = null,
  limit = 100,
} = {}) {
  if (!organization_id) throw new Error("organization_id required");

  let query = supabaseAdmin
    .from(TABLE)
    .select("*")
    .eq("organization_id", organization_id)
    .order("observed_at", { ascending: false })
    .limit(limitValue(limit));

  if (creative_project_id) {
    query = query.eq("creative_project_id", creative_project_id);
  }
  if (brand_id) query = query.eq("brand_id", brand_id);
  if (campaign_id) query = query.eq("campaign_id", campaign_id);
  if (typeof eligible_for_direction === "boolean") {
    query = query.eq("eligible_for_direction", eligible_for_direction);
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data || [];
}

export const CreativeOutcomeObservationRepository = Object.freeze({
  createOrGet,
  list,
});
