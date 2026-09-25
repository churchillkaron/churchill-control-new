function text(value, limit = 4000) {
  return String(value ?? '').trim().slice(0, limit);
}

export function normalizeOperatorReferencePhrase(value) {
  return text(value, 240)
    .toLowerCase()
    .replace(/[’']/g, "'")
    .replace(/[^a-z0-9\s']/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function strippedCommandPrefix(value) {
  return value.replace(/^(?:please\s+)?(?:use|take|choose|select|pick)\s+/, '').trim();
}

export function resolveOperatorSymbolicReference({ fieldKey, value } = {}) {
  const field = text(fieldKey, 120).toLowerCase().replace(/_/g, ' ');
  const phrase = normalizeOperatorReferencePhrase(value);
  if (!field || !phrase) return null;
  const core = strippedCommandPrefix(phrase);

  if (field === 'location') {
    const possessive = /^(?:mine|my(?:\s+(?:one|location|current\s+location))?)$/.test(core);
    const deictic = /^(?:here|right\s+here|this(?:\s+location)?|current(?:\s+location)?)$/.test(core);
    const selfPosition = /^where\s+i(?:\s+am|'m(?:\s+at)?)(?:\s+now)?$/.test(core);
    if (possessive || deictic || selfPosition) return { kind: 'device_location' };
  }

  return null;
}

export function operatorReferenceNeedsDeviceLocation({ fieldKey, value } = {}) {
  return resolveOperatorSymbolicReference({ fieldKey, value })?.kind === 'device_location';
}


export function operatorUtteranceDependsOnImmediateContext(value) {
  const phrase = normalizeOperatorReferencePhrase(value);
  if (!phrase) return false;

  // Structural discourse references only. This never decides business meaning or
  // authority; it only prevents a clearly referential utterance from being
  // certified as context-free when an immediate exchange exists.
  const demonstrativeReference = /\b(?:this|that|these|those)\b/.test(phrase);
  const objectReference = /\b(?:it|them|one|ones)\b/.test(phrase);
  const comparativeReference = /\b(?:same|former|latter|previous|earlier|above|again)\b/.test(phrase);
  const ordinalReference = /\b(?:first|second|third|fourth)\s+(?:one|option|choice|version|idea|example|result|item)\b/.test(phrase);

  return demonstrativeReference || objectReference || comparativeReference || ordinalReference;
}
export function operatorUtteranceRequiresPriorContext(value) {
  const phrase = normalizeOperatorReferencePhrase(value);
  if (!phrase) return false;

  const words = phrase.split(/\s+/).filter(Boolean);
  const explicitHistoryReference = /\b(?:previous|earlier|above|former|latter|again)\b/.test(phrase);
  const ordinalReference = /\b(?:first|second|third|fourth)\s+(?:one|option|choice|version|idea|example|result|item)\b/.test(phrase);
  const shortEllipticalReference =
    words.length <= 12 &&
    /\b(?:this|that|these|those|it|them|one|ones|same)\b/.test(phrase);

  return explicitHistoryReference || ordinalReference || shortEllipticalReference;
}
export function operatorUtteranceExplicitlyNamesProductSurface(value) {
  const phrase = normalizeOperatorReferencePhrase(value);
  if (!phrase) return false;
  return /\bavantiqo\b|\bbusiness partner\b|\b(?:image|music|video|code) studio\b/.test(phrase);
}

export function operatorUtteranceExplicitlyRequestsProductChange(value) {
  const phrase = normalizeOperatorReferencePhrase(value);
  if (!phrase) return false;
  if (/^(?:how|what|why|when|where|can i|could i|should i|would i)\b/.test(phrase)) return false;
  const changeVerb = /\b(?:change|fix|update|modify|edit|patch|refactor|implement|build|deploy|release|merge|commit|push)\b/.test(phrase);
  const productObject = /\b(?:code|source|repository|repo|branch|pull request|pr|deployment|build|runtime|api|component|page|platform|system)\b/.test(phrase);
  return changeVerb && productObject;
}

