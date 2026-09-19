import { intelligenceContextFingerprint } from "./IntelligenceContextFingerprintPolicy.js";

const DEFAULT_POLICY = Object.freeze({
  recent_turns: 8,
  recent_chars: 7200,
  memory_items: 6,
  memory_chars: 5200,
  project_chars: 5200,
  attachment_items: 4,
  attachment_chars: 5000,
});

function text(value, limit = 20000) {
  return String(value ?? "").trim().slice(0, limit);
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function boundedStrings(values, limit, itemLimit = 500) {
  return list(values).slice(-limit).map((value) => text(value, itemLimit)).filter(Boolean);
}

function compactValue(value, depth = 0) {
  if (typeof value === "string") return text(value, 120);
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (depth >= 2) return null;
  if (Array.isArray(value)) {
    return value.slice(-4).map((item) => compactValue(item, depth + 1)).filter((item) => item !== null);
  }
  if (value && typeof value === "object") {
    const maximumEntries = depth === 0 ? 6 : 4;
    return Object.fromEntries(
      Object.entries(value)
        .slice(0, maximumEntries)
        .map(([key, item]) => [text(key, 80), compactValue(item, depth + 1)])
        .filter(([key, item]) => key && item !== null),
    );
  }
  return null;
}

export function compactProjectCheckpoint(projectState = {}, maximumChars = DEFAULT_POLICY.project_chars) {
  const state = object(projectState);
  const checkpoint = {
    objective: text(state.objective, 700) || null,
    status: text(state.status, 80) || null,
    decisions: boundedStrings(state.decisions, 6, 600),
    constraints: boundedStrings(state.constraints, 6, 600),
    assumptions: boundedStrings(state.assumptions, 4, 500),
    completed_steps: boundedStrings(state.completed_steps, 5, 500),
    progress_summary: text(state.progress_summary, 1000) || null,
    next_step: text(state.next_step, 700) || null,
    blocker: text(state.blocker, 700) || null,
    open_questions: boundedStrings(state.open_questions, 4, 500),
    creative_context: Object.keys(object(state.creative_context)).length
      ? compactValue(object(state.creative_context))
      : null,
  };
  const encoded = JSON.stringify(checkpoint);
  if (encoded.length <= maximumChars) return checkpoint;
  return {
    objective: checkpoint.objective,
    status: checkpoint.status,
    decisions: checkpoint.decisions.slice(-4),
    constraints: checkpoint.constraints.slice(-4),
    progress_summary: text(checkpoint.progress_summary, 650) || null,
    next_step: text(checkpoint.next_step, 450) || null,
    blocker: text(checkpoint.blocker, 450) || null,
    creative_context: checkpoint.creative_context,
  };
}

export function boundRecentConversation(conversation = [], policy = DEFAULT_POLICY) {
  const maximumTurns = Math.max(2, Number(policy.recent_turns) || DEFAULT_POLICY.recent_turns);
  const maximumChars = Math.max(1200, Number(policy.recent_chars) || DEFAULT_POLICY.recent_chars);
  const source = list(conversation).slice(-maximumTurns * 2);
  const selected = [];
  let used = 0;
  for (let index = source.length - 1; index >= 0 && selected.length < maximumTurns; index -= 1) {
    const row = source[index] || {};
    const content = text(row.content, 4000);
    if (!content) continue;
    const remaining = maximumChars - used;
    if (remaining <= 0) break;
    const bounded = content.slice(Math.max(0, content.length - remaining));
    const artifacts = list(row.presentation_artifacts).slice(0, 6).map((artifact) => ({
      url: text(artifact?.url, 1000),
      label: text(artifact?.label, 240) || null,
      mime_type: text(artifact?.mime_type, 160) || null,
      source_key: text(artifact?.source_key, 80) || null,
    })).filter((artifact) => artifact.url);
    const execution = object(row.execution);
    selected.push({
      role: row.role === "assistant" ? "assistant" : "user",
      content: bounded,
      ...(artifacts.length ? { presentation_artifacts: artifacts } : {}),
      ...(Object.keys(execution).length ? { execution: {
        status: text(execution.status, 80) || null,
        capability_key: text(execution.capability_key, 300) || null,
      } } : {}),
    });
    used += bounded.length + JSON.stringify(artifacts).length;
  }
  return selected.reverse();
}

export function boundDurableMemory(memories = [], policy = DEFAULT_POLICY) {
  const maximumItems = Math.max(1, Number(policy.memory_items) || DEFAULT_POLICY.memory_items);
  const maximumChars = Math.max(1200, Number(policy.memory_chars) || DEFAULT_POLICY.memory_chars);
  const output = [];
  let used = 0;
  for (const memory of list(memories).slice(0, maximumItems * 2)) {
    if (output.length >= maximumItems) break;
    const remaining = maximumChars - used;
    if (remaining <= 0) break;
    const content = text(memory?.content, Math.min(1200, remaining));
    if (!content) continue;
    output.push({ ...memory, content });
    used += content.length;
  }
  return output;
}

export function boundConversationAttachments(attachments = [], policy = DEFAULT_POLICY) {
  const maximumItems = Math.max(1, Number(policy.attachment_items) || DEFAULT_POLICY.attachment_items);
  const maximumChars = Math.max(1200, Number(policy.attachment_chars) || DEFAULT_POLICY.attachment_chars);
  const output = [];
  let used = 0;
  for (const attachment of list(attachments).slice(-maximumItems)) {
    const encoded = JSON.stringify(attachment ?? null);
    const remaining = maximumChars - used;
    if (remaining <= 0) break;
    if (encoded.length <= remaining) {
      output.push(attachment);
      used += encoded.length;
      continue;
    }
    const source = object(attachment);
    output.push({
      id: source.id || null,
      name: text(source.name || source.file_name, 300) || null,
      mime_type: text(source.mime_type || source.mimeType, 160) || null,
      summary: text(source.summary || source.analysis?.summary, Math.max(200, remaining - 500)) || null,
      prepared_candidate: source.prepared_candidate || null,
    });
    break;
  }
  return output;
}

export function buildIntelligenceContextBudget({ conversation = [], projectState = {}, longTermMemory = [], attachments = [], lane = "fast", scope = {} } = {}) {
  const policy = lane === "deep"
    ? { ...DEFAULT_POLICY, recent_turns: 12, recent_chars: 12000, memory_items: 10, memory_chars: 9000, project_chars: 7000, attachment_items: 6, attachment_chars: 9000 }
    : DEFAULT_POLICY;
  const conversationSource = list(conversation);
  const memorySource = list(longTermMemory);
  const attachmentSource = list(attachments);
  const recentConversation = boundRecentConversation(conversationSource, policy);
  const memory = boundDurableMemory(memorySource, policy);
  const boundedAttachments = boundConversationAttachments(attachmentSource, policy);
  const projectCheckpoint = compactProjectCheckpoint(projectState, policy.project_chars);
  const contextFingerprint = intelligenceContextFingerprint({
    scope,
    projectCheckpoint,
    durableMemory: memory,
    attachments: boundedAttachments,
    recentConversation,
  });
  return {
    contract: "AVANTIQO_INTELLIGENCE_CONTEXT_BUDGET_V1",
    lane,
    policy,
    recent_conversation: recentConversation,
    project_checkpoint: projectCheckpoint,
    durable_memory: memory,
    attachments: boundedAttachments,
    context_fingerprint: contextFingerprint,
    telemetry: {
      source_turns: conversationSource.length,
      dropped_turns: Math.max(0, conversationSource.length - recentConversation.length),
      source_memory_items: memorySource.length,
      dropped_memory_items: Math.max(0, memorySource.length - memory.length),
      source_attachment_items: attachmentSource.length,
      dropped_attachment_items: Math.max(0, attachmentSource.length - boundedAttachments.length),
      recent_turns: recentConversation.length,
      recent_chars: recentConversation.reduce((sum, item) => sum + text(item.content).length, 0),
      memory_items: memory.length,
      memory_chars: memory.reduce((sum, item) => sum + text(item.content).length, 0),
      project_chars: JSON.stringify(projectCheckpoint).length,
      attachment_items: boundedAttachments.length,
      attachment_chars: JSON.stringify(boundedAttachments).length,
      estimated_input_tokens: Math.ceil((
        recentConversation.reduce((sum, item) => sum + text(item.content).length, 0) +
        memory.reduce((sum, item) => sum + text(item.content).length, 0) +
        JSON.stringify(projectCheckpoint).length +
        JSON.stringify(boundedAttachments).length
      ) / 4),
      estimated_context_bytes: Buffer.byteLength(JSON.stringify({
        recent_conversation: recentConversation,
        project_checkpoint: projectCheckpoint,
        durable_memory: memory,
        attachments: boundedAttachments,
      }), "utf8"),
    },
  };
}

export const IntelligenceContextBudgetRuntime = Object.freeze({
  contract: "AVANTIQO_INTELLIGENCE_CONTEXT_BUDGET_V1",
  build: buildIntelligenceContextBudget,
  compactProjectCheckpoint,
  boundRecentConversation,
  boundDurableMemory,
  boundConversationAttachments,
});
