import { createHash } from "node:crypto";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { AvantiqoStructuredIntelligenceSupervisorRuntime } from "@/lib/intelligence/runtime/AvantiqoStructuredIntelligenceSupervisorRuntime";

const ACTION_TYPES = new Set(["CALL", "MESSAGE", "EMAIL", "MEETING", "REVIEW", "OTHER"]);
const EXECUTION_OWNERS = new Set(["SECRETARY", "CONTACT", "STAFF", "UNKNOWN"]);
const SECRETARY_EXECUTABLE_ACTIONS = new Set(["CALL", "MESSAGE", "EMAIL"]);

function text(value, limit = 8000) {
  return String(value ?? "").trim().slice(0, limit);
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function list(value) {
  return Array.isArray(value) ? value : [];
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

export async function claimSecretaryCommitmentExtraction({ workerId, leaseSeconds = 180 } = {}) {
  const worker = text(workerId, 200);
  if (!worker) throw new Error("SECRETARY_COMMITMENT_WORKER_REQUIRED");
  const result = await supabaseAdmin.rpc("claim_secretary_commitment_extraction", {
    p_worker_id: worker,
    p_lease_seconds: Math.max(30, Math.min(Number(leaseSeconds) || 180, 900)),
  });
  if (result.error) throw result.error;
  return Array.isArray(result.data) ? result.data[0] || null : null;
}

async function sourceEvidence(extraction) {
  const kind = text(extraction.source_kind, 20).toUpperCase();
  if (kind === "CALL") {
    const [call, turns] = await Promise.all([
      one(
        supabaseAdmin
          .from("secretary_calls")
          .select("id,direction,status,started_at,answered_at,ended_at,summary,contact_party_id")
          .eq("organization_id", extraction.organization_id)
          .eq("id", extraction.source_id)
          .maybeSingle(),
      ),
      many(
        supabaseAdmin
          .from("secretary_call_turns")
          .select("speaker,transcript,language,intent,decision,sequence_number")
          .eq("organization_id", extraction.organization_id)
          .eq("call_id", extraction.source_id)
          .order("sequence_number", { ascending: true })
          .limit(80),
      ),
    ]);
    if (!call) return null;
    const executedActions = turns
      .map((turn) => text(object(turn.decision).action || turn.intent, 80).toUpperCase())
      .filter(Boolean);
    return {
      source_kind: "CALL",
      occurred_at: call.ended_at || call.started_at,
      summary: text(call.summary, 4000) || null,
      transcript: turns.map((turn) => ({
        speaker: turn.speaker,
        text: text(turn.transcript, 6000),
      })),
      executed_secretary_actions: [...new Set(executedActions)],
    };
  }

  if (kind === "MESSAGE") {
    const [message, reception] = await Promise.all([
      one(
        supabaseAdmin
          .from("communication_messages")
          .select("id,body,subject,received_at,created_at,direction")
          .eq("organization_id", extraction.organization_id)
          .eq("id", extraction.source_id)
          .maybeSingle(),
      ),
      one(
        supabaseAdmin
          .from("secretary_message_reception_requests")
          .select("decision_action,action_result,response_message_id,completed_at")
          .eq("organization_id", extraction.organization_id)
          .eq("inbound_message_id", extraction.source_id)
          .maybeSingle(),
      ),
    ]);
    if (!message || message.direction !== "INBOUND") return null;

    const response = reception?.response_message_id
      ? await one(
          supabaseAdmin
            .from("communication_messages")
            .select("id,body,subject,status,sent_at,created_at,direction")
            .eq("organization_id", extraction.organization_id)
            .eq("id", reception.response_message_id)
            .eq("direction", "OUTBOUND")
            .maybeSingle(),
        )
      : null;

    return {
      source_kind: "MESSAGE",
      occurred_at: message.received_at || message.created_at,
      subject: text(message.subject, 1000) || null,
      contact_message: text(message.body, 12000),
      secretary_response: response
        ? {
            body: text(response.body, 12000),
            status: text(response.status, 40).toUpperCase() || null,
            sent_at: response.sent_at || response.created_at || null,
          }
        : null,
      executed_secretary_actions: [text(reception?.decision_action, 80).toUpperCase()].filter(Boolean),
    };
  }

  return null;
}

async function organizationTimeContext(organizationId) {
  const settings = await one(
    supabaseAdmin
      .from("secretary_settings")
      .select("default_timezone")
      .eq("organization_id", organizationId)
      .maybeSingle(),
  );
  return {
    now: new Date().toISOString(),
    timezone: text(settings?.default_timezone, 120) || "UTC",
  };
}

function extractionSystem() {
  return [
    "You are Avantiqo Secretary reviewing a completed outside interaction for explicit future commitments or follow-up obligations.",
    "Extract only obligations clearly stated in the evidence. Do not infer tasks from general conversation, politeness, possibilities, sales interest, or vague intent.",
    "For every commitment classify execution_owner as SECRETARY, CONTACT, STAFF, or UNKNOWN.",
    "SECRETARY means Avantiqo Secretary itself explicitly promised the action, or the outside contact explicitly directed the Secretary to perform it later (for example: 'please call me Friday').",
    "CONTACT means the outside caller/sender promised to do it (for example: 'I will send the document Monday'). CONTACT obligations are monitored, never executed on their behalf.",
    "STAFF means a named or clearly identified internal human/staff member owns the promised action. UNKNOWN means ownership is not unambiguous.",
    "If CONTACT, STAFF, or UNKNOWN owns the obligation, normally use REVIEW as action_type unless the evidence specifically requires another internal follow-up category. Never mark those commitments execution_ready.",
    "Do not duplicate anything already listed in executed_secretary_actions. If REQUEST_CALLBACK was already executed, do not create the same call follow-up. If LEAVE_MESSAGE already recorded the request, do not recreate that message as a task.",
    "Resolve relative dates only from supplied now/timezone. If a date/time is not explicit enough to resolve safely, due_at must be null.",
    "Return at most 5 commitments. Each must have explicit=true.",
    "action_type must be one of CALL, MESSAGE, EMAIL, MEETING, REVIEW, OTHER.",
    "execution_ready may be true only when execution_owner is SECRETARY, action_type is CALL, MESSAGE, or EMAIL, due_at is resolved, and the action can be performed without inventing a missing document, price, attachment, business fact, decision, or approval.",
    "A simple promised call, reminder, acknowledgement, confirmation, or factual follow-up can be execution_ready when the evidence itself contains enough information. A promise to send a missing file, quote, contract, report, price, or other unavailable content must be execution_ready=false.",
    "execution_instruction must be a concise factual instruction grounded only in the evidence. It must never contain invented content.",
    "reason must be a concise factual description grounded in the interaction. Preserve names or important wording when present, but do not invent details.",
    "Return exactly one JSON object: {\"commitments\":[{\"explicit\":true,\"execution_owner\":\"SECRETARY\",\"execution_ready\":true,\"execution_instruction\":\"Call the contact to follow up on the requested discussion\",\"action_type\":\"CALL\",\"reason\":\"Secretary promised to call the contact Friday\",\"due_at\":\"ISO timestamp or null\"}]}.",
  ].join("\n");
}

async function extractCommitments(extraction, evidence, timeContext) {
  const result = await AvantiqoStructuredIntelligenceSupervisorRuntime.run({
    organization_id: extraction.organization_id,
    party_id: null,
    system: extractionSystem(),
    messages: [{
      role: "user",
      content: JSON.stringify({
        time_context: timeContext,
        interaction_evidence: evidence,
      }),
    }],
    tools: [],
    authorization: { allow_mutating_tools: false },
    metadata: {
      module: "SECRETARY",
      operation: "EXTRACT_EXPLICIT_COMMITMENTS",
      query_plan_only: true,
      raw_reasoning_persisted: false,
      external_authority_used: false,
    },
    mode: "fast",
    max_output_tokens: 800,
  });

  return list(result?.parsed?.commitments)
    .slice(0, 5)
    .map((item) => {
      const raw = object(item);
      const actionType = text(raw.action_type, 40).toUpperCase();
      const executionOwner = text(raw.execution_owner, 40).toUpperCase();
      const reason = text(raw.reason, 2000);
      const executionInstruction = text(raw.execution_instruction, 2000) || reason;
      const dueParsed = Date.parse(text(raw.due_at, 120));
      const normalizedOwner = EXECUTION_OWNERS.has(executionOwner) ? executionOwner : "UNKNOWN";
      const normalizedAction = ACTION_TYPES.has(actionType) ? actionType : "OTHER";
      const dueAt = Number.isFinite(dueParsed) ? new Date(dueParsed).toISOString() : null;
      const executionReady =
        raw.execution_ready === true &&
        normalizedOwner === "SECRETARY" &&
        SECRETARY_EXECUTABLE_ACTIONS.has(normalizedAction) &&
        Boolean(dueAt) &&
        Boolean(executionInstruction);
      return {
        explicit: raw.explicit === true,
        execution_owner: normalizedOwner,
        execution_ready: executionReady,
        execution_instruction: executionInstruction,
        action_type: normalizedAction,
        reason,
        due_at: dueAt,
      };
    })
    .filter((item) => item.explicit && item.reason);
}

function itemKey(extractionId, item) {
  const fingerprint = createHash("sha256")
    .update(
      `${item.execution_owner}|${item.execution_ready ? "ready" : "review"}|${item.action_type}|${item.reason}|${item.due_at || ""}`,
    )
    .digest("hex")
    .slice(0, 24);
  return `${extractionId}:${fingerprint}`;
}

async function ensureFollowUp(extraction, item, key) {
  const existing = await one(
    supabaseAdmin
      .from("secretary_follow_ups")
      .select("id")
      .eq("organization_id", extraction.organization_id)
      .contains("metadata", { commitment_extraction_item_key: key })
      .maybeSingle(),
  );
  if (existing?.id) return existing.id;

  const result = await supabaseAdmin
    .from("secretary_follow_ups")
    .insert({
      organization_id: extraction.organization_id,
      contact_party_id: extraction.contact_party_id || null,
      call_id: extraction.source_kind === "CALL" ? extraction.source_id : null,
      conversation_id: extraction.conversation_id || null,
      action_type: item.action_type,
      reason: item.reason,
      status: "PENDING",
      due_at: item.due_at,
      metadata: {
        commitment_extraction_id: extraction.id,
        commitment_extraction_item_key: key,
        source_kind: extraction.source_kind,
        explicit_commitment: true,
        execution_owner: item.execution_owner,
        execution_ready: item.execution_ready,
        execution_instruction: item.execution_instruction,
      },
    })
    .select("id")
    .single();
  if (result.error) {
    if (result.error.code === "23505") {
      const replayed = await one(
        supabaseAdmin
          .from("secretary_follow_ups")
          .select("id")
          .eq("organization_id", extraction.organization_id)
          .contains("metadata", { commitment_extraction_item_key: key })
          .maybeSingle(),
      );
      if (replayed?.id) return replayed.id;
    }
    throw result.error;
  }
  return result.data.id;
}

async function ensureTask(extraction, item, key) {
  const existing = await one(
    supabaseAdmin
      .from("secretary_tasks")
      .select("id")
      .eq("organization_id", extraction.organization_id)
      .contains("metadata", { commitment_extraction_item_key: key })
      .maybeSingle(),
  );
  if (existing?.id) return existing.id;

  const result = await supabaseAdmin
    .from("secretary_tasks")
    .insert({
      organization_id: extraction.organization_id,
      contact_party_id: extraction.contact_party_id || null,
      title: "Review conversation commitment",
      details: item.reason,
      status: "OPEN",
      priority: "NORMAL",
      source: "secretary_commitment_capture",
      metadata: {
        commitment_extraction_id: extraction.id,
        commitment_extraction_item_key: key,
        source_kind: extraction.source_kind,
        source_id: extraction.source_id,
        conversation_id: extraction.conversation_id || null,
        explicit_commitment: true,
        execution_owner: item.execution_owner,
        execution_ready: false,
        execution_instruction: item.execution_instruction,
      },
    })
    .select("id")
    .single();
  if (result.error) {
    if (result.error.code === "23505") {
      const replayed = await one(
        supabaseAdmin
          .from("secretary_tasks")
          .select("id")
          .eq("organization_id", extraction.organization_id)
          .contains("metadata", { commitment_extraction_item_key: key })
          .maybeSingle(),
      );
      if (replayed?.id) return replayed.id;
    }
    throw result.error;
  }
  return result.data.id;
}

async function finishExtraction(extraction, { status, commitments = [], followUpIds = [], taskIds = [], error = null }) {
  const result = await supabaseAdmin
    .from("secretary_commitment_extractions")
    .update({
      status,
      extracted_commitments: commitments,
      created_follow_up_ids: followUpIds,
      created_task_ids: taskIds,
      last_error: error ? text(error, 2000) : null,
      completed_at: ["COMPLETED", "SKIPPED"].includes(status) ? new Date().toISOString() : null,
      lease_token: null,
      lease_expires_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", extraction.id)
    .select("*")
    .single();
  if (result.error) throw result.error;
  return result.data;
}

export async function processSecretaryCommitmentExtraction(extraction) {
  const evidence = await sourceEvidence(extraction);
  if (!evidence) {
    return {
      status: "skipped",
      extraction: await finishExtraction(extraction, {
        status: "SKIPPED",
        error: "SOURCE_EVIDENCE_UNAVAILABLE",
      }),
    };
  }

  const timeContext = await organizationTimeContext(extraction.organization_id);
  const commitments = await extractCommitments(extraction, evidence, timeContext);
  if (!commitments.length) {
    return {
      status: "completed",
      extraction: await finishExtraction(extraction, {
        status: "COMPLETED",
        commitments: [],
      }),
    };
  }

  const followUpIds = [];
  const taskIds = [];
  for (const item of commitments) {
    const key = itemKey(extraction.id, item);
    if (item.due_at) {
      followUpIds.push(await ensureFollowUp(extraction, item, key));
    } else {
      taskIds.push(await ensureTask(extraction, item, key));
    }
  }

  const completed = await finishExtraction(extraction, {
    status: "COMPLETED",
    commitments,
    followUpIds,
    taskIds,
  });
  return {
    status: "completed",
    extraction: completed,
    commitment_count: commitments.length,
    follow_up_count: followUpIds.length,
    task_count: taskIds.length,
    secretary_execution_ready_count: commitments.filter((item) => item.execution_ready).length,
  };
}

export async function failSecretaryCommitmentExtraction(extraction, error) {
  const attempt = Math.max(1, Number(extraction.attempt_count || 1));
  const exhausted = attempt >= Number(extraction.max_attempts || 4);
  const result = await supabaseAdmin
    .from("secretary_commitment_extractions")
    .update({
      status: exhausted ? "SKIPPED" : "FAILED",
      available_at: new Date(Date.now() + Math.min(300, 15 * 2 ** Math.min(attempt, 5)) * 1000).toISOString(),
      lease_token: null,
      lease_expires_at: null,
      last_error: text(error?.message || error, 2000) || "Commitment extraction failed",
      completed_at: exhausted ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", extraction.id)
    .select("*")
    .single();
  if (result.error) throw result.error;
  return result.data;
}

export default {
  claimSecretaryCommitmentExtraction,
  processSecretaryCommitmentExtraction,
  failSecretaryCommitmentExtraction,
};
