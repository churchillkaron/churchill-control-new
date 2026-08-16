import { supabaseAdmin } from "@/lib/shared/supabase/admin";

const CONVERSATION_COLUMNS = "id,organization_id,connection_id,provider,channel_type,external_thread_id,external_participant_id,external_participant_name,external_participant_address,customer_party_id,subject,status,unread_count,last_message_at,last_inbound_at,last_outbound_at,metadata,created_at,updated_at";
const MESSAGE_COLUMNS = "id,organization_id,conversation_id,connection_id,provider,channel_type,direction,message_type,external_message_id,sender_address,recipient_address,subject,body,status,sent_by_party_id,error_code,error_message,sent_at,received_at,metadata,created_at,updated_at";
const ATTACHMENT_COLUMNS = "id,organization_id,message_id,storage_path,external_url,file_name,mime_type,size_bytes,metadata,created_at,updated_at";
const IN_FILTER_CHUNK_SIZE = 50;

function chunkValues(values = [], size = IN_FILTER_CHUNK_SIZE) {
  const rows = [...new Set((values || []).filter(Boolean))];
  const chunks = [];
  for (let index = 0; index < rows.length; index += size) {
    chunks.push(rows.slice(index, index + size));
  }
  return chunks;
}

export async function listConversations({ organizationId, provider = null, search = null, limit = 250 }) {
  let query = supabaseAdmin
    .from("communication_conversations")
    .select(CONVERSATION_COLUMNS)
    .eq("organization_id", organizationId)
    .order("last_message_at", { ascending: false, nullsFirst: false })
    .order("updated_at", { ascending: false })
    .limit(Math.min(Math.max(Number(limit) || 250, 1), 250));

  if (provider) query = query.eq("provider", provider);
  if (search) {
    const pattern = `%${String(search).trim().replace(/[%_,()]/g, " ")}%`;
    query = query.or(`external_participant_name.ilike.${pattern},external_participant_address.ilike.${pattern},subject.ilike.${pattern}`);
  }

  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

export async function getConversation({ organizationId, conversationId }) {
  const { data, error } = await supabaseAdmin
    .from("communication_conversations")
    .select(CONVERSATION_COLUMNS)
    .eq("organization_id", organizationId)
    .eq("id", conversationId)
    .maybeSingle();
  if (error) throw error;
  return data || null;
}

export async function createConversation(row) {
  const { data, error } = await supabaseAdmin
    .from("communication_conversations")
    .insert(row)
    .select(CONVERSATION_COLUMNS)
    .single();
  if (error) throw error;
  return data;
}

export async function updateConversation({ organizationId, conversationId, patch }) {
  const { data, error } = await supabaseAdmin
    .from("communication_conversations")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("organization_id", organizationId)
    .eq("id", conversationId)
    .select(CONVERSATION_COLUMNS)
    .single();
  if (error) throw error;
  return data;
}

export async function listMessages({ organizationId, conversationId, limit = 100 }) {
  const cappedLimit = Math.min(Math.max(Number(limit) || 100, 1), 100);
  const { data, error } = await supabaseAdmin
    .from("communication_messages")
    .select(MESSAGE_COLUMNS)
    .eq("organization_id", organizationId)
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: false })
    .limit(cappedLimit);
  if (error) throw error;
  return [...(data || [])].reverse();
}

export async function getMessage({ organizationId, conversationId, messageId }) {
  const { data, error } = await supabaseAdmin
    .from("communication_messages")
    .select(MESSAGE_COLUMNS)
    .eq("organization_id", organizationId)
    .eq("conversation_id", conversationId)
    .eq("id", messageId)
    .maybeSingle();
  if (error) throw error;
  return data || null;
}

export async function listLatestMessages({ organizationId, conversationIds = [] }) {
  const ids = [...new Set((conversationIds || []).filter(Boolean))];
  if (!ids.length) return [];

  const rows = [];
  for (const chunk of chunkValues(ids)) {
    const { data, error } = await supabaseAdmin
      .from("communication_messages")
      .select(MESSAGE_COLUMNS)
      .eq("organization_id", organizationId)
      .in("conversation_id", chunk)
      .order("created_at", { ascending: false })
      .limit(Math.min(chunk.length * 8, 400));
    if (error) throw error;
    rows.push(...(data || []));
  }

  return rows
    .sort((left, right) => new Date(right.created_at || 0).getTime() - new Date(left.created_at || 0).getTime())
    .slice(0, Math.min(ids.length * 8, 800));
}

export async function listAttachments({ organizationId, messageIds = [] }) {
  const ids = [...new Set((messageIds || []).filter(Boolean))];
  if (!ids.length) return [];

  const rows = [];
  for (const chunk of chunkValues(ids)) {
    const { data, error } = await supabaseAdmin
      .from("communication_attachments")
      .select(ATTACHMENT_COLUMNS)
      .eq("organization_id", organizationId)
      .in("message_id", chunk)
      .order("created_at", { ascending: true });
    if (error) throw error;
    rows.push(...(data || []));
  }

  return rows.sort(
    (left, right) => new Date(left.created_at || 0).getTime() - new Date(right.created_at || 0).getTime(),
  );
}

export async function createAttachments(rows = []) {
  const safeRows = (rows || []).filter((row) => row?.message_id && (row?.storage_path || row?.external_url));
  if (!safeRows.length) return [];
  const { data, error } = await supabaseAdmin
    .from("communication_attachments")
    .insert(safeRows)
    .select(ATTACHMENT_COLUMNS);
  if (error) throw error;
  return data || [];
}

export async function listDeliveryExceptions({
  organizationId,
  since,
  limit = 100,
}) {
  let query = supabaseAdmin
    .from("communication_messages")
    .select(
      "id,conversation_id,provider,channel_type,status,error_code,error_message,created_at,updated_at",
    )
    .eq("organization_id", organizationId)
    .eq("direction", "OUTBOUND")
    .in("status", ["FAILED", "QUEUED", "SENDING"])
    .order("updated_at", { ascending: false })
    .limit(Math.min(Math.max(Number(limit) || 100, 1), 250));

  if (since) query = query.gte("updated_at", since);

  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

export async function createMessage(row) {
  const { data, error } = await supabaseAdmin
    .from("communication_messages")
    .insert(row)
    .select(MESSAGE_COLUMNS)
    .single();
  if (error) throw error;
  return data;
}

export async function updateMessage({ organizationId, messageId, patch }) {
  const { data, error } = await supabaseAdmin
    .from("communication_messages")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("organization_id", organizationId)
    .eq("id", messageId)
    .select(MESSAGE_COLUMNS)
    .single();
  if (error) throw error;
  return data;
}

export async function queueDraftMessage({
  organizationId,
  conversationId,
  messageId,
}) {
  const { data, error } = await supabaseAdmin
    .from("communication_messages")
    .update({
      status: "QUEUED",
      error_code: null,
      error_message: null,
      updated_at: new Date().toISOString(),
    })
    .eq("organization_id", organizationId)
    .eq("conversation_id", conversationId)
    .eq("id", messageId)
    .eq("direction", "OUTBOUND")
    .eq("status", "DRAFT")
    .select(MESSAGE_COLUMNS)
    .maybeSingle();
  if (error) throw error;
  return data || null;
}

export async function getActiveConnection({ organizationId, connectionId }) {
  const { data, error } = await supabaseAdmin
    .from("organization_channel_connections")
    .select("id,organization_id,provider,channel_type,name,external_account_id,external_asset_id,status,metadata,updated_at")
    .eq("organization_id", organizationId)
    .eq("id", connectionId)
    .maybeSingle();
  if (error) throw error;
  if (!data || String(data.status || "").toUpperCase() !== "ACTIVE") return null;
  return data;
}

export async function listActiveConnections({ organizationId }) {
  const { data, error } = await supabaseAdmin
    .from("organization_channel_connections")
    .select("id,provider,channel_type,name,external_account_id,external_asset_id,status,metadata,updated_at")
    .eq("organization_id", organizationId)
    .eq("status", "ACTIVE")
    .order("provider");
  if (error) throw error;
  return data || [];
}