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

function normalizedPhrase(value) {
  return text(value, 240).toLowerCase().replace(/[’']/g, "'").replace(/[^a-z0-9\s']/g, ' ').replace(/\s+/g, ' ').trim();
}

function symbolicReferenceForField(field, value) {
  const phrase = normalizedPhrase(value);
  if (!phrase) return null;
  if (field?.key === 'location') {
    if (new Set([
      'mine', 'my one', 'my location', 'my current location', 'current location',
      'use mine', 'use my one', 'use my location', 'use my current location',
      'here', 'right here', 'where i am', "where i'm at", 'where i am now',
      'this location', 'use this location', 'current',
    ]).has(phrase)) return 'device_location';
  }
  return null;
}

function validDeviceLocation(value) {
  const latitude = Number(value?.latitude);
  const longitude = Number(value?.longitude);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) return null;
  return {
    latitude, longitude,
    accuracy_m: Number.isFinite(Number(value?.accuracy_m)) ? Number(value.accuracy_m) : null,
    captured_at: text(value?.captured_at, 80) || null,
  };
}

function immediateSlotValue({ immediateConversation = [], field, deviceLocation = null }) {
  const recent = list(immediateConversation).slice(-2);
  const previousAssistant = recent.findLast?.((turn) => turn?.role === 'assistant') || null;
  const currentUser = recent.findLast?.((turn) => turn?.role !== 'assistant') || null;
  if (!previousAssistant || !currentUser) return null;
  const expected = clarificationForField(field).toLowerCase();
  const structuredField = text(previousAssistant?.clarification?.field_key, 120);
  if (structuredField ? structuredField !== field?.key : text(previousAssistant?.content, 500).toLowerCase() !== expected) return null;
  const candidate = text(currentUser?.content, 240);
  if (!candidate || candidate.length > 120 || /[?.!]/.test(candidate)) return null;
  if (symbolicReferenceForField(field, candidate) === 'device_location') {
    const resolved = validDeviceLocation(deviceLocation);
    return resolved ? { kind: 'device_location', ...resolved } : { kind: 'device_location_unavailable' };
  }
  return { kind: 'text', value: candidate };
}

export function resolvePreSemanticReadIntent({ message, immediateConversation = [], deviceLocation = null } = {}) {
  const query = text(message, 12000);
  if (!query) return null;
  const fastReads = listOperatorFastReads();
  const recent = list(immediateConversation).slice(-2);
  const previousAssistant = recent.findLast?.((turn) => turn?.role === 'assistant') || null;
  const inheritedCapabilityKey = text(previousAssistant?.clarification?.capability_key, 300);
  const inheritedFieldKey = text(previousAssistant?.clarification?.field_key, 120);
  const inheritedCapability = previousAssistant?.clarification?.required === true && inheritedCapabilityKey
    ? fastReads.find((item) => item.key === inheritedCapabilityKey) || null
    : null;

  let capability = inheritedCapability;
  if (!capability) {
    const resolution = resolveOperatorCapabilityMatch({
      message: query,
      capabilities: fastReads,
      modes: ['read'],
      limit: 5,
    });
    if (!strongMatch(resolution)) return null;
    capability = resolution.top.capability;
  }
  const requiredStrings = requiredStringFields(capability);
  const slotValues = {};
  const satisfied = new Set();
  let deviceLocationUnavailable = false;
  for (const field of requiredStrings) {
    const inherited = immediateSlotValue({ immediateConversation, field, deviceLocation });
    if (!inherited) continue;
    if (inherited.kind === 'device_location') {
      slotValues.latitude = inherited.latitude;
      slotValues.longitude = inherited.longitude;
      slotValues.location_label = 'Current location';
      if (inherited.accuracy_m !== null) slotValues.location_accuracy_m = inherited.accuracy_m;
      satisfied.add(field.key);
    } else if (inherited.kind === 'device_location_unavailable') {
      deviceLocationUnavailable = true;
    } else if (inherited.kind === 'text') {
      slotValues[field.key] = inherited.value;
      satisfied.add(field.key);
    }
  }
  if (deviceLocationUnavailable) {
    return {
      capability_key: capability.key, capability_payload: {}, route: 'conversation',
      evidence_scope: capability.external_evidence === true ? 'external' : 'internal',
      reasoning_depth: 'fast', conversation_mode: 'light', context_depth: 'compact', response_detail: 'brief',
      continuity_required: false, correction_or_revision: false, execution_domain: 'none',
      ambiguity_level: 'material', clarification_required: true,
      clarification_question: 'I could not access your device location. Which city or area should I use?',
      clarification_field: 'location', client_location_requested: true,
      candidate_interpretations: [], user_goal: query, action_shape: 'none', goal_relation: 'continue',
      artifact_intent: 'none', artifact_type: null, requires_mutation: false, needs_current_evidence: true,
      presemantic_read_match: true, context_required: false, authorization_effect: 'NONE',
    };
  }
  const missing = requiredStrings.find((field) => !satisfied.has(field.key));
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
      clarification_field: missing.key,
      accepts_device_location: missing.key === 'location',
      candidate_interpretations: [],
      user_goal: query,
      action_shape: 'none',
      goal_relation: inheritedCapability ? 'continue' : 'new',
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
    goal_relation: inheritedCapability ? 'continue' : 'new',
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
