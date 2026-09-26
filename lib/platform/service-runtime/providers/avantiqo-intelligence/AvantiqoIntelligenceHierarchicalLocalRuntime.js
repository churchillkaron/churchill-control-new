import { createHash } from 'node:crypto';

import {
  AVANTIQO_INTELLIGENCE_LOCAL_CONTEXT_TOKENS,
  AVANTIQO_INTELLIGENCE_LOCAL_CONTEXT_SAFETY_TOKENS,
  AVANTIQO_INTELLIGENCE_LOCAL_DEEP_OUTPUT_CAP,
  AVANTIQO_INTELLIGENCE_LOCAL_DEEP_SINGLE_PASS_TRUSTED_PROMPT_TOKENS,
} from './AvantiqoIntelligenceLocalPolicy.js';
import {
  executeIntelligenceLocalQueueAndWait,
  intelligenceLocalQueueConfigured,
  localIntelligenceContextFits,
} from './AvantiqoIntelligenceLocalQueueRuntime.js';

const CONTRACT = 'AVANTIQO_HIERARCHICAL_LOCAL_REASONING_V1';
const PROVIDER_ID = 'avantiqo-intelligence';
const INFRASTRUCTURE_PROVIDER = 'AVANTIQO_LOCAL_NODE_V1';
const DEFAULT_CHUNK_CHARS = 12000;
const DEFAULT_CHUNK_OUTPUT_TOKENS = 512;
const DEFAULT_MERGE_OUTPUT_TOKENS = 700;
const DEFAULT_FINAL_OUTPUT_CAP = AVANTIQO_INTELLIGENCE_LOCAL_DEEP_OUTPUT_CAP;
const FINAL_EVIDENCE_CHAR_TARGET = 1600;
const DEFAULT_TIMEOUT_MS = 360000;
const MAX_CHUNKS = 12;

function text(value) { return String(value ?? '').trim(); }
function list(value) { return Array.isArray(value) ? value : []; }
function object(value) { return value && typeof value === 'object' && !Array.isArray(value) ? value : {}; }
function enabled(value, fallback = true) {
  const normalized = text(value).toLowerCase();
  if (!normalized) return fallback;
  if (['1','true','yes','on'].includes(normalized)) return true;
  if (['0','false','no','off'].includes(normalized)) return false;
  return fallback;
}

function lane(input = {}) {
  return text(input.execution_lane || input.executionLane).toLowerCase() || 'fast';
}

function hierarchicalDisabled(input = {}) {
  return input.hierarchical_local_disabled === true ||
    input.hierarchicalLocalDisabled === true ||
    input.metadata?.hierarchical_local_disabled === true;
}

function estimatedPromptTokens(input = {}) {
  const source = flattenedInput(input);
  return Math.max(1, Math.ceil(source.length / 3.2));
}

function flattenedInput(input = {}) {
  const parts = [];
  const system = text(input.system_prompt || input.systemPrompt || input.instructions_text);
  if (system) parts.push(`SYSTEM / INSTRUCTIONS:\n${system}`);
  const messages = list(input.messages);
  if (messages.length) {
    parts.push(messages.map((entry) => `${text(entry?.role) || 'user'}:\n${String(entry?.content ?? '')}`).join('\n\n'));
  } else {
    const prompt = text(input.prompt || input.input || input.text);
    if (prompt) parts.push(prompt);
  }
  return parts.filter(Boolean).join('\n\n');
}

function splitText(source, maxChars = DEFAULT_CHUNK_CHARS, overlapChars = 600) {
  const textValue = String(source || '');
  if (!textValue) return [];
  const chunks = [];
  let start = 0;
  while (start < textValue.length) {
    let end = Math.min(textValue.length, start + maxChars);
    if (end < textValue.length) {
      const boundary = Math.max(
        textValue.lastIndexOf('\n\n', end),
        textValue.lastIndexOf('\n', end),
        textValue.lastIndexOf('. ', end),
      );
      if (boundary > start + Math.floor(maxChars * 0.65)) end = boundary + 1;
    }
    chunks.push(textValue.slice(start, end));
    if (end >= textValue.length) break;
    start = Math.max(end - overlapChars, start + 1);
  }
  return chunks;
}

function childContext(input = {}) {
  const context = object(input.context);
  if (!text(context.organization_id) || !text(context.usage_id)) {
    throw new Error('AVANTIQO_HIERARCHICAL_LOCAL_GOVERNED_CONTEXT_REQUIRED');
  }
  return context;
}

function requestedOutput(input = {}) {
  return Math.max(1, Number(input.max_output_tokens || input.maxOutputTokens) || 1024);
}

function hierarchicalAnchor(input = {}) {
  const anchor = input.hierarchical_anchor || input.hierarchicalAnchor || null;
  if (!anchor) return "";
  return typeof anchor === "string" ? anchor : JSON.stringify(anchor);
}

function hierarchicalFinalInstructions(input = {}) {
  return text(input.hierarchical_final_instructions || input.hierarchicalFinalInstructions);
}

function requestedMaxChunks(input = {}) {
  const requested = Number(input.hierarchical_max_chunks || input.hierarchicalMaxChunks);
  if (!Number.isFinite(requested) || requested <= 0) return MAX_CHUNKS;
  return Math.max(2, Math.min(Math.floor(requested), MAX_CHUNKS));
}

function requestedChildTimeoutMs(input = {}) {
  const requested = Number(input.hierarchical_child_timeout_ms || input.hierarchicalChildTimeoutMs);
  const fallback = Number(process.env.AVANTIQO_LOCAL_DEEP_CHILD_TIMEOUT_MS) || DEFAULT_TIMEOUT_MS;
  const value = Number.isFinite(requested) && requested > 0 ? requested : fallback;
  return Math.max(10_000, Math.min(Math.floor(value), 600_000));
}

function hierarchicalStageExecutionKey(
  input = {},
  stage = "",
  prompt = "",
  maxOutputTokens = null,
) {
  const base = text(
    input.execution_idempotency_key ||
    input.request_idempotency_key ||
    input.execution_key ||
    input.idempotency_key ||
    input.metadata?.provider_execution_key ||
    input.metadata?.execution_key,
  );
  if (!base || !text(stage)) return null;
  const stageFingerprint = createHash("sha256")
    .update(JSON.stringify({
      contract: "AVANTIQO_HIERARCHICAL_STAGE_REQUEST_V2",
      stage: text(stage),
      prompt: String(prompt ?? ""),
      max_output_tokens: Number(maxOutputTokens || 0),
      capability: text(input.capability) || "ai.reasoning.execute",
      response_format: (input.response_format || input.responseFormat)?.type || null,
    }))
    .digest("hex")
    .slice(0, 16);
  return `${base}:hierarchical:${text(stage)}:${stageFingerprint}`;
}

async function runLocalPass(input, prompt, maxOutputTokens, stage) {
  const stageExecutionKey = hierarchicalStageExecutionKey(
    input,
    stage,
    prompt,
    maxOutputTokens,
  );
  const response = await executeIntelligenceLocalQueueAndWait({
    capability: text(input.capability) || 'ai.reasoning.execute',
    ...(stageExecutionKey ? {
      execution_idempotency_key: stageExecutionKey,
      request_idempotency_key: stageExecutionKey,
    } : {}),
    execution_lane: 'deep',
    local_compute_required: true,
    infrastructure_policy: 'local_only',
    context: childContext(input),
    prompt,
    max_output_tokens: maxOutputTokens,
    temperature: 0.1,
    response_format: { type: 'json_object' },
    hierarchical_stage: stage,
    hierarchical_local_disabled: true,
  }, {
    timeout_ms: requestedChildTimeoutMs(input),
    poll_ms: 500,
  });
  const output = object(response?.output);
  const answer = text(output.text || output.answer || output.content);
  if (!answer) throw new Error(`AVANTIQO_HIERARCHICAL_LOCAL_EMPTY_STAGE:${stage}`);
  return { answer, output };
}

function chunkPrompt(input, chunk, index, count) {
  const anchor = hierarchicalAnchor(input);
  return `You are Avantiqo local deep reasoning stage 1.
IMMUTABLE ANCHOR:
${anchor || "None supplied."}

Analyze only the supplied chunk in service of the immutable anchor. Preserve exact facts, constraints, identifiers, exact asset ids, registered role ids, contradictions, required fields, and creative/operational decisions. Never let schema text replace or reinterpret the anchor. Do not invent anything. Return compact JSON with keys: facts, constraints, decisions, risks, required_output_fields, unresolved.
CHUNK ${index + 1}/${count}:
${chunk}`;
}

function retryableLocalContextError(error) {
  const message = text(error?.message || error).toUpperCase();
  return (
    message.includes('(400) BAD REQUEST') ||
    message.includes('CONTEXT') ||
    message.includes('LOCAL_QUEUE_NOT_ELIGIBLE') ||
    message.includes('NUM_CTX')
  );
}

async function summarizeChunkAdaptive(input, chunk, label, stageMetrics, depth = 0) {
  const started = Date.now();
  try {
    const result = await runLocalPass(
      input,
      chunkPrompt(input, chunk, 0, 1),
      DEFAULT_CHUNK_OUTPUT_TOKENS,
      label,
    );
    stageMetrics.push({
      stage: label,
      elapsed_ms: Date.now() - started,
      chars_in: chunk.length,
      chars_out: result.answer.length,
      adaptive_depth: depth,
    });
    return [result.answer];
  } catch (error) {
    if (!retryableLocalContextError(error) || depth >= 3 || chunk.length < 5000) throw error;
    const childMaxChars = Math.max(4500, Math.floor(chunk.length / 2));
    const parts = splitText(chunk, childMaxChars, 250);
    if (parts.length < 2) throw error;
    stageMetrics.push({
      stage: label,
      elapsed_ms: Date.now() - started,
      chars_in: chunk.length,
      chars_out: 0,
      adaptive_depth: depth,
      split_retry: true,
      split_parts: parts.length,
    });
    const summaries = [];
    for (let index = 0; index < parts.length; index += 1) {
      const child = await summarizeChunkAdaptive(
        input,
        parts[index],
        `${label}-split-${index + 1}`,
        stageMetrics,
        depth + 1,
      );
      summaries.push(...child);
    }
    return summaries;
  }
}

function mergePrompt(input, items, round, index, count) {
  const anchor = hierarchicalAnchor(input);
  return `You are Avantiqo local deep reasoning merge stage.
IMMUTABLE ANCHOR:
${anchor || "None supplied."}

Merge these partial evidence summaries without losing conflicts, identifiers, exact asset ids, registered role ids, mandatory constraints, or required output fields. Remove repetition only. The immutable anchor outranks generic/schema-derived summaries and may never be replaced by another story or subject. Do not add facts. Return compact JSON with keys: facts, constraints, decisions, risks, required_output_fields, unresolved.
MERGE ROUND ${round} GROUP ${index + 1}/${count}:
${items.join('\n---SUMMARY---\n')}`;
}

function finalPrompt(input, compactEvidence, header) {
  const wantsJson = (input.response_format || input.responseFormat)?.type === 'json_object';
  const anchor = hierarchicalAnchor(input);
  const finalInstructions = hierarchicalFinalInstructions(input);
  return `You are Avantiqo local deep reasoning final synthesis.
IMMUTABLE ANCHOR:
${anchor || "None supplied."}

FINAL OUTPUT CONTRACT:
${finalInstructions || "Produce the requested final answer exactly."}

Produce the complete requested final answer. The immutable anchor is authoritative: do not substitute another protagonist, story, setting, threat, asset id, role id, deliverable, or creative device. Use the compact evidence only as supporting material. Respect every mandatory constraint and required field. Do not invent facts. ${wantsJson ? 'Return one valid JSON object only.' : 'Return only the final answer.'}

ORIGINAL TASK HEADER:
${header}

COMPACT EVIDENCE:
${compactEvidence}`;
}

export function shouldUseHierarchicalLocalIntelligence(input = {}) {
  if (!enabled(process.env.AVANTIQO_LOCAL_DEEP_HIERARCHICAL_ENABLED, true)) return false;
  if (hierarchicalDisabled(input)) return false;
  if (lane(input) !== 'deep') return false;
  if (!intelligenceLocalQueueConfigured(input)) return false;
  if (list(input.tools).length) return false;
  return estimatedPromptTokens(input) > AVANTIQO_INTELLIGENCE_LOCAL_DEEP_SINGLE_PASS_TRUSTED_PROMPT_TOKENS ||
    !localIntelligenceContextFits(input, 'deep');
}

export async function executeHierarchicalLocalIntelligence(input = {}) {
  if (!shouldUseHierarchicalLocalIntelligence(input)) {
    throw new Error('AVANTIQO_HIERARCHICAL_LOCAL_NOT_ELIGIBLE');
  }
  const source = flattenedInput(input);
  if (!source) throw new Error('AVANTIQO_HIERARCHICAL_LOCAL_INPUT_REQUIRED');

  const chunks = splitText(source);
  if (chunks.length < 2) throw new Error('AVANTIQO_HIERARCHICAL_LOCAL_CHUNKING_REQUIRED');
  const maxChunks = requestedMaxChunks(input);
  if (chunks.length > maxChunks) {
    throw new Error(`AVANTIQO_HIERARCHICAL_LOCAL_CHUNK_LIMIT:${chunks.length}:${maxChunks}`);
  }

  const childOutputs = [];
  const stageMetrics = [];
  console.info("HIER_LOCAL_STAGE", "chunks_start", JSON.stringify({ count: chunks.length }));
  for (let i = 0; i < chunks.length; i += 1) {
    const summaries = await summarizeChunkAdaptive(
      input,
      chunks[i],
      `chunk-${i + 1}`,
      stageMetrics,
    );
    childOutputs.push(...summaries);
  }

  console.info("HIER_LOCAL_STAGE", "chunks_done", JSON.stringify({ outputs: childOutputs.length, chars: childOutputs.join("\n").length }));
  let summaries = childOutputs;
  let round = 1;
  while (summaries.join('\n').length > FINAL_EVIDENCE_CHAR_TARGET && summaries.length > 1) {
    console.info("HIER_LOCAL_STAGE", "merge_round_start", JSON.stringify({ round, summaries: summaries.length, chars: summaries.join("\n").length }));
    const groups = [];
    for (let i = 0; i < summaries.length; i += 3) groups.push(summaries.slice(i, i + 3));
    const next = [];
    for (let i = 0; i < groups.length; i += 1) {
      const started = Date.now();
      const result = await runLocalPass(input, mergePrompt(input, groups[i], round, i, groups.length), DEFAULT_MERGE_OUTPUT_TOKENS, `merge-${round}-${i + 1}`);
      next.push(result.answer);
      stageMetrics.push({ stage: `merge-${round}-${i + 1}`, elapsed_ms: Date.now() - started, chars_in: groups[i].join('\n').length, chars_out: result.answer.length });
    }
    summaries = next;
    console.info("HIER_LOCAL_STAGE", "merge_round_done", JSON.stringify({ round, summaries: summaries.length, chars: summaries.join("\n").length }));
    round += 1;
    if (round > 8) throw new Error('AVANTIQO_HIERARCHICAL_LOCAL_REDUCTION_LIMIT');
  }

  const anchor = hierarchicalAnchor(input);
  const taskHeader = source.slice(0, anchor ? 320 : 2200);
  const finalPromptText = finalPrompt(
    input,
    summaries.join('\n---MERGED---\n'),
    taskHeader,
  );
  const estimatedFinalInputTokens = Math.max(1, Math.ceil(finalPromptText.length / 3.2));
  const availableFinalOutputTokens = Math.max(
    1,
    AVANTIQO_INTELLIGENCE_LOCAL_CONTEXT_TOKENS -
      AVANTIQO_INTELLIGENCE_LOCAL_CONTEXT_SAFETY_TOKENS -
      estimatedFinalInputTokens,
  );
  const finalOutputTokens = Math.min(
    requestedOutput(input),
    DEFAULT_FINAL_OUTPUT_CAP,
    AVANTIQO_INTELLIGENCE_LOCAL_DEEP_OUTPUT_CAP,
    AVANTIQO_INTELLIGENCE_LOCAL_DEEP_SINGLE_PASS_TRUSTED_PROMPT_TOKENS,
    availableFinalOutputTokens,
  );
  if (finalOutputTokens < 1200) {
    throw new Error(
      `AVANTIQO_HIERARCHICAL_LOCAL_FINAL_CONTEXT_TOO_LARGE:${estimatedFinalInputTokens}:${availableFinalOutputTokens}`,
    );
  }
  console.info("HIER_LOCAL_STAGE", "final_prepare", JSON.stringify({ summaries: summaries.length, evidence_chars: summaries.join("\n---MERGED---\n").length, final_prompt_chars: finalPromptText.length, final_output_tokens: finalOutputTokens }));
  const finalStageExecutionKey = hierarchicalStageExecutionKey(
    input,
    'final',
    finalPromptText,
    finalOutputTokens,
  );
  const finalInput = {
    ...input,
    ...(finalStageExecutionKey ? {
      execution_idempotency_key: finalStageExecutionKey,
      request_idempotency_key: finalStageExecutionKey,
    } : {}),
    prompt: finalPromptText,
    messages: [],
    system_prompt: '',
    systemPrompt: '',
    instructions_text: '',
    max_output_tokens: finalOutputTokens,
    execution_lane: 'deep',
    local_compute_required: true,
    infrastructure_policy: 'local_only',
    hierarchical_stage: 'final',
    hierarchical_local_disabled: true,
  };
  if (!localIntelligenceContextFits(finalInput, 'deep')) {
    throw new Error(`AVANTIQO_HIERARCHICAL_LOCAL_FINAL_CONTEXT_TOO_LARGE:${AVANTIQO_INTELLIGENCE_LOCAL_CONTEXT_TOKENS}:${AVANTIQO_INTELLIGENCE_LOCAL_CONTEXT_SAFETY_TOKENS}`);
  }
  const finalStarted = Date.now();
  console.info("HIER_LOCAL_STAGE", "final_dispatch");
  const finalResult = await executeIntelligenceLocalQueueAndWait(finalInput, {
    timeout_ms: requestedChildTimeoutMs(input),
    poll_ms: 500,
  });
  console.info("HIER_LOCAL_STAGE", "final_done");
  const finalOutput = object(finalResult?.output);
  stageMetrics.push({ stage: 'final', elapsed_ms: Date.now() - finalStarted, chars_in: finalInput.prompt.length, chars_out: text(finalOutput.text).length });

  return {
    success: true,
    provider: PROVIDER_ID,
    model: finalResult?.model,
    output: {
      ...finalOutput,
      status: 'completed',
      provider: PROVIDER_ID,
      infrastructure_provider: INFRASTRUCTURE_PROVIDER,
      execution_lane: 'deep',
      hierarchical_local: true,
      hierarchical_contract: CONTRACT,
      hierarchical_chunk_count: chunks.length,
      hierarchical_max_chunks: maxChunks,
      hierarchical_child_timeout_ms: requestedChildTimeoutMs(input),
      hierarchical_trigger_prompt_tokens: estimatedPromptTokens(input),
      hierarchical_single_pass_trusted_prompt_tokens: AVANTIQO_INTELLIGENCE_LOCAL_DEEP_SINGLE_PASS_TRUSTED_PROMPT_TOKENS,
      hierarchical_stage_count: stageMetrics.length,
      hierarchical_stage_metrics: stageMetrics,
      local_context_tokens: AVANTIQO_INTELLIGENCE_LOCAL_CONTEXT_TOKENS,
      external_compute_started: false,
      modal_inference_performed: false,
      runpod_inference_performed: false,
    },
  };
}
