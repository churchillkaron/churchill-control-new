import { supabaseAdmin } from "@/lib/shared/supabase/admin";

const PREFIX = "internal:";

function text(value) {
  return String(value ?? "").trim();
}

function internalConversationId(threadId) {
  return `${PREFIX}${threadId}`;
}

function threadIdFromConversationId(conversationId) {
  const value = text(conversationId);
  return value.startsWith(PREFIX) ? value.slice(PREFIX.length) : null;
}

function fileNameFromUrl(value) {
  try {
    const url = new URL(value);
    return decodeURIComponent(url.pathname.split("/").filter(Boolean).pop() || "Attachment");
  } catch {
    return "Attachment";
  }
}

function internalAttachment(message) {
  const url = text(message?.attachment_url);
  if (!url) return [];
  return [{
    id: `internal-attachment:${message.id}`,
    organization_id: message.organization_id,
    message_id: `internal-message:${message.id}`,
    storage_path: null,
    external_url: url,
    file_name: fileNameFromUrl(url),
    mime_type: null,
    size_bytes: null,
    metadata: { source: "LEGACY_INTERNAL_MESSAGES" },
    created_at: message.created_at,
    updated_at: message.created_at,
  }];
}

function internalMessage(row, staffId, sender = null) {
  const attachments = internalAttachment(row);
  const content = text(row?.content);
  return {
    id: `internal-message:${row.id}`,
    organization_id: row.organization_id,
    conversation_id: internalConversationId(row.thread_id),
    connection_id: null,
    provider: "internal",
    channel_type: "internal",
    direction: row.sender_id === staffId ? "OUTBOUND" : "INBOUND",
    message_type: attachments.length ? (content ? "MIXED" : "FILE") : "TEXT",
    external_message_id: row.id,
    sender_address: row.sender_id,
    recipient_address: null,
    subject: null,
    body: content || null,
    status: row.sender_id === staffId ? "SENT" : "RECEIVED",
    sent_by_party_id: null,
    error_code: null,
    error_message: null,
    sent_at: row.sender_id === staffId ? row.created_at : null,
    received_at: row.sender_id === staffId ? null : row.created_at,
    metadata: {
      source: "LEGACY_INTERNAL_MESSAGES",
      internal_message_id: row.id,
      sender: sender || null,
    },
    created_at: row.created_at,
    updated_at: row.created_at,
    attachments,
  };
}

async function participantThreadIds({ organizationId, staffId }) {
  const { data, error } = await supabaseAdmin
    .from("message_participants")
    .select("thread_id")
    .eq("organization_id", organizationId)
    .eq("staff_id", staffId);
  if (error) throw error;
  return [...new Set((data || []).map((row) => text(row.thread_id)).filter(Boolean))];
}

async function assertParticipant({ organizationId, staffId, threadId }) {
  const { data, error } = await supabaseAdmin
    .from("message_participants")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("staff_id", staffId)
    .eq("thread_id", threadId)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("INTERNAL_CONVERSATION_FORBIDDEN");
}

async function senderMap(rows) {
  const ids = [...new Set(rows.map((row) => text(row.sender_id)).filter(Boolean))];
  if (!ids.length) return new Map();
  const { data, error } = await supabaseAdmin
    .from("staff_accounts")
    .select("id,name,role,profile_picture")
    .in("id", ids);
  if (error) throw error;
  return new Map((data || []).map((row) => [row.id, row]));
}

async function markMessagesRead({ staffId, messages }) {
  const inboundIds = messages
    .filter((row) => row.sender_id !== staffId)
    .map((row) => row.id);
  if (!inboundIds.length) return;

  const { data: existing, error: readError } = await supabaseAdmin
    .from("message_reads")
    .select("message_id")
    .eq("staff_id", staffId)
    .in("message_id", inboundIds);
  if (readError) throw readError;

  const seen = new Set((existing || []).map((row) => row.message_id));
  const missing = inboundIds
    .filter((messageId) => !seen.has(messageId))
    .map((messageId) => ({ message_id: messageId, staff_id: staffId }));
  if (!missing.length) return;

  const { error } = await supabaseAdmin.from("message_reads").insert(missing);
  if (error) throw error;
}

function internalConversation(thread, latestMessage = null, unreadCount = 0) {
  return {
    id: internalConversationId(thread.id),
    organization_id: thread.organization_id,
    connection_id: null,
    provider: "internal",
    channel_type: "internal",
    external_thread_id: thread.id,
    external_participant_id: thread.id,
    external_participant_name: text(thread.title) || "Internal conversation",
    external_participant_address: null,
    customer_party_id: null,
    subject: text(thread.title) || null,
    status: "OPEN",
    unread_count: unreadCount,
    last_message_at: latestMessage?.created_at || thread.created_at,
    last_inbound_at: null,
    last_outbound_at: null,
    metadata: {
      source: "LEGACY_INTERNAL_MESSAGES",
      internal_thread_id: thread.id,
      internal_thread_type: thread.type || null,
    },
    created_at: thread.created_at,
    updated_at: latestMessage?.created_at || thread.created_at,
    family: "internal",
    channelLabel: "Internal",
    sendable: true,
    deliveryServiceId: null,
    deliveryCapability: null,
    latestMessage: latestMessage || null,
  };
}

export function isInternalConversationId(conversationId) {
  return text(conversationId).startsWith(PREFIX);
}

export async function listInternalConversations({ organizationId, staffId }) {
  if (!organizationId || !staffId) return [];
  const threadIds = await participantThreadIds({ organizationId, staffId });
  if (!threadIds.length) return [];

  const [{ data: threads, error: threadError }, { data: messages, error: messageError }] = await Promise.all([
    supabaseAdmin
      .from("message_threads")
      .select("id,organization_id,title,type,created_at")
      .eq("organization_id", organizationId)
      .in("id", threadIds),
    supabaseAdmin
      .from("messages")
      .select("id,organization_id,thread_id,sender_id,content,attachment_url,created_at")
      .eq("organization_id", organizationId)
      .in("thread_id", threadIds)
      .order("created_at", { ascending: false })
      .limit(2000),
  ]);
  if (threadError) throw threadError;
  if (messageError) throw messageError;

  const messageRows = messages || [];
  const latestByThread = new Map();
  for (const row of messageRows) {
    if (!latestByThread.has(row.thread_id)) latestByThread.set(row.thread_id, row);
  }

  const inboundIds = messageRows
    .filter((row) => row.sender_id !== staffId)
    .map((row) => row.id);
  let readSet = new Set();
  if (inboundIds.length) {
    const { data: reads, error: readsError } = await supabaseAdmin
      .from("message_reads")
      .select("message_id")
      .eq("staff_id", staffId)
      .in("message_id", inboundIds);
    if (readsError) throw readsError;
    readSet = new Set((reads || []).map((row) => row.message_id));
  }

  const unreadByThread = new Map();
  for (const row of messageRows) {
    if (row.sender_id === staffId || readSet.has(row.id)) continue;
    unreadByThread.set(row.thread_id, Number(unreadByThread.get(row.thread_id) || 0) + 1);
  }

  return (threads || [])
    .map((thread) => {
      const latestRow = latestByThread.get(thread.id) || null;
      const latestMessage = latestRow ? internalMessage(latestRow, staffId) : null;
      return internalConversation(thread, latestMessage, Number(unreadByThread.get(thread.id) || 0));
    })
    .sort((left, right) => new Date(right.last_message_at || 0) - new Date(left.last_message_at || 0));
}

export async function getInternalConversationTimeline({
  organizationId,
  staffId,
  conversationId,
  markRead = false,
}) {
  const threadId = threadIdFromConversationId(conversationId);
  if (!threadId) throw new Error("INTERNAL_CONVERSATION_NOT_FOUND");
  await assertParticipant({ organizationId, staffId, threadId });

  const [{ data: thread, error: threadError }, { data: messages, error: messageError }] = await Promise.all([
    supabaseAdmin
      .from("message_threads")
      .select("id,organization_id,title,type,created_at")
      .eq("organization_id", organizationId)
      .eq("id", threadId)
      .maybeSingle(),
    supabaseAdmin
      .from("messages")
      .select("id,organization_id,thread_id,sender_id,content,attachment_url,created_at")
      .eq("organization_id", organizationId)
      .eq("thread_id", threadId)
      .order("created_at", { ascending: true })
      .limit(1000),
  ]);
  if (threadError) throw threadError;
  if (messageError) throw messageError;
  if (!thread) throw new Error("INTERNAL_CONVERSATION_NOT_FOUND");

  const rows = messages || [];
  if (markRead) await markMessagesRead({ staffId, messages: rows });
  const senders = await senderMap(rows);
  const mapped = rows.map((row) => internalMessage(row, staffId, senders.get(row.sender_id) || null));
  const latest = mapped[mapped.length - 1] || null;

  return {
    conversation: internalConversation(thread, latest, 0),
    messages: mapped,
  };
}

export async function sendInternalCommunication({
  organizationId,
  staffId,
  conversationId,
  body,
  attachments = [],
}) {
  const threadId = threadIdFromConversationId(conversationId);
  if (!threadId) throw new Error("INTERNAL_CONVERSATION_NOT_FOUND");
  await assertParticipant({ organizationId, staffId, threadId });

  const content = text(body);
  const files = (Array.isArray(attachments) ? attachments : [])
    .map((attachment) => text(attachment?.external_url || attachment?.url))
    .filter(Boolean)
    .slice(0, 10);
  if (!content && !files.length) throw new Error("MESSAGE_BODY_OR_ATTACHMENT_REQUIRED");

  const rows = [];
  if (content || !files.length) {
    rows.push({
      organization_id: organizationId,
      thread_id: threadId,
      sender_id: staffId,
      content,
      attachment_url: files[0] || null,
    });
  } else {
    rows.push({
      organization_id: organizationId,
      thread_id: threadId,
      sender_id: staffId,
      content: "",
      attachment_url: files[0],
    });
  }
  for (const url of files.slice(1)) {
    rows.push({
      organization_id: organizationId,
      thread_id: threadId,
      sender_id: staffId,
      content: "",
      attachment_url: url,
    });
  }

  const { data, error } = await supabaseAdmin
    .from("messages")
    .insert(rows)
    .select("id,organization_id,thread_id,sender_id,content,attachment_url,created_at");
  if (error) throw error;

  const created = (data || []).map((row) => internalMessage(row, staffId));
  return {
    message: created[0] || null,
    messages: created,
  };
}
