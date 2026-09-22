import {
  AVANTIQO_INTELLIGENCE_LOCAL_CONTEXT_TOKENS,
  AVANTIQO_INTELLIGENCE_LOCAL_CONTEXT_SAFETY_TOKENS,
} from './AvantiqoIntelligenceLocalPolicy.js';
import {
  executeIntelligenceLocalQueueAndWait,
  intelligenceLocalQueueConfigured,
  localIntelligenceContextFits,
} from './AvantiqoIntelligenceLocalQueueRuntime.js';

const CONTRACT = 'AVANTIQO_HIERARCHICAL_LOCAL_REASONING_V1';
const PROVIDER_ID = 'avantiqo-intelligence';
const INFRASTRUCTURE_PROVIDER = 'AVANTIQO_LOCAL_NODE_V1';
const DEFAULT_CHUNK_CHARS = 50000;
const DEFAULT_CHUNK_OUTPUT_TOKENS = 1100;
const DEFAULT_MERGE_OUTPUT_TOKENS = 1400;
const DEFAULT_FINAL_OUTPUT_CAP = 6000;
const DEFAULT_TIMEOUT_MS = 120000;

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

async function runLocalPass(input, prompt, maxOutputTokens, stage) {
  const response = await executeIntelligenceLocalQueueAndWait({
    capability: text(input.capability) || 'ai.reasoning.execute',
    execution_lane: 'deep',
    local_compute_required: true,
    infrastructure_policy: 'local_only',
    context: childContext(input),
    prompt,
    max_output_tokens: maxOutputTokens,
    temperature: 0.1,
    response_format: { type: 'json_object' },
    hierarchical_stage: stage,
  }, {
    timeout_ms: Number(process.env.AVANTIQO_LOCAL_DEEP_CHILD_TIMEOUT_MS) || DEFAULT_TIMEOUT_MS,
    poll_ms: 500,
  });
  const output = object(response?.output);
  const answer = text(output.text || output.answer || output.content);
  if (!answer) throw new Error(`AVANTIQO_HIERARCHICAL_LOCAL_EMPTY_STAGE:${stage}`);
  return { answer, output };
}

function chunkPrompt(chunk, index, count) {
  return `You are Avantiqo local deep reasoning stage 1.\nAnalyze only the supplied chunk. Preserve exact facts, constraints, identifiers, contradictions, required fields, and creative/operational decisions. Do not invent anything. Return compact JSON with keys: facts, constraints, decisions, risks, required_output_fields, unresolved.\nCHUNK ${index + 1}/${count}:\n${chunk}`;
}

function mergePrompt(items, round, index, count) {
  return `You are Avantiqo local deep reasoning merge stage.\nMerge these partial evidence summaries without losing conflicts, identifiers, mandatory constraints, or required output fields. Remove repetition only. Do not add facts. Return compact JSON with keys: facts, constraints, decisions, risks, required_output_fields, unresolved.\nMERGE ROUND ${round} GROUP ${index + 1}/${count}:\n${items.join('\n---SUMMARY---\n')}`;
}

function finalPrompt(input, compactEvidence, header) {
  const wantsJson = (input.response_format || input.responseFormat)?.type === 'json_object';
  return `You are Avantiqo local deep reasoning final synthesis.\nProduce the requested final answer from the compact evidence only. Respect every mandatory constraint and required field. Do not invent facts. ${wantsJson ? 'Return JSON only.' : 'Return only the final answer.'}\n\nORIGINAL TASK HEADER:\n${header}\n\nCOMPACT EVIDENCE:\n${compactEvidence}`;
}

export function shouldUseHierarchicalLocalIntelligence(input = {}) {
  if (!enabled(process.env.AVANTIQO_LOCAL_DEEP_HIERARCHICAL_ENABLED, true)) return false;
  if (lane(input) !== 'deep') return false;
  if (!intelligenceLocalQueueConfigured(input)) return false;
  if (list(input.tools).length) return false;
  return !localIntelligenceContextFits(input, 'deep');
}

export async function executeHierarchicalLocalIntelligence(input = {}) {
  if (!shouldUseHierarchicalLocalIntelligence(input)) {
    throw new Error('AVANTIQO_HIERARCHICAL_LOCAL_NOT_ELIGIBLE');
  }
  const source = flattenedInput(input);
  if (!source) throw new Error('AVANTIQO_HIERARCHICAL_LOCAL_INPUT_REQUIRED');

  const chunks = splitText(source);
  if (chunks.length < 2) throw new Error('AVANTIQO_HIERARCHICAL_LOCAL_CHUNKING_REQUIRED');

  const childOutputs = [];
  const stageMetrics = [];
  for (let i = 0; i < chunks.length; i += 1) {
    const started = Date.now();
    const result = await runLocalPass(input, chunkPrompt(chunks[i], i, chunks.length), DEFAULT_CHUNK_OUTPUT_TOKENS, `chunk-${i + 1}`);
    childOutputs.push(result.answer);
    stageMetrics.push({ stage: `chunk-${i + 1}`, elapsed_ms: Date.now() - started, chars_in: chunks[i].length, chars_out: result.answer.length });
  }

  let summaries = childOutputs;
  let round = 1;
  while (summaries.join('\n').length > 8000 && summaries.length > 1) {
    const groups = [];
    for (let i = 0; i < summaries.length; i += 3) groups.push(summaries.slice(i, i + 3));
    const next = [];
    for (let i = 0; i < groups.length; i += 1) {
      const started = Date.now();
      const result = await runLocalPass(input, mergePrompt(groups[i], round, i, groups.length), DEFAULT_MERGE_OUTPUT_TOKENS, `merge-${round}-${i + 1}`);
      next.push(result.answer);
      stageMetrics.push({ stage: `merge-${round}-${i + 1}`, elapsed_ms: Date.now() - started, chars_in: groups[i].join('\n').length, chars_out: result.answer.length });
    }
    summaries = next;
    round += 1;
    if (round > 8) throw new Error('AVANTIQO_HIERARCHICAL_LOCAL_REDUCTION_LIMIT');
  }

  const taskHeader = source.slice(0, 3000);
  const finalInput = {
    ...input,
    prompt: finalPrompt(input, summaries.join('\n---MERGED---\n'), taskHeader),
    messages: [],
    system_prompt: '',
    systemPrompt: '',
    instructions_text: '',
    max_output_tokens: Math.min(requestedOutput(input), DEFAULT_FINAL_OUTPUT_CAP),
    execution_lane: 'deep',
    local_compute_required: true,
    infrastructure_policy: 'local_only',
  };
  if (!localIntelligenceContextFits(finalInput, 'deep')) {
    throw new Error(`AVANTIQO_HIERARCHICAL_LOCAL_FINAL_CONTEXT_TOO_LARGE:${AVANTIQO_INTELLIGENCE_LOCAL_CONTEXT_TOKENS}:${AVANTIQO_INTELLIGENCE_LOCAL_CONTEXT_SAFETY_TOKENS}`);
  }
  const finalStarted = Date.now();
  const finalResult = await executeIntelligenceLocalQueueAndWait(finalInput, {
    timeout_ms: Number(process.env.AVANTIQO_LOCAL_DEEP_CHILD_TIMEOUT_MS) || DEFAULT_TIMEOUT_MS,
    poll_ms: 500,
  });
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
      hierarchical_stage_count: stageMetrics.length,
      hierarchical_stage_metrics: stageMetrics,
      local_context_tokens: AVANTIQO_INTELLIGENCE_LOCAL_CONTEXT_TOKENS,
      external_compute_started: false,
      modal_inference_performed: false,
      runpod_inference_performed: false,
    },
  };
}
