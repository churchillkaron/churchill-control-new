import { listOperatorFastReads } from './OperatorFastReadIndex.js';
import { resolveOperatorCapabilityMatch } from './OperatorCapabilityMatcher.js';

function text(value, limit = 4000) {
  return String(value ?? '').trim().slice(0, limit);
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

function strongMatch(resolution) {
  const top = resolution?.top;
  if (!top?.capability) return false;
  if (Number(top.phrase_affinity || 0) >= 0.72) return true;
  return Number(top.primary_coverage || 0) >= 0.5 && Number(resolution?.separation || 0) >= 0.08;
}

function requiredStringFields(capability = {}) {
  const schema = capability?.input_schema || {};
  const properties = schema?.properties || {};
  return list(schema?.required)
    .filter((key) => properties?.[key]?.type === 'string')
    .map((key) => ({ key, definition: properties[key] || {} }));
}

function clarificationForField(field) {
  const key = text(field?.key, 120).replaceAll('_', ' ');
  const description = text(field?.definition?.description, 300);
  if (key === 'location') return 'Which location should I use?';
  return description ? `What ${key} should I use?` : `What ${key} should I use?`;
}

function immediateSlotValue({ immediateConversation = [], field }) {
  const recent = list(immediateConversation).slice(-2);
  const previousAssistant = recent.findLast?.((turn) => turn?.role === 'assistant') || null;
  const currentUser = recent.findLast?.((turn) => turn?.role !== 'assistant') || null;
  if (!previousAssistant || !currentUser) return null;
  const expected = clarificationForField(field).toLowerCase();
  if (text(previousAssistant?.content, 500).toLowerCase() !== expected) return null;
  const candidate = text(currentUser?.content, 240);
  if (!candidate || candidate.length > 120 || /[?.!]/.test(candidate)) return null;
  return candidate;
}

export function resolvePreSemanticReadIntent({ message, immediateConversation = [] } = {}) {
  const query = text(message, 12000);
  if (!query) return null;
  const resolution = resolveOperatorCapabilityMatch({
    message: query,
    capabilities: listOperatorFastReads(),
    modes: ['read'],
    limit: 5,
  });
  if (!strongMatch(resolution)) return null;

  const capability = resolution.top.capability;
  const requiredStrings = requiredStringFields(capability);
  const slotValues = {};
  for (const field of requiredStrings) {
    const inherited = immediateSlotValue({ immediateConversation, field });
    if (inherited) slotValues[field.key] = inherited;
  }
  const missing = requiredStrings.find((field) => !slotValues[field.key]);
  if (missing) {
    return {
      capability_key: capability.key,
      capability_payload: slotValues,
      route: 'conversation',
      evidence_scope: capability.external_evidence === true ? 'external' : 'internal',
      reasoning_depth: 'fast',
      conversation_mode: 'light',
      context_depth: 'compact',
      response_detail: 'brief',
      continuity_required: false,
      correction_or_revision: false,
      execution_domain: 'none',
      ambiguity_level: 'material',
      clarification_required: true,
      clarification_question: clarificationForField(missing),
      candidate_interpretations: [],
      user_goal: query,
      action_shape: 'none',
      goal_relation: 'new',
      artifact_intent: 'none',
      artifact_type: null,
      requires_mutation: false,
      needs_current_evidence: true,
      presemantic_read_match: true,
      context_required: false,
      authorization_effect: 'NONE',
    };
  }

  return {
    capability_key: capability.key,
    capability_payload: slotValues,
    route: 'evidence',
    evidence_scope: capability.external_evidence === true ? 'external' : 'internal',
    reasoning_depth: 'fast',
    conversation_mode: 'light',
    context_depth: 'compact',
    response_detail: 'normal',
    continuity_required: false,
    correction_or_revision: false,
    execution_domain: 'none',
    ambiguity_level: 'none',
    clarification_required: false,
    clarification_question: null,
    candidate_interpretations: [],
    user_goal: query,
    action_shape: 'none',
    goal_relation: 'new',
    artifact_intent: 'none',
    artifact_type: null,
    requires_mutation: false,
    needs_current_evidence: true,
    presemantic_read_match: true,
    context_required: false,
    authorization_effect: 'NONE',
  };
}

export default resolvePreSemanticReadIntent;
