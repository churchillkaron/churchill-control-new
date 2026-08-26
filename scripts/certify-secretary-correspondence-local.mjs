import assert from "node:assert/strict";

function required(name) {
  const value = String(process.env[name] || "").trim();
  if (!value) throw new Error(`SECRETARY_CORRESPONDENCE_LOCAL_ENV_REQUIRED:${name}`);
  return value;
}

function assertLocalSupabase(urlValue) {
  let url;
  try {
    url = new URL(urlValue);
  } catch {
    throw new Error("SECRETARY_CORRESPONDENCE_LOCAL_SUPABASE_URL_INVALID");
  }
  if (!["127.0.0.1", "localhost", "::1", "[::1]"].includes(url.hostname)) {
    throw new Error("SECRETARY_CORRESPONDENCE_LOCAL_REFUSED_NON_LOCAL_SUPABASE");
  }
}

async function one(result, label) {
  const resolved = await result;
  if (resolved.error) {
    throw new Error(`${label}:${resolved.error.code || "UNKNOWN"}:${resolved.error.message || "ERROR"}`);
  }
  return resolved.data || null;
}

const supabaseUrl = required("NEXT_PUBLIC_SUPABASE_URL");
required("SUPABASE_SERVICE_ROLE_KEY");
assertLocalSupabase(supabaseUrl);

const { supabaseAdmin } = await import("../lib/shared/supabase/admin.js");
const { createSecretaryCorrespondenceCapability } = await import(
  "../lib/platform/capabilities/createSecretaryCorrespondenceCapability.js"
);

let organizationId = null;

try {
  const organization = await one(
    supabaseAdmin
      .from("organizations")
      .insert({ name: "Secretary Correspondence Local Certification" })
      .select("id")
      .single(),
    "SECRETARY_CORRESPONDENCE_LOCAL_ORGANIZATION_INSERT_FAILED",
  );
  organizationId = organization.id;

  const actor = await one(
    supabaseAdmin
      .from("parties")
      .insert({
        organization_id: organizationId,
        display_name: "Local Secretary Correspondence Operator",
        email: "secretary-local@example.invalid",
        party_type: "PERSON",
        status: "ACTIVE",
        metadata: { local_certification: true },
      })
      .select("id")
      .single(),
    "SECRETARY_CORRESPONDENCE_LOCAL_ACTOR_INSERT_FAILED",
  );

  const connection = await one(
    supabaseAdmin
      .from("organization_channel_connections")
      .insert({
        organization_id: organizationId,
        provider: "email_google",
        channel_type: "email",
        name: "Local certification email",
        external_account_id: "local-certification",
        status: "ACTIVE",
        metadata: { local_certification: true, credentials_present: false },
      })
      .select("id")
      .single(),
    "SECRETARY_CORRESPONDENCE_LOCAL_CONNECTION_INSERT_FAILED",
  );

  const now = new Date().toISOString();
  const conversation = await one(
    supabaseAdmin
      .from("communication_conversations")
      .insert({
        organization_id: organizationId,
        connection_id: connection.id,
        provider: "email_google",
        channel_type: "email",
        external_thread_id: "local-certification-thread",
        external_participant_id: "supplier@example.invalid",
        external_participant_name: "Local Supplier",
        external_participant_address: "supplier@example.invalid",
        subject: "Local Secretary inbox certification",
        status: "OPEN",
        unread_count: 1,
        last_message_at: now,
        last_inbound_at: now,
        metadata: { local_certification: true },
      })
      .select("*")
      .single(),
    "SECRETARY_CORRESPONDENCE_LOCAL_CONVERSATION_INSERT_FAILED",
  );

  const inbound = await one(
    supabaseAdmin
      .from("communication_messages")
      .insert({
        organization_id: organizationId,
        conversation_id: conversation.id,
        connection_id: connection.id,
        provider: "email_google",
        channel_type: "email",
        direction: "INBOUND",
        message_type: "TEXT",
        external_message_id: "local-certification-inbound",
        sender_address: "supplier@example.invalid",
        recipient_address: "secretary-local@example.invalid",
        subject: conversation.subject,
        body: "Can you confirm that the meeting is still planned for tomorrow?",
        status: "RECEIVED",
        received_at: now,
        metadata: { local_certification: true },
      })
      .select("*")
      .single(),
    "SECRETARY_CORRESPONDENCE_LOCAL_INBOUND_INSERT_FAILED",
  );

  const baseContext = {
    organizationId,
    actor: { partyId: actor.id },
    metadata: { partyId: actor.id, localCertification: true },
    permissions: [],
  };

  const inboxCapability = createSecretaryCorrespondenceCapability("inbox");
  assert.equal(inboxCapability.authorize({ context: baseContext }), true);
  const inbox = await inboxCapability.execute({
    context: baseContext,
    payload: { unread_only: true, limit: 10 },
  });
  assert.equal(inbox.status, "completed");
  assert.equal(inbox.conversation_count, 1);
  assert.equal(inbox.conversations[0].id, conversation.id);
  assert.equal(inbox.conversations[0].latestMessage.id, inbound.id);
  assert.equal(Number(inbox.conversations[0].unread_count), 1);

  const readCapability = createSecretaryCorrespondenceCapability("read");
  assert.equal(readCapability.authorize({ context: baseContext }), true);
  const timeline = await readCapability.execute({
    context: baseContext,
    payload: { conversation_id: conversation.id },
  });
  assert.equal(timeline.status, "completed");
  assert.equal(timeline.conversation.id, conversation.id);
  assert.equal(timeline.messages.length, 1);
  assert.equal(timeline.messages[0].id, inbound.id);
  assert.equal(timeline.messages[0].direction, "INBOUND");

  const unreadAfterRead = await one(
    supabaseAdmin
      .from("communication_conversations")
      .select("unread_count")
      .eq("organization_id", organizationId)
      .eq("id", conversation.id)
      .single(),
    "SECRETARY_CORRESPONDENCE_LOCAL_UNREAD_READ_FAILED",
  );
  assert.equal(Number(unreadAfterRead.unread_count), 1);

  const writeContext = {
    ...baseContext,
    permissions: ["commercial.communications.write"],
  };
  const draftCapability = createSecretaryCorrespondenceCapability("draft");
  assert.equal(draftCapability.authorize({ context: writeContext }), true);
  const draft = await draftCapability.execute({
    context: writeContext,
    payload: {
      conversation_id: conversation.id,
      body: "Yes. I am confirming internally and will update you if anything changes.",
      subject: conversation.subject,
      source_context: { kind: "LOCAL_CERTIFICATION", inbound_message_id: inbound.id },
    },
  });
  assert.equal(draft.status, "DRAFT");
  assert.equal(draft.conversation_id, conversation.id);
  assert.equal(draft.sent, false);
  assert.ok(draft.message_id);

  const savedDraft = await one(
    supabaseAdmin
      .from("communication_messages")
      .select("id,status,direction,body,metadata,sent_at,external_message_id")
      .eq("organization_id", organizationId)
      .eq("conversation_id", conversation.id)
      .eq("id", draft.message_id)
      .single(),
    "SECRETARY_CORRESPONDENCE_LOCAL_DRAFT_READ_FAILED",
  );
  assert.equal(savedDraft.status, "DRAFT");
  assert.equal(savedDraft.direction, "OUTBOUND");
  assert.equal(savedDraft.sent_at, null);
  assert.equal(savedDraft.external_message_id, null);
  assert.equal(savedDraft.metadata?.source, "AVANTIQO_SECRETARY");
  assert.equal(savedDraft.metadata?.delivery_authorized, false);

  const sendCapability = createSecretaryCorrespondenceCapability("sendDraft");
  assert.equal(sendCapability.manifest.operatorRequiresConfirmation, true);
  assert.equal(sendCapability.manifest.operatorAutoExecute, false);
  assert.equal(sendCapability.manifest.risk, "high");
  assert.equal(sendCapability.manifest.reversible, false);
  assert.deepEqual(sendCapability.manifest.inputSchema.required, ["conversation_id", "message_id"]);

  let permissionBlocked = false;
  try {
    sendCapability.authorize({ context: writeContext });
  } catch (error) {
    permissionBlocked = error?.message === "CAPABILITY_PERMISSION_REQUIRED" &&
      error?.requiredPermission === "commercial.communications.send";
  }
  assert.equal(permissionBlocked, true);

  const sendAuthorizedContext = {
    ...writeContext,
    permissions: ["commercial.communications.write", "commercial.communications.send"],
  };
  assert.equal(sendCapability.authorize({ context: sendAuthorizedContext }), true);

  const stillDraft = await one(
    supabaseAdmin
      .from("communication_messages")
      .select("status,sent_at,external_message_id")
      .eq("organization_id", organizationId)
      .eq("id", draft.message_id)
      .single(),
    "SECRETARY_CORRESPONDENCE_LOCAL_FINAL_DRAFT_READ_FAILED",
  );
  assert.equal(stillDraft.status, "DRAFT");
  assert.equal(stillDraft.sent_at, null);
  assert.equal(stillDraft.external_message_id, null);

  console.log("SECRETARY_CORRESPONDENCE_LOCAL_CERTIFICATION=PASS");
  console.log("SECRETARY_CORRESPONDENCE_INBOX_BEHAVIOR=true");
  console.log("SECRETARY_CORRESPONDENCE_THREAD_READ_BEHAVIOR=true");
  console.log("SECRETARY_CORRESPONDENCE_READ_DOES_NOT_IMPLICITLY_MARK_READ=true");
  console.log("SECRETARY_CORRESPONDENCE_DRAFT_PERSISTED=true");
  console.log("SECRETARY_CORRESPONDENCE_DRAFT_SENT=false");
  console.log("SECRETARY_CORRESPONDENCE_EXACT_DRAFT_SEND_BOUNDARY=true");
  console.log("SECRETARY_CORRESPONDENCE_SEND_PERMISSION_REQUIRED=true");
  console.log("SECRETARY_CORRESPONDENCE_SEND_CONFIRMATION_REQUIRED=true");
  console.log("SECRETARY_PROVIDER_CALLS_PERFORMED=false");
  console.log("SECRETARY_EXTERNAL_AUTHORITY_USED=false");
  console.log("SECRETARY_PRODUCTION_DEPLOY_PERFORMED=false");
} finally {
  if (organizationId) {
    await supabaseAdmin
      .from("organizations")
      .delete()
      .eq("id", organizationId);
  }
}
