import { supabaseAdmin } from "@/lib/shared/supabase/admin";

function text(value, limit = 4000) {
  return String(value ?? "").trim().slice(0, limit);
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

async function maybeExistingParty({ organizationId, email, phone }) {
  if (email) {
    const result = await supabaseAdmin
      .from("parties")
      .select("id,organization_id,party_type,display_name,email,phone,status,legal_name,address")
      .eq("organization_id", organizationId)
      .ilike("email", email)
      .limit(1)
      .maybeSingle();
    if (result.error) throw result.error;
    if (result.data) return result.data;
  }

  if (phone) {
    const result = await supabaseAdmin
      .from("parties")
      .select("id,organization_id,party_type,display_name,email,phone,status,legal_name,address")
      .eq("organization_id", organizationId)
      .eq("phone", phone)
      .limit(1)
      .maybeSingle();
    if (result.error) throw result.error;
    if (result.data) return result.data;
  }

  return null;
}

async function upsertSecretaryProfile({ organizationId, partyId, payload }) {
  const row = {
    organization_id: organizationId,
    party_id: partyId,
    relationship_label: text(payload.relationship_label || payload.relationshipLabel, 300) || null,
    preferred_language: text(payload.preferred_language || payload.preferredLanguage, 80) || null,
    timezone: text(payload.timezone, 120) || null,
    preferred_channel: text(payload.preferred_channel || payload.preferredChannel, 80) || null,
    allow_calls: payload.allow_calls !== false && payload.allowCalls !== false,
    allow_messages: payload.allow_messages !== false && payload.allowMessages !== false,
    do_not_disturb: object(payload.do_not_disturb || payload.doNotDisturb),
    important_notes: text(payload.important_notes || payload.importantNotes, 4000) || null,
    metadata: object(payload.metadata),
    updated_at: new Date().toISOString(),
  };

  const result = await supabaseAdmin
    .from("secretary_contact_profiles")
    .upsert(row, { onConflict: "organization_id,party_id" })
    .select("*")
    .single();
  if (result.error) throw result.error;
  return result.data;
}

export async function createSecretaryContact({ context, payload = {} } = {}) {
  const organizationId = text(context?.organizationId, 120);
  if (!organizationId) throw new Error("SECRETARY_ORGANIZATION_REQUIRED");

  const displayName = text(payload.display_name || payload.displayName, 500);
  const email = text(payload.email, 500).toLowerCase() || null;
  const phone = text(payload.phone, 120) || null;
  const partyType = text(payload.party_type || payload.partyType, 40).toLowerCase() || "person";
  if (!displayName) throw new Error("SECRETARY_CONTACT_NAME_REQUIRED");
  if (!email && !phone) throw new Error("SECRETARY_CONTACT_ADDRESS_REQUIRED");
  if (!["person", "company"].includes(partyType)) throw new Error("SECRETARY_CONTACT_PARTY_TYPE_INVALID");

  const existing = await maybeExistingParty({ organizationId, email, phone });
  if (existing) {
    const profile = await upsertSecretaryProfile({
      organizationId,
      partyId: existing.id,
      payload,
    });
    return {
      status: "completed",
      created: false,
      matched_existing_party: true,
      party: existing,
      secretary_profile: profile,
    };
  }

  const inserted = await supabaseAdmin
    .from("parties")
    .insert({
      organization_id: organizationId,
      party_type: partyType,
      display_name: displayName,
      email,
      phone,
      status: "active",
      legal_name: partyType === "company" ? text(payload.legal_name || payload.legalName, 500) || displayName : null,
      address: text(payload.address, 2000) || null,
      updated_at: new Date().toISOString(),
    })
    .select("id,organization_id,party_type,display_name,email,phone,status,legal_name,address")
    .single();
  if (inserted.error) throw inserted.error;

  try {
    const profile = await upsertSecretaryProfile({
      organizationId,
      partyId: inserted.data.id,
      payload,
    });
    return {
      status: "completed",
      created: true,
      matched_existing_party: false,
      party: inserted.data,
      secretary_profile: profile,
    };
  } catch (error) {
    try {
      await supabaseAdmin
        .from("parties")
        .delete()
        .eq("organization_id", organizationId)
        .eq("id", inserted.data.id);
    } catch (rollbackError) {
      console.error("SECRETARY_CONTACT_ROLLBACK_FAILED", {
        organization_id: organizationId,
        party_id: inserted.data.id,
        error: rollbackError?.message || rollbackError,
      });
    }
    throw error;
  }
}

export default createSecretaryContact;
