import { supabaseAdmin } from "@/lib/shared/supabase/admin";

const CONVERSATION_COLUMNS = "id,organization_id,connection_id,provider,channel_type,external_thread_id,external_participant_id,external_participant_name,external_participant_address,customer_party_id,subject,status,unread_count,last_message_at,last_inbound_at,last_outbound_at,metadata,created_at,updated_at";
const MESSAGE_COLUMNS = "id,organization_id,conversation_id,connection_id,provider,channel_type,direction,message_type,external_message_id,sender_address,recipient_address,subject,body,status,sent_by_party_id,error_code,error_message,sent_at,received_at,metadata,created_at,updated_at";

export async function listConversations({ organizationId, provider = null, search = null, limit = 100 }) {
  let query = supabaseAdmin
    .from("communication_conversations")
    .select(CONVERSATION_COLUMNS)
    .eq("organization_id", organizationId)
    .order("last_message_at", { ascending: false, nullsFirst: false })
    .order("updated_at", { ascending: false })
    .limit(Math.min(Math.max(Number(limit) || 100, 1), 250));

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

export async function listMessages({ organizationId, conversationId, limit = 500 }) {
  const { data, error } = await supabaseAdmin
    .from("communication_messages")
    .select(MESSAGE_COLUMNS)
    .eq("organization_id", organizationId)
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true })
    .limit(Math.min(Math.max(Number(limit) || 500, 1), 1000));
  if (error) throw error;
  return data || [];
}

export async function listLatestMessages({ organizationId, conversationIds = [] }) {
  if (!conversationIds.length) return [];
  const { data, error } = await supabaseAdmin
    .from("communication_messages")
    .select(MESSAGE_COLUMNS)
    .eq("organization_id", organizationId)
    .in("conversation_id", conversationIds)
    .order("created_at", { ascending: false })
    .limit(Math.min(conversationIds.length * 8, 800));
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
