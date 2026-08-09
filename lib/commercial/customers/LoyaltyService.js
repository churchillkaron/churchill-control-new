import { randomUUID } from "node:crypto";

import { supabaseAdmin } from "@/lib/shared/supabase/admin";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function required(value, field) {
  const normalized = String(value ?? "").trim();
  if (!normalized) throw new Error(`${field} required`);
  return normalized;
}

function uuid(value, field) {
  const normalized = required(value, field);
  if (!UUID_PATTERN.test(normalized)) throw new Error(`${field} must be a UUID`);
  return normalized;
}

function optionalUuid(value, field) {
  if (value === null || value === undefined || value === "") return null;
  return uuid(value, field);
}

function numberOrNull(value, field) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) throw new Error(`${field} must be numeric`);
  return parsed;
}

function throwSupabase(error, fallback) {
  if (error) throw new Error(error.message || fallback);
}

export async function listLoyaltyWorkspace({ organizationId, partyId = null } = {}) {
  const organization_id = uuid(organizationId, "organization_id");

  let accountQuery = supabaseAdmin
    .from("customer_loyalty_accounts")
    .select(
      "id,organization_id,entity_id,party_id,program_id,tier_id,loyalty_points,total_spent,visit_count,tier,status,last_visit_at,created_at,updated_at"
    )
    .eq("organization_id", organization_id)
    .order("updated_at", { ascending: false });

  if (partyId) accountQuery = accountQuery.eq("party_id", uuid(partyId, "party_id"));

  const [accountsResult, programsResult, tiersResult, rewardsResult] = await Promise.all([
    accountQuery,
    supabaseAdmin
      .from("commercial_loyalty_programs")
      .select("*")
      .eq("organization_id", organization_id)
      .order("updated_at", { ascending: false }),
    supabaseAdmin
      .from("commercial_loyalty_tiers")
      .select("*")
      .eq("organization_id", organization_id)
      .order("rank", { ascending: true }),
    supabaseAdmin
      .from("commercial_loyalty_rewards")
      .select("*")
      .eq("organization_id", organization_id)
      .order("updated_at", { ascending: false }),
  ]);

  throwSupabase(accountsResult.error, "Unable to load loyalty accounts");
  throwSupabase(programsResult.error, "Unable to load loyalty programs");
  throwSupabase(tiersResult.error, "Unable to load loyalty tiers");
  throwSupabase(rewardsResult.error, "Unable to load loyalty rewards");

  const accounts = accountsResult.data || [];
  const partyIds = [...new Set(accounts.map((row) => row.party_id).filter(Boolean))];
  let parties = [];

  if (partyIds.length) {
    const partyResult = await supabaseAdmin
      .from("parties")
      .select("id,display_name,legal_name,email,phone,status")
      .eq("organization_id", organization_id)
      .in("id", partyIds);
    throwSupabase(partyResult.error, "Unable to load loyalty customer identities");
    parties = partyResult.data || [];
  }

  const partyMap = new Map(parties.map((party) => [party.id, party]));
  const rows = accounts.map((account) => ({
    ...account,
    customer: partyMap.get(account.party_id) || null,
  }));

  return {
    success: true,
    organization_id,
    rowCount: rows.length,
    rows,
    accounts: rows,
    programs: programsResult.data || [],
    tiers: tiersResult.data || [],
    rewards: rewardsResult.data || [],
  };
}

export async function listLoyaltyLedger({ organizationId, partyId, limit = 100 } = {}) {
  const organization_id = uuid(organizationId, "organization_id");
  const party_id = uuid(partyId, "party_id");
  const safeLimit = Math.max(1, Math.min(Number(limit) || 100, 500));

  const result = await supabaseAdmin
    .from("commercial_loyalty_ledger")
    .select("*")
    .eq("organization_id", organization_id)
    .eq("party_id", party_id)
    .order("created_at", { ascending: false })
    .limit(safeLimit);

  throwSupabase(result.error, "Unable to load loyalty ledger");
  return result.data || [];
}

export async function enrollPartyInLoyalty(input = {}) {
  const result = await supabaseAdmin.rpc("commercial_loyalty_enroll_party_idempotent", {
    p_organization_id: uuid(input.organization_id, "organization_id"),
    p_party_id: uuid(input.party_id, "party_id"),
    p_program_id: uuid(input.program_id, "program_id"),
    p_entity_id: optionalUuid(input.entity_id, "entity_id"),
    p_actor_id: optionalUuid(input.actor_id, "actor_id"),
    p_idempotency_key: required(input.idempotency_key, "idempotency_key"),
  });
  throwSupabase(result.error, "Unable to enroll loyalty customer");
  return result.data;
}

export async function applyLoyaltyPoints(input = {}) {
  const result = await supabaseAdmin.rpc("commercial_loyalty_apply_points_idempotent", {
    p_organization_id: uuid(input.organization_id, "organization_id"),
    p_party_id: uuid(input.party_id, "party_id"),
    p_points_delta: numberOrNull(input.points_delta, "points_delta"),
    p_entry_type: required(input.entry_type, "entry_type"),
    p_source_domain: input.source_domain || null,
    p_source_document_type: input.source_document_type || null,
    p_source_document_id: optionalUuid(input.source_document_id, "source_document_id"),
    p_source_event_id: optionalUuid(input.source_event_id, "source_event_id"),
    p_monetary_value: numberOrNull(input.monetary_value, "monetary_value"),
    p_currency_code: input.currency_code || null,
    p_metadata: input.metadata || {},
    p_actor_id: optionalUuid(input.actor_id, "actor_id"),
    p_idempotency_key: required(input.idempotency_key, "idempotency_key"),
  });
  throwSupabase(result.error, "Unable to apply loyalty points");
  return result.data;
}

export async function redeemLoyaltyReward(input = {}) {
  const result = await supabaseAdmin.rpc("commercial_loyalty_redeem_reward_idempotent", {
    p_redemption_id: optionalUuid(input.redemption_id, "redemption_id") || randomUUID(),
    p_organization_id: uuid(input.organization_id, "organization_id"),
    p_party_id: uuid(input.party_id, "party_id"),
    p_reward_id: uuid(input.reward_id, "reward_id"),
    p_actor_id: optionalUuid(input.actor_id, "actor_id"),
    p_source_document_type: input.source_document_type || null,
    p_source_document_id: optionalUuid(input.source_document_id, "source_document_id"),
    p_metadata: input.metadata || {},
    p_idempotency_key: required(input.idempotency_key, "idempotency_key"),
  });
  throwSupabase(result.error, "Unable to redeem loyalty reward");
  return result.data;
}

export async function createLoyaltyProgram(input = {}) {
  const organization_id = uuid(input.organization_id, "organization_id");
  const row = {
    id: optionalUuid(input.id, "id") || randomUUID(),
    organization_id,
    entity_id: optionalUuid(input.entity_id, "entity_id"),
    code: required(input.code, "code").toUpperCase(),
    name: required(input.name, "name"),
    status: String(input.status || "ACTIVE").toUpperCase(),
    earning_policy: input.earning_policy || {},
    redemption_policy: input.redemption_policy || {},
    finance_policy: input.finance_policy || {},
    starts_at: input.starts_at || null,
    ends_at: input.ends_at || null,
    created_by: optionalUuid(input.actor_id, "actor_id"),
  };
  const result = await supabaseAdmin.from("commercial_loyalty_programs").insert(row).select("*").single();
  throwSupabase(result.error, "Unable to create loyalty program");
  return result.data;
}

export async function createLoyaltyTier(input = {}) {
  const row = {
    id: optionalUuid(input.id, "id") || randomUUID(),
    organization_id: uuid(input.organization_id, "organization_id"),
    program_id: uuid(input.program_id, "program_id"),
    code: required(input.code, "code").toUpperCase(),
    name: required(input.name, "name"),
    rank: Number(input.rank || 0),
    min_points: numberOrNull(input.min_points, "min_points"),
    benefits: input.benefits || {},
    status: String(input.status || "ACTIVE").toUpperCase(),
  };
  const result = await supabaseAdmin.from("commercial_loyalty_tiers").insert(row).select("*").single();
  throwSupabase(result.error, "Unable to create loyalty tier");
  return result.data;
}

export async function createLoyaltyReward(input = {}) {
  const row = {
    id: optionalUuid(input.id, "id") || randomUUID(),
    organization_id: uuid(input.organization_id, "organization_id"),
    program_id: uuid(input.program_id, "program_id"),
    code: required(input.code, "code").toUpperCase(),
    name: required(input.name, "name"),
    description: input.description || null,
    points_cost: Number(required(input.points_cost, "points_cost")),
    monetary_value: numberOrNull(input.monetary_value, "monetary_value"),
    currency_code: input.currency_code ? String(input.currency_code).trim().toUpperCase() : null,
    finance_effect_type: input.finance_effect_type || null,
    inventory_item_id: optionalUuid(input.inventory_item_id, "inventory_item_id"),
    status: String(input.status || "ACTIVE").toUpperCase(),
    starts_at: input.starts_at || null,
    ends_at: input.ends_at || null,
    configuration: input.configuration || {},
  };
  const result = await supabaseAdmin.from("commercial_loyalty_rewards").insert(row).select("*").single();
  throwSupabase(result.error, "Unable to create loyalty reward");
  return result.data;
}

export default Object.freeze({
  listWorkspace: listLoyaltyWorkspace,
  listLedger: listLoyaltyLedger,
  enrollParty: enrollPartyInLoyalty,
  applyPoints: applyLoyaltyPoints,
  redeemReward: redeemLoyaltyReward,
  createProgram: createLoyaltyProgram,
  createTier: createLoyaltyTier,
  createReward: createLoyaltyReward,
});
