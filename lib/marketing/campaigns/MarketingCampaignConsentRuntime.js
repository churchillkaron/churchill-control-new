import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { getCustomer, listCustomers } from "@/lib/commercial/customers/CustomerService";

const CHANNELS = new Set(["email", "whatsapp", "line", "telegram", "sms", "push"]);
const STATUSES = new Set(["OPTED_IN", "OPTED_OUT", "SUPPRESSED"]);

function text(value) {
  return String(value ?? "").trim();
}

function normalizeChannel(value) {
  const channel = text(value).toLowerCase();
  if (!CHANNELS.has(channel)) throw new Error(`Unsupported marketing consent channel: ${channel || "missing"}`);
  return channel;
}

function normalizeStatus(value) {
  const status = text(value).toUpperCase();
  if (!STATUSES.has(status)) throw new Error(`Unsupported marketing consent status: ${status || "missing"}`);
  return status;
}

function governanceError(error) {
  const code = text(error?.code).toUpperCase();
  const message = text(error?.message);
  if (["PGRST205", "42P01"].includes(code) || /marketing_channel_preferences/i.test(message) && /does not exist|schema cache|could not find/i.test(message)) {
    const unavailable = new Error("Campaign consent governance migration is not deployed");
    unavailable.code = "MARKETING_CHANNEL_CONSENT_MIGRATION_REQUIRED";
    unavailable.status = 503;
    return unavailable;
  }
  return error;
}

function recipientAddress(customer, preference, channel) {
  const explicit = text(preference?.recipient_address);
  if (explicit) return explicit;
  if (channel === "email") return text(customer?.email || customer?.customer_email) || null;
  if (channel === "whatsapp" || channel === "sms") return text(customer?.phone || customer?.customer_phone) || null;
  return null;
}

function publicPreference(row = {}) {
  return {
    id: row.id,
    organization_id: row.organization_id,
    party_id: row.party_id,
    channel: row.channel,
    consent_status: row.consent_status,
    recipient_address: row.recipient_address || null,
    consent_source: row.consent_source,
    consent_evidence: row.consent_evidence || {},
    opted_in_at: row.opted_in_at || null,
    opted_out_at: row.opted_out_at || null,
    suppression_reason: row.suppression_reason || null,
    metadata: row.metadata || {},
    updated_at: row.updated_at || null,
  };
}

async function preference({ organizationId, partyId, channel }) {
  const normalizedChannel = normalizeChannel(channel);
  const { data, error } = await supabaseAdmin
    .from("marketing_channel_preferences")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("party_id", partyId)
    .eq("channel", normalizedChannel)
    .maybeSingle();
  if (error) throw governanceError(error);
  return data ? publicPreference(data) : null;
}

async function eligibility({ organizationId, partyId, channel }) {
  if (!organizationId) throw new Error("organization_id required");
  if (!partyId) throw new Error("party_id required");
  const normalizedChannel = normalizeChannel(channel);
  const [customer, current] = await Promise.all([
    getCustomer({ organizationId, partyId }),
    preference({ organizationId, partyId, channel: normalizedChannel }),
  ]);
  if (!customer) {
    return { eligible: false, state: "CUSTOMER_NOT_FOUND", channel: normalizedChannel, party_id: partyId, recipient: null, preference: current };
  }
  if (!current) {
    return { eligible: false, state: "NO_CHANNEL_CONSENT", channel: normalizedChannel, party_id: partyId, recipient: null, preference: null };
  }
  if (current.consent_status === "SUPPRESSED") {
    return { eligible: false, state: "SUPPRESSED", channel: normalizedChannel, party_id: partyId, recipient: null, preference: current };
  }
  if (current.consent_status !== "OPTED_IN") {
    return { eligible: false, state: "OPTED_OUT", channel: normalizedChannel, party_id: partyId, recipient: null, preference: current };
  }
  const recipient = recipientAddress(customer, current, normalizedChannel);
  if (!recipient) {
    return { eligible: false, state: "RECIPIENT_ADDRESS_REQUIRED", channel: normalizedChannel, party_id: partyId, recipient: null, preference: current };
  }
  return {
    eligible: true,
    state: "ELIGIBLE",
    channel: normalizedChannel,
    party_id: partyId,
    recipient,
    preference: current,
    customer: {
      id: customer.id,
      display_name: customer.display_name || customer.customer_name || customer.name || null,
    },
  };
}

async function upsertPreference({
  organizationId,
  partyId,
  channel,
  status,
  recipientAddress: address = null,
  source,
  evidence = {},
  suppressionReason = null,
  metadata = {},
  actorId = null,
}) {
  if (!organizationId) throw new Error("organization_id required");
  if (!partyId) throw new Error("party_id required");
  const normalizedChannel = normalizeChannel(channel);
  const normalizedStatus = normalizeStatus(status);
  const consentSource = text(source);
  if (!consentSource) throw new Error("consent_source required");
  if (normalizedStatus === "SUPPRESSED" && !text(suppressionReason)) throw new Error("suppression_reason required");
  const customer = await getCustomer({ organizationId, partyId });
  if (!customer) throw new Error("Customer not found for organization");
  const now = new Date().toISOString();
  const row = {
    organization_id: organizationId,
    party_id: partyId,
    channel: normalizedChannel,
    consent_status: normalizedStatus,
    recipient_address: text(address) || null,
    consent_source: consentSource,
    consent_evidence: evidence && typeof evidence === "object" && !Array.isArray(evidence) ? evidence : {},
    opted_in_at: normalizedStatus === "OPTED_IN" ? now : null,
    opted_out_at: normalizedStatus === "OPTED_OUT" ? now : null,
    suppression_reason: normalizedStatus === "SUPPRESSED" ? text(suppressionReason) : null,
    metadata: metadata && typeof metadata === "object" && !Array.isArray(metadata) ? metadata : {},
    updated_by: actorId || null,
    updated_at: now,
  };
  const { data, error } = await supabaseAdmin
    .from("marketing_channel_preferences")
    .upsert(row, { onConflict: "organization_id,party_id,channel" })
    .select("*")
    .single();
  if (error) throw governanceError(error);
  return publicPreference(data);
}

async function resolveEligibleAudience({ organizationId, channel, partyIds = null, limit = 500 }) {
  const normalizedChannel = normalizeChannel(channel);
  const safeLimit = Math.max(1, Math.min(Number(limit) || 500, 500));
  const customers = await listCustomers({ organizationId, limit: safeLimit });
  const requested = Array.isArray(partyIds) && partyIds.length ? new Set(partyIds.map(String)) : null;
  const candidates = customers.filter((customer) => !requested || requested.has(String(customer.party_id || customer.id)));
  if (!candidates.length) return { channel: normalizedChannel, eligible: [], blocked: [] };

  const ids = candidates.map((customer) => customer.party_id || customer.id);
  const { data, error } = await supabaseAdmin
    .from("marketing_channel_preferences")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("channel", normalizedChannel)
    .in("party_id", ids);
  if (error) throw governanceError(error);
  const byParty = new Map((data || []).map((row) => [String(row.party_id), publicPreference(row)]));
  const eligible = [];
  const blocked = [];
  for (const customer of candidates) {
    const partyId = customer.party_id || customer.id;
    const current = byParty.get(String(partyId)) || null;
    const recipient = recipientAddress(customer, current, normalizedChannel);
    if (current?.consent_status === "OPTED_IN" && recipient) {
      eligible.push({
        party_id: partyId,
        recipient,
        display_name: customer.display_name || customer.customer_name || customer.name || null,
        consent: {
          status: current.consent_status,
          source: current.consent_source || null,
          opted_in_at: current.opted_in_at || null,
          updated_at: current.updated_at || null,
        },
      });
    } else {
      blocked.push({
        party_id: partyId,
        state: current?.consent_status === "SUPPRESSED"
          ? "SUPPRESSED"
          : current?.consent_status === "OPTED_OUT"
            ? "OPTED_OUT"
            : current?.consent_status === "OPTED_IN"
              ? "RECIPIENT_ADDRESS_REQUIRED"
              : "NO_CHANNEL_CONSENT",
      });
    }
  }
  return { channel: normalizedChannel, eligible, blocked };
}

export const MarketingCampaignConsentRuntime = {
  preference,
  eligibility,
  upsertPreference,
  resolveEligibleAudience,
};

export default MarketingCampaignConsentRuntime;
