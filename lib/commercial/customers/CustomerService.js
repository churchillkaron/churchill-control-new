import { supabaseAdmin } from "@/lib/shared/supabase/admin";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function text(value) {
  const normalized = String(value ?? "").trim();
  return normalized || null;
}

function uuidOrNull(value) {
  const normalized = text(value);
  return normalized && UUID_PATTERN.test(normalized)
    ? normalized
    : null;
}

function numeric(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function boolean(value, fallback = false) {
  if (typeof value === "boolean") return value;
  if (value === "true" || value === "1" || value === 1) return true;
  if (value === "false" || value === "0" || value === 0) return false;
  return fallback;
}

function normalizedPartyType(value) {
  return ["COMPANY", "ORGANIZATION", "BUSINESS"].includes(
    String(value || "PERSON").trim().toUpperCase()
  )
    ? "company"
    : "person";
}

function actorId(access = {}) {
  return uuidOrNull(
    access.access?.staffAccountId ||
      access.staff?.id ||
      access.user?.id
  );
}

async function loadRowsByParty({ table, organizationId, partyIds }) {
  if (!partyIds.length) return [];

  let query = supabaseAdmin
    .from(table)
    .select("*")
    .in("party_id", partyIds);

  if (organizationId) {
    query = query.eq("organization_id", organizationId);
  }

  const result = await query;
  if (result.error) throw result.error;
  return result.data || [];
}

function mapByParty(rows) {
  return new Map(
    (rows || []).map((row) => [String(row.party_id), row])
  );
}

function customerSearchText(customer) {
  return [
    customer.customer_number,
    customer.customer_name,
    customer.legal_name,
    customer.customer_email,
    customer.customer_phone,
    customer.tax_number,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

export async function listCustomers({
  organizationId,
  query = "",
  limit = 200,
  partyId = null,
}) {
  if (!uuidOrNull(organizationId)) {
    const error = new Error("organization_id required");
    error.status = 400;
    throw error;
  }

  const safeLimit = Math.max(1, Math.min(Number(limit) || 200, 500));
  const requestedPartyId = uuidOrNull(partyId);

  let relationshipQuery = supabaseAdmin
    .from("party_relationships")
    .select("party_id, status, start_date, end_date, created_at, updated_at")
    .eq("organization_id", organizationId)
    .eq("relationship_type", "customer")
    .or("status.is.null,status.neq.archived")
    .order("created_at", { ascending: false })
    .limit(safeLimit);

  if (requestedPartyId) {
    relationshipQuery = relationshipQuery.eq("party_id", requestedPartyId);
  }

  const relationshipResult = await relationshipQuery;
  if (relationshipResult.error) throw relationshipResult.error;

  const relationships = relationshipResult.data || [];
  const partyIds = [
    ...new Set(relationships.map((row) => row.party_id).filter(Boolean)),
  ];

  if (!partyIds.length) return [];

  const [partyResult, profileRows, personRows, companyRows, loyaltyRows] =
    await Promise.all([
      supabaseAdmin
        .from("parties")
        .select("*")
        .eq("organization_id", organizationId)
        .in("id", partyIds),
      loadRowsByParty({
        table: "customer_profiles",
        organizationId,
        partyIds,
      }),
      loadRowsByParty({
        table: "party_person_profiles",
        organizationId,
        partyIds,
      }),
      loadRowsByParty({
        table: "party_company_profiles",
        organizationId,
        partyIds,
      }),
      loadRowsByParty({
        table: "customer_loyalty_accounts",
        organizationId,
        partyIds,
      }),
    ]);

  if (partyResult.error) throw partyResult.error;

  const partyById = new Map(
    (partyResult.data || []).map((row) => [String(row.id), row])
  );
  const profileByParty = mapByParty(profileRows);
  const personByParty = mapByParty(personRows);
  const companyByParty = mapByParty(companyRows);
  const loyaltyByParty = mapByParty(loyaltyRows);

  const customers = relationships
    .map((relationship) => {
      const key = String(relationship.party_id);
      const party = partyById.get(key);
      if (!party) return null;

      const profile = profileByParty.get(key) || {};
      const person = personByParty.get(key) || {};
      const company = companyByParty.get(key) || {};
      const loyalty = loyaltyByParty.get(key) || {};
      const companyCustomer = party.party_type === "company";

      return {
        id: party.id,
        party_id: party.id,
        organization_id: party.organization_id,
        customer_number: profile.customer_number || null,
        customer_name: party.display_name,
        name: party.display_name,
        display_name: party.display_name,
        customer_type: companyCustomer ? "COMPANY" : "PERSON",
        party_type: party.party_type,
        company_name:
          company.legal_name || party.legal_name ||
          (companyCustomer ? party.display_name : null),
        legal_name: company.legal_name || party.legal_name || null,
        customer_email: party.email || null,
        email: party.email || null,
        customer_phone: party.phone || null,
        phone: party.phone || null,
        tax_number: company.tax_number || party.tax_id || null,
        tax_id: company.tax_number || party.tax_id || null,
        billing_address:
          profile.billing_address || company.billing_address || party.address || null,
        shipping_address:
          profile.shipping_address || company.shipping_address || null,
        address: party.address || profile.billing_address || null,
        city: profile.city || null,
        state: profile.state || null,
        postal_code: profile.postal_code || null,
        country: profile.country || null,
        preferred_language: profile.preferred_language || null,
        preferred_currency: profile.preferred_currency || null,
        credit_limit: numeric(profile.credit_limit),
        payment_terms: profile.payment_terms || null,
        birthday: person.birthday || null,
        notes: profile.notes || null,
        marketing_opt_in: boolean(profile.marketing_opt_in),
        loyalty_points: numeric(loyalty.loyalty_points),
        total_spent: numeric(loyalty.total_spent),
        visit_count: numeric(loyalty.visit_count),
        tier: loyalty.tier || null,
        vip_score: numeric(loyalty.vip_score),
        status:
          profile.status || relationship.status || party.status || "ACTIVE",
        relationship_status: relationship.status || null,
        created_at: party.created_at || relationship.created_at || null,
        updated_at: party.updated_at || relationship.updated_at || null,
      };
    })
    .filter(Boolean);

  const normalizedQuery = String(query || "").trim().toLowerCase();
  return normalizedQuery
    ? customers.filter((customer) =>
        customerSearchText(customer).includes(normalizedQuery)
      )
    : customers;
}

export async function getCustomer({ organizationId, partyId }) {
  const customers = await listCustomers({
    organizationId,
    partyId,
    limit: 1,
  });

  return customers[0] || null;
}

export async function upsertCustomerParty({
  access = {},
  body = {},
  organizationId,
}) {
  const nested =
    body.customer && typeof body.customer === "object"
      ? body.customer
      : {};
  const source = { ...nested, ...body };
  const displayName = text(
    source.customer_name ||
      source.display_name ||
      source.company_name ||
      source.name
  );

  if (!displayName) {
    const error = new Error("Customer name required");
    error.status = 400;
    throw error;
  }

  const partyType = normalizedPartyType(
    source.party_type || source.customer_type
  );
  const result = await supabaseAdmin.rpc(
    "commercial_upsert_customer_party_atomic",
    {
      p_organization_id: organizationId,
      p_party_id: uuidOrNull(source.party_id || source.partyId || source.id),
      p_party_type: partyType,
      p_display_name: displayName,
      p_email: text(source.customer_email || source.email),
      p_phone: text(source.customer_phone || source.phone),
      p_legal_name: text(source.legal_name || source.company_name),
      p_tax_id: text(source.tax_id || source.tax_number),
      p_address: text(source.address || source.billing_address),
      p_customer_number: text(source.customer_number),
      p_credit_limit: numeric(source.credit_limit),
      p_payment_terms: text(source.payment_terms),
      p_preferred_language: text(source.preferred_language),
      p_preferred_currency: text(source.preferred_currency),
      p_billing_address: text(source.billing_address),
      p_shipping_address: text(source.shipping_address),
      p_city: text(source.city),
      p_state: text(source.state),
      p_postal_code: text(source.postal_code),
      p_country: text(source.country),
      p_birthday: text(source.birthday),
      p_notes: text(source.notes),
      p_marketing_opt_in: boolean(source.marketing_opt_in),
      p_actor_id: actorId(access),
    }
  );

  if (result.error) {
    const unavailable =
      ["PGRST202", "PGRST205", "42883"].includes(result.error.code) ||
      /commercial_upsert_customer_party_atomic/i.test(
        result.error.message || ""
      );

    if (unavailable) {
      const error = new Error(
        "Canonical Commercial customer-party migration is not deployed"
      );
      error.status = 503;
      throw error;
    }

    throw result.error;
  }

  const partyId = uuidOrNull(result.data?.party_id);
  const customer = partyId
    ? await getCustomer({ organizationId, partyId })
    : null;

  return {
    ...(result.data || {}),
    success: true,
    party_id: partyId,
    customer,
  };
}

export default {
  getCustomer,
  listCustomers,
  upsertCustomerParty,
};
