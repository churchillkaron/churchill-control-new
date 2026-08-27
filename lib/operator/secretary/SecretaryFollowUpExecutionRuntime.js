import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { AvantiqoStructuredIntelligenceSupervisorRuntime } from "@/lib/intelligence/runtime/AvantiqoStructuredIntelligenceSupervisorRuntime";
import { deliverCommunicationMessage } from "@/lib/commercial/communications/CommunicationDeliveryRuntime";
import { evaluateSecretaryContactQuietHours } from "@/lib/operator/secretary/SecretaryContactQuietHoursRuntime";
import {
  resolveSecretaryFollowUpCoverage,
  secretaryAdministrativeCoverageMetadata,
} from "@/lib/operator/secretary/SecretaryAdministrativeCoverageRoutingRuntime";

const MEETING_CLOSEOUT_EXACT_MESSAGE_SOURCE = "MEETING_CLOSEOUT_V1";

function text(value, limit = 4000) {
  return String(value ?? "").trim().slice(0, limit);
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

async function one(result) {
  const resolved = await result;
  if (resolved.error) throw resolved.error;
  return resolved.data || null;
}

async function many(result) {
  const resolved = await result;
  if (resolved.error) throw resolved.error;
  return Array.isArray(resolved.data) ? resolved.data : [];
}

export function secretaryExactFollowUpMessageBody(followUp = {}, execution = {}) {
  const metadata = object(followUp.metadata);
  const action = text(execution.action_type || followUp.action_type, 40).toUpperCase();
  if (!["MESSAGE", "EMAIL"].includes(action)) return null;
  if (metadata.secretary_meeting_closeout !== true) return null;
  if (text(metadata.secretary_exact_message_body_source, 120) !== MEETING_CLOSEOUT_EXACT_MESSAGE_SOURCE) return null;
  if (text(metadata.execution_owner, 40).toUpperCase() !== "SECRETARY" || metadata.execution_ready !== true) return null;
  const body = text(metadata.secretary_exact_message_body, 32000);
  return body || null;
}

export async function materializeSecretaryFollowUpExecutions({ now = new Date() } = {}) {
  const result = await supabaseAdmin.rpc("secretary_materialize_due_follow_up_executions", {
    p_now: now instanceof Date ? now.toISOString() : new Date(now).toISOString(),
  });
  if (result.error) throw result.error;
  return result.data || null;
}

export async function claimSecretaryFollowUpExecution({ workerId, leaseSeconds = 180 } = {}) {
  const worker = text(workerId, 200);
  if (!worker) throw new Error("SECRETARY_FOLLOW_UP_EXECUTION_WORKER_REQUIRED");
  const result = await supabaseAdmin.rpc("claim_secretary_follow_up_execution", {
    p_worker_id: worker,
    p_lease_seconds: Math.max(30, Math.min(Number(leaseSeconds) || 180, 900)),
  });
  if (result.error) throw result.error;
  return Array.isArray(result.data) ? result.data[0] || null : null;
}

async function followUp(execution) {
  return one(
    supabaseAdmin.from("secretary_follow_ups").select("*")
      .eq("organization_id", execution.organization_id)
      .eq("id", execution.follow_up_id)
      .maybeSingle(),
  );
}

async function sourceJob(execution, current) {
  const jobId = text(object(current?.metadata).secretary_job_id, 120);
  if (!jobId) return null;
  return one(
    supabaseAdmin.from("secretary_jobs").select("*")
      .eq("organization_id", execution.organization_id)
      .eq("id", jobId)
      .maybeSingle(),
  );
}

async function sourceJobStep(execution, current) {
  const stepId = text(object(current?.metadata).secretary_job_step_id, 120);
  if (!stepId) return null;
  return one(
    supabaseAdmin.from("secretary_job_steps").select("*")
      .eq("organization_id", execution.organization_id)
      .eq("id", stepId)
      .maybeSingle(),
  );
}

async function applyLiveCoverageRouting(execution, current) {
  const [job, step] = await Promise.all([
    sourceJob(execution, current),
    sourceJobStep(execution, current),
  ]);
  const routing = await resolveSecretaryFollowUpCoverage({
    followUp: current,
    execution,
    job,
    step,
    at: new Date().toISOString(),
  });
  const routingMetadata = secretaryAdministrativeCoverageMetadata(routing);
  const metadata = {
    ...object(current.metadata),
    ...routingMetadata,
    secretary_coverage_last_evaluated_at: new Date().toISOString(),
    external_authority_used: false,
  };
  const update = await supabaseAdmin.from("secretary_follow_ups")
    .update({ metadata, updated_at: new Date().toISOString() })
    .eq("organization_id", execution.organization_id)
    .eq("id", current.id);
  if (update.error) throw update.error;
  return { routing, metadata, job, step };
}

async function contactPreferences(execution) {
  const profile = execution.contact_party_id
    ? await one(
        supabaseAdmin.from("secretary_contact_profiles")
          .select("preferred_language,preferred_channel,timezone,allow_calls,allow_messages,do_not_disturb")
          .eq("organization_id", execution.organization_id)
          .eq("party_id", execution.contact_party_id)
          .maybeSingle(),
      )
    : null;
  return {
    language: text(profile?.preferred_language, 80) || null,
    preferred_channel: text(profile?.preferred_channel, 120).toLowerCase() || null,
    timezone: text(profile?.timezone, 120) || "UTC",
    allow_calls: profile?.allow_calls !== false,
    allow_messages: profile?.allow_messages !== false,
    do_not_disturb: object(profile?.do_not_disturb),
  };
}

function quietHoursOutcome(preferences, action) {
  const quiet = evaluateSecretaryContactQuietHours({
    doNotDisturb: preferences.do_not_disturb,
    timezone: preferences.timezone,
    channel: action,
    now: new Date(),
  });
  if (!quiet.blocked) return null;
  if (quiet.defer_until) {
    return { status: "deferred", reason: quiet.reason, defer_until: quiet.defer_until, quiet_hours: quiet };
  }
  return { status: "skipped", reason: quiet.reason || "CONTACT_DO_NOT_DISTURB", quiet_hours: quiet };
}

async function conversationForExecution(execution, preferredChannel) {
  const rows = await many(
    supabaseAdmin.from("communication_conversations")
      .select("id,organization_id,provider,channel_type,subject,status,last_message_at,updated_at,customer_party_id")
      .eq("organization_id", execution.organization_id)
      .eq("customer_party_id", execution.contact_party_id)
      .eq("status", "OPEN")
      .order("last_message_at", { ascending: false, nullsFirst: false })
      .order("updated_at", { ascending: false })
      .limit(20),
  );
  if (!rows.length) return null;
  const action = text(execution.action_type, 40).toUpperCase();
  const eligible = rows.filter((row) => {
    const provider = text(row.provider, 120).toLowerCase();
    const channel = text(row.channel_type, 120).toLowerCase();
    const emailLike = provider.includes("email") || channel.includes("email");
    return action === "EMAIL" ? emailLike : action === "MESSAGE" ? !emailLike : false;
  });
  if (!eligible.length) return null;
  if (!preferredChannel) return eligible[0];
  return eligible.find((row) => {
    const provider = text(row.provider, 120).toLowerCase();
    const channel = text(row.channel_type, 120).toLowerCase();
    return provider === preferredChannel || channel === preferredChannel;
  }) || eligible[0];
}

async function followUpMessageText(execution, language) {
  const result = await AvantiqoStructuredIntelligenceSupervisorRuntime.run({
    organization_id: execution.organization_id,
    party_id: null,
    system: [
      "You are Avantiqo Secretary fulfilling one explicit Secretary-owned follow-up commitment to an outside contact.",
      "Use only the supplied execution instruction and action type. Do not add prices, promises, documents, links, attachments, facts, decisions, approvals, dates, or business information that are not explicitly present.",
      "If the instruction cannot be fulfilled as a truthful short text message without inventing missing content, return can_send=false and no message_text.",
      "When it can be fulfilled, write a concise natural follow-up in the requested language.",
      "Return exactly one JSON object: {\"can_send\":true|false,\"message_text\":\"... or null\"}.",
    ].join("\n"),
    messages: [{ role: "user", content: JSON.stringify({ action_type: text(execution.action_type, 40).toUpperCase(), execution_instruction: text(execution.instruction, 2000), language: language || "en" }) }],
    tools: [],
    authorization: { allow_mutating_tools: false },
    metadata: { module: "SECRETARY", operation: "FOLLOW_UP_EXECUTION_MESSAGE", query_plan_only: true, external_authority_used: false, raw_reasoning_persisted: false },
    mode: "fast",
    max_output_tokens: 240,
  });
  const parsed = object(result?.parsed);
  const body = text(parsed.message_text, 4000);
  return { can_send: parsed.can_send === true && Boolean(body), body };
}

async function updateExecution(execution, patch) {
  const result = await supabaseAdmin.from("secretary_follow_up_executions")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", execution.id).select("*").single();
  if (result.error) throw result.error;
  return result.data;
}

async function completeFollowUp(execution, resultText) {
  const now = new Date().toISOString();
  const result = await supabaseAdmin.from("secretary_follow_ups")
    .update({ status: "COMPLETED", result: text(resultText, 4000) || "Completed by Avantiqo Secretary", completed_at: now, updated_at: now })
    .eq("organization_id", execution.organization_id).eq("id", execution.follow_up_id).eq("status", "PENDING")
    .select("id,status,result,completed_at").maybeSingle();
  if (result.error) throw result.error;
  return result.data || null;
}

async function reserveCall(execution, preferences) {
  if (!execution.contact_party_id) throw new Error("SECRETARY_FOLLOW_UP_CONTACT_REQUIRED_FOR_CALL");
  const party = await one(supabaseAdmin.from("parties").select("id,phone,status").eq("organization_id", execution.organization_id).eq("id", execution.contact_party_id).eq("status", "active").maybeSingle());
  if (!party?.phone) throw new Error("SECRETARY_FOLLOW_UP_CONTACT_PHONE_REQUIRED");
  const line = await one(supabaseAdmin.from("secretary_phone_lines").select("id,default_language").eq("organization_id", execution.organization_id).eq("active", true).eq("outbound_enabled", true).order("created_at", { ascending: true }).limit(1).maybeSingle());
  if (!line) throw new Error("SECRETARY_FOLLOW_UP_PHONE_LINE_UNAVAILABLE");
  if (execution.outbound_call_request_id) {
    return one(supabaseAdmin.from("secretary_outbound_call_requests").select("*").eq("organization_id", execution.organization_id).eq("id", execution.outbound_call_request_id).maybeSingle());
  }
  const insert = await supabaseAdmin.from("secretary_outbound_call_requests").insert({
    organization_id: execution.organization_id,
    phone_line_id: line.id,
    contact_party_id: execution.contact_party_id,
    requested_by_party_id: null,
    remote_address: text(party.phone, 120),
    objective: text(execution.instruction, 4000),
    language: preferences.language || text(line.default_language, 80) || null,
    status: "PENDING",
    scheduled_at: new Date().toISOString(),
    max_attempts: 3,
    metadata: { source: "AVANTIQO_SECRETARY_FOLLOW_UP", secretary_follow_up_execution_id: execution.id, secretary_follow_up_id: execution.follow_up_id, secretary_owned: true, external_authority_used: false },
  }).select("*").single();
  if (insert.error) {
    if (insert.error.code === "23505") {
      const existing = await one(supabaseAdmin.from("secretary_outbound_call_requests").select("*").eq("organization_id", execution.organization_id).contains("metadata", { secretary_follow_up_execution_id: execution.id }).maybeSingle());
      if (existing) return existing;
    }
    throw insert.error;
  }
  return insert.data;
}

async function processCall(execution, preferences) {
  if (!preferences.allow_calls) return { status: "skipped", reason: "CONTACT_CALLS_DISABLED" };
  const quiet = quietHoursOutcome(preferences, "CALL");
  if (quiet) return quiet;
  const request = await reserveCall(execution, preferences);
  const status = text(request?.status, 40).toUpperCase();
  if (status === "COMPLETED") {
    await completeFollowUp(execution, "Secretary follow-up call completed");
    return { status: "completed", outbound_call_request: request };
  }
  if (["FAILED", "CANCELLED"].includes(status)) return { status: "skipped", reason: `OUTBOUND_CALL_${status}`, outbound_call_request: request };
  return { status: "queued", outbound_call_request: request };
}

async function processMessage(execution, preferences, current) {
  if (!preferences.allow_messages) return { status: "skipped", reason: "CONTACT_MESSAGES_DISABLED" };
  if (!execution.contact_party_id) return { status: "skipped", reason: "CONTACT_REQUIRED" };
  const quiet = quietHoursOutcome(preferences, text(execution.action_type, 40).toUpperCase());
  if (quiet) return quiet;
  const conversation = await conversationForExecution(execution, preferences.preferred_channel);
  if (!conversation) return { status: "skipped", reason: "SAFE_COMMUNICATION_CHANNEL_UNAVAILABLE" };
  let message = execution.message_id ? await one(supabaseAdmin.from("communication_messages").select("*").eq("organization_id", execution.organization_id).eq("id", execution.message_id).maybeSingle()) : null;
  if (!message) {
    const exactBody = secretaryExactFollowUpMessageBody(current, execution);
    const generated = exactBody ? { can_send: true, body: exactBody } : await followUpMessageText(execution, preferences.language || "en");
    if (!generated.can_send) return { status: "skipped", reason: "FOLLOW_UP_CONTENT_NOT_SELF_CONTAINED" };
    const reserved = await supabaseAdmin.rpc("secretary_reserve_follow_up_execution_message", { p_execution_id: execution.id, p_conversation_id: conversation.id, p_body: generated.body, p_subject: conversation.subject || null });
    if (reserved.error) throw reserved.error;
    message = reserved.data;
  }
  const prior = text(message?.status, 40).toUpperCase();
  if (prior === "SENT") {
    await completeFollowUp(execution, "Secretary follow-up message sent");
    return { status: "completed", message };
  }
  if (["SENDING", "FAILED"].includes(prior)) return { status: "skipped", reason: `AMBIGUOUS_DELIVERY_${prior}`, message };
  const delivered = await deliverCommunicationMessage({ organizationId: execution.organization_id, conversationId: conversation.id, message, partyId: null });
  if (text(delivered?.status, 40).toUpperCase() === "SENT") {
    await completeFollowUp(execution, "Secretary follow-up message sent");
    return { status: "completed", message: delivered };
  }
  return { status: "failed", reason: `MESSAGE_NOT_SENT:${text(delivered?.status, 40).toUpperCase() || "UNKNOWN"}`, message: delivered || message };
}

export async function processSecretaryFollowUpExecution(execution) {
  const current = await followUp(execution);
  if (!current || current.status !== "PENDING") {
    return updateExecution(execution, { status: "SKIPPED", lease_token: null, lease_expires_at: null, completed_at: new Date().toISOString(), last_error: "FOLLOW_UP_NOT_PENDING" });
  }
  const metadata = object(current.metadata);
  if (text(metadata.execution_owner, 40).toUpperCase() !== "SECRETARY" || metadata.execution_ready !== true) {
    return updateExecution(execution, { status: "SKIPPED", lease_token: null, lease_expires_at: null, completed_at: new Date().toISOString(), last_error: "FOLLOW_UP_NOT_SECRETARY_EXECUTION_READY" });
  }

  const coverage = await applyLiveCoverageRouting(execution, current);
  if (coverage.routing.coverage_routing_review_required === true) {
    const reason = `SECRETARY_COVERAGE_ROUTING_REVIEW_REQUIRED:${coverage.routing.routing_reason}`;
    const row = await updateExecution(execution, {
      status: "SKIPPED",
      lease_token: null,
      lease_expires_at: null,
      completed_at: new Date().toISOString(),
      last_error: reason,
      metadata: {
        ...object(execution.metadata),
        ...secretaryAdministrativeCoverageMetadata(coverage.routing),
        external_authority_used: false,
      },
    });
    return { status: "skipped", execution: row, outcome: { status: "skipped", reason }, coverage_routing: coverage.routing };
  }

  const currentWithCoverage = { ...current, metadata: coverage.metadata };
  const executionWithCoverage = {
    ...execution,
    metadata: {
      ...object(execution.metadata),
      ...secretaryAdministrativeCoverageMetadata(coverage.routing),
      external_authority_used: false,
    },
  };
  const preferences = await contactPreferences(executionWithCoverage);
  const action = text(executionWithCoverage.action_type, 40).toUpperCase();
  const outcome = action === "CALL"
    ? await processCall(executionWithCoverage, preferences)
    : await processMessage(executionWithCoverage, preferences, currentWithCoverage);
  if (outcome.status === "deferred") {
    const row = await updateExecution(executionWithCoverage, {
      status: "FAILED",
      attempt_count: Math.max(0, Number(executionWithCoverage.attempt_count || 1) - 1),
      available_at: outcome.defer_until,
      completed_at: null,
      lease_token: null,
      lease_expires_at: null,
      last_error: `${outcome.reason}:DEFERRED_UNTIL:${outcome.defer_until}`,
      metadata: { ...object(executionWithCoverage.metadata), quiet_hours_deferred_at: new Date().toISOString(), quiet_hours_deferred_until: outcome.defer_until, quiet_hours_timezone: outcome.quiet_hours?.timezone || preferences.timezone },
    });
    return { status: "deferred", execution: row, outcome, coverage_routing: coverage.routing };
  }
  const terminal = ["completed", "skipped"].includes(outcome.status);
  const row = await updateExecution(executionWithCoverage, {
    status: outcome.status === "completed" ? "COMPLETED" : outcome.status === "queued" ? "QUEUED" : outcome.status === "skipped" ? "SKIPPED" : "FAILED",
    outbound_call_request_id: outcome.outbound_call_request?.id || executionWithCoverage.outbound_call_request_id || null,
    message_id: outcome.message?.id || executionWithCoverage.message_id || null,
    conversation_id: outcome.message?.conversation_id || executionWithCoverage.conversation_id || null,
    completed_at: terminal ? new Date().toISOString() : null,
    lease_token: null,
    lease_expires_at: null,
    last_error: outcome.reason || null,
    metadata: object(executionWithCoverage.metadata),
  });
  return { status: outcome.status, execution: row, outcome, coverage_routing: coverage.routing };
}

export async function reconcileQueuedSecretaryFollowUpExecutions({ limit = 100 } = {}) {
  const rows = await many(supabaseAdmin.from("secretary_follow_up_executions").select("*").eq("status", "QUEUED").order("updated_at", { ascending: true }).limit(Math.max(1, Math.min(Number(limit) || 100, 300))));
  const results = [];
  for (const execution of rows) {
    if (!execution.outbound_call_request_id) continue;
    const request = await one(supabaseAdmin.from("secretary_outbound_call_requests").select("*").eq("organization_id", execution.organization_id).eq("id", execution.outbound_call_request_id).maybeSingle());
    const status = text(request?.status, 40).toUpperCase();
    if (status === "COMPLETED") {
      await completeFollowUp(execution, "Secretary follow-up call completed");
      results.push(await updateExecution(execution, { status: "COMPLETED", completed_at: new Date().toISOString(), last_error: null }));
    } else if (["FAILED", "CANCELLED"].includes(status)) {
      results.push(await updateExecution(execution, { status: "SKIPPED", completed_at: new Date().toISOString(), last_error: `OUTBOUND_CALL_${status}` }));
    }
  }
  return { status: "completed", reconciled: results.length, executions: results };
}

export default { materializeSecretaryFollowUpExecutions, claimSecretaryFollowUpExecution, processSecretaryFollowUpExecution, reconcileQueuedSecretaryFollowUpExecutions };
