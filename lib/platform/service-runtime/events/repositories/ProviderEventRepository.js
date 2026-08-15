import crypto from "node:crypto";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

const TABLE = "event_bus";

function text(value) {
  return String(value ?? "").trim();
}

function deterministicUuid(value) {
  const bytes = Buffer.from(
    crypto.createHash("sha256").update(String(value || "")).digest().subarray(0, 16),
  );
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function normalize(row, duplicate = false) {
  const envelope = row?.payload && typeof row.payload === "object" ? row.payload : {};
  return {
    id: row.id,
    organization_id: row.organization_id,
    connection_id: envelope.connection_id || null,
    provider_id: envelope.provider_id || null,
    asset_id: envelope.asset_id || null,
    event_type: row.event_type,
    external_event_id: envelope.external_event_id || null,
    customer_reference: envelope.customer_reference || null,
    value: Number(envelope.value || 0),
    currency: envelope.currency || null,
    payload: envelope.provider_payload || {},
    status: row.status || null,
    processed_at: row.processed_at || null,
    created_at: row.created_at || null,
    duplicate,
  };
}

export async function create(record) {
  const organizationId = text(record?.organization_id);
  const providerId = text(record?.provider_id);
  const connectionId = text(record?.connection_id);
  const eventType = text(record?.event_type);
  const externalEventId = text(record?.external_event_id) || null;

  if (!organizationId || !providerId || !eventType) {
    throw new Error("PROVIDER_EVENT_SCOPE_REQUIRED");
  }

  const id = externalEventId
    ? deterministicUuid(
        `${organizationId}:${providerId}:${connectionId || "unbound"}:${externalEventId}`,
      )
    : crypto.randomUUID();

  const event = {
    id,
    organization_id: organizationId,
    event_type: eventType,
    status: "PENDING",
    processed_at: null,
    created_at: new Date().toISOString(),
    payload: {
      provider_event: true,
      provider_id: providerId,
      connection_id: connectionId || null,
      asset_id: record?.asset_id || null,
      external_event_id: externalEventId,
      customer_reference: record?.customer_reference || null,
      value: Number(record?.value || 0),
      currency: record?.currency || null,
      provider_payload:
        record?.payload && typeof record.payload === "object" ? record.payload : {},
    },
  };

  const inserted = await supabaseAdmin
    .from(TABLE)
    .insert(event)
    .select("*")
    .single();

  if (!inserted.error) return normalize(inserted.data, false);

  if (inserted.error.code === "23505") {
    const existing = await supabaseAdmin
      .from(TABLE)
      .select("*")
      .eq("id", id)
      .eq("organization_id", organizationId)
      .maybeSingle();
    if (existing.error) throw existing.error;
    if (existing.data) return normalize(existing.data, true);
  }

  throw inserted.error;
}

export async function listByOrganization(organization_id) {
  const { data, error } = await supabaseAdmin
    .from(TABLE)
    .select("*")
    .eq("organization_id", organization_id)
    .order("created_at", { ascending: false });

  if (error) throw error;

  return (data || [])
    .filter((row) => row?.payload?.provider_event === true)
    .map((row) => normalize(row));
}
