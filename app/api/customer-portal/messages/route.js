export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { CUSTOMER_PORTAL_COOKIE, resolveCustomerPortalSession } from "@/lib/customer-portal/CustomerPortalRuntime";

function text(value, limit = 12000) {
  return String(value ?? "").trim().slice(0, limit);
}

async function portalConversation({ organizationId, partyId }) {
  const existing = await supabaseAdmin.from("communication_conversations")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("provider", "customer_portal")
    .eq("customer_party_id", partyId)
    .eq("status", "OPEN")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (existing.error) throw existing.error;
  if (existing.data) return existing.data;

  const party = await supabaseAdmin.from("parties")
    .select("display_name,email,phone")
    .eq("organization_id", organizationId)
    .eq("id", partyId)
    .maybeSingle();
  if (party.error) throw party.error;

  const created = await supabaseAdmin.from("communication_conversations").insert({
    organization_id: organizationId,
    provider: "customer_portal",
    channel_type: "portal",
    external_thread_id: `customer-portal:${partyId}`,
    external_participant_id: partyId,
    external_participant_name: party.data?.display_name || "Customer",
    external_participant_address: party.data?.email || party.data?.phone || null,
    customer_party_id: partyId,
    subject: "Customer portal",
    status: "OPEN",
    unread_count: 0,
    metadata: { source: "external_customer_portal" },
  }).select("*").single();
  if (created.error) throw created.error;
  return created.data;
}

export async function POST(request) {
  try {
    const session = await resolveCustomerPortalSession(request.cookies.get(CUSTOMER_PORTAL_COOKIE)?.value || null);
    if (!session) return NextResponse.json({ success: false, error: "Customer portal session required" }, { status: 401 });
    const body = await request.json();
    const messageBody = text(body.message || body.body, 12000);
    if (!messageBody) return NextResponse.json({ success: false, error: "Message required" }, { status: 400 });

    const conversation = await portalConversation({ organizationId: session.organization_id, partyId: session.party_id });
    const now = new Date().toISOString();
    const inserted = await supabaseAdmin.from("communication_messages").insert({
      organization_id: session.organization_id,
      conversation_id: conversation.id,
      connection_id: null,
      provider: "customer_portal",
      channel_type: "portal",
      direction: "INBOUND",
      message_type: "TEXT",
      sender_address: "customer_portal",
      body: messageBody,
      status: "RECEIVED",
      received_at: now,
      metadata: { customer_portal_session_id: session.id },
    }).select("id,body,status,created_at").single();
    if (inserted.error) throw inserted.error;

    const updated = await supabaseAdmin.from("communication_conversations").update({
      unread_count: Number(conversation.unread_count || 0) + 1,
      last_message_at: now,
      last_inbound_at: now,
      updated_at: now,
    }).eq("id", conversation.id).eq("organization_id", session.organization_id);
    if (updated.error) throw updated.error;

    return NextResponse.json({ success: true, message: inserted.data });
  } catch (error) {
    return NextResponse.json({ success: false, error: error?.message || "Unable to send message" }, { status: 500 });
  }
}
