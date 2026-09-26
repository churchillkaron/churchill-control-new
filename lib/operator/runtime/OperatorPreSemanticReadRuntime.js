import { listOperatorFastReads } from './OperatorFastReadIndex.js';
import { listOperatorFastActions } from './OperatorFastActionIndex.js';
import { resolveOperatorCapabilityMatch } from './OperatorCapabilityMatcher.js';
import { resolveOperatorSymbolicReference } from '../contracts/OperatorSymbolicReference.js';

function text(value, limit = 4000) {
  return String(value ?? '').trim().slice(0, limit);
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

function strongMatch(resolution) {
  const top = resolution?.top;
  if (!top?.capability) return false;
  const phraseAffinity = Number(top.phrase_affinity || 0);
  const primaryCoverage = Number(top.primary_coverage || 0);
  const separation = Number(resolution?.separation || 0);
  if (phraseAffinity >= 0.72) return true;
  if (phraseAffinity >= 0.5 && separation >= 0.05) return true;
  if (primaryCoverage >= 0.5 && separation >= 0.08) return true;
  if (primaryCoverage >= 0.4 && separation >= 0.1) return true;
  return phraseAffinity >= 0.4 && separation >= 0.2;
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


function cleanInlineLocation(value) {
  return text(value, 240)
    .replace(/^[\s,:-]+|[\s,:;.!?]+$/g, '')
    .replace(/\s+(?:today|tonight|now|tomorrow|this morning|this afternoon|this evening)$/i, '')
    .trim();
}

function inlineStringFieldValue({ message, field } = {}) {
  const strategy = text(field?.definition?.operator_input_extractor, 80).toLowerCase();
  const source = text(message, 1200);
  if (!strategy || !source) return null;

  if (strategy === 'location_phrase') {
    const symbolicTail = source.match(/\b(my(?:\s+(?:current\s+)?location)|current\s+location|here|right\s+here|where\s+i(?:\s+am|'m(?:\s+at)?)(?:\s+now)?)(?=[?.!,;]|$)/i);
    if (symbolicTail && resolveOperatorSymbolicReference({ fieldKey: field?.key, value: symbolicTail[1] })) {
      return { kind: 'symbolic', value: symbolicTail[1] };
    }
    const preposition = source.match(/\b(?:in|for|at|near)\s+(.+?)(?=\s+(?:today|tonight|now|tomorrow|this morning|this afternoon|this evening)\b|[?.!,;]|$)/i);
    let candidate = cleanInlineLocation(preposition?.[1]);
    if (!candidate) {
      const prefix = source.match(/^(.+?)\s+(?:weather|forecast|temperature)(?:\s+(?:today|tonight|now|tomorrow))?[?.!]*$/i);
      candidate = cleanInlineLocation(prefix?.[1]);
    }
    if (!candidate) return null;
    if (/^(?:how(?:'s| is)?|what(?:'s| is)?|where(?:'s| is)?|is|are|the|weather|forecast|temperature)(?:\s+the)?$/i.test(candidate)) return null;
    if (resolveOperatorSymbolicReference({ fieldKey: field?.key, value: candidate })) {
      return { kind: 'symbolic', value: candidate };
    }
    return { kind: 'text', value: candidate };
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
  if (resolveOperatorSymbolicReference({ fieldKey: field?.key, value: candidate })?.kind === 'device_location') {
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
    const writeResolution = resolveOperatorCapabilityMatch({
      message: query,
      capabilities: listOperatorFastActions(),
      modes: ['write'],
      limit: 5,
    });
    const readScore = Number(resolution?.top?.score || 0);
    const writeScore = Number(writeResolution?.top?.score || 0);
    const writeCoverage = Number(writeResolution?.top?.primary_coverage || 0);
    if (writeScore >= 0.5 && writeCoverage >= 0.6 && writeScore >= readScore) return null;
    if (!strongMatch(resolution)) return null;
    capability = resolution.top.capability;
  }
  const requiredStrings = requiredStringFields(capability);
  const slotValues = {};
  const satisfied = new Set();
  let deviceLocationUnavailable = false;
  let deviceLocationRequested = false;
  for (const field of requiredStrings) {
    const inline = inheritedCapability ? null : inlineStringFieldValue({ message: query, field });
    if (inline?.kind === 'text') {
      slotValues[field.key] = inline.value;
      satisfied.add(field.key);
      continue;
    }
    if (inline?.kind === 'symbolic') {
      const resolved = validDeviceLocation(deviceLocation);
      if (resolved) {
        slotValues.latitude = resolved.latitude;
        slotValues.longitude = resolved.longitude;
        slotValues.location_label = 'Current location';
        if (resolved.accuracy_m !== null) slotValues.location_accuracy_m = resolved.accuracy_m;
        satisfied.add(field.key);
        continue;
      }
      const locationStatus = text(deviceLocation?.status, 40).toLowerCase();
      if (['denied', 'unavailable'].includes(locationStatus)) deviceLocationUnavailable = true;
      else deviceLocationRequested = true;
      continue;
    }
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
  if (deviceLocationRequested) {
    return {
      capability_key: capability.key, capability_payload: {}, route: 'conversation',
      evidence_scope: capability.external_evidence === true ? 'external' : 'internal',
      reasoning_depth: 'fast', conversation_mode: 'light', context_depth: 'compact', response_detail: 'brief',
      continuity_required: false, correction_or_revision: false, execution_domain: 'none',
      ambiguity_level: 'material', clarification_required: true,
      clarification_question: 'I need your device location to answer that.',
      clarification_field: 'location', accepts_device_location: true, client_location_requested: true,
      candidate_interpretations: [], user_goal: query, action_shape: 'none', goal_relation: inheritedCapability ? 'continue' : 'new',
      artifact_intent: 'none', artifact_type: null, requires_mutation: false, needs_current_evidence: true,
      presemantic_read_match: true, context_required: false, authorization_effect: 'NONE',
    };
  }
  if (deviceLocationUnavailable) {
    return {
      capability_key: capability.key, capability_payload: {}, route: 'conversation',
      evidence_scope: capability.external_evidence === true ? 'external' : 'internal',
      reasoning_depth: 'fast', conversation_mode: 'light', context_depth: 'compact', response_detail: 'brief',
      continuity_required: false, correction_or_revision: false, execution_domain: 'none',
      ambiguity_level: 'material', clarification_required: true,
      clarification_question: 'I could not access your device location. Which city or area should I use?',
      clarification_field: 'location', accepts_device_location: true, client_location_requested: false,
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
