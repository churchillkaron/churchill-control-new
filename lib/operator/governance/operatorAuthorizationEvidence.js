const EVIDENCE_KEY = "__avantiqoOperatorAuthorizationEvidence";
const AUTHORIZATION_MODES = new Set([
  "read",
  "auto_execute",
  "user_confirmed",
  "approval_resumed",
  "mission_governed",
  "unresolved",
]);

function text(value) {
  return String(value ?? "").trim();
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function normalizedMode(value) {
  const mode = text(value).toLowerCase();
  return AUTHORIZATION_MODES.has(mode) ? mode : null;
}

export function stampOperatorAuthorizationEvidence(payload, evidence = {}) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return payload;
  }

  const candidate = object(evidence);
  const mode = normalizedMode(
    candidate.mode || candidate.authorization_mode,
  );
  const originMode = normalizedMode(
    candidate.origin_mode || candidate.authorization_origin_mode,
  );

  if (!mode && !originMode) return payload;

  const trustedEvidence = Object.freeze({
    mode: mode || originMode || "unresolved",
    origin_mode:
      originMode ||
      (mode === "approval_resumed" ? "unresolved" : mode) ||
      "unresolved",
    conversationally_confirmed:
      (originMode || mode) === "user_confirmed",
    approval_resumed:
      candidate.approval_resumed === true || mode === "approval_resumed",
  });

  try {
    Object.defineProperty(payload, EVIDENCE_KEY, {
      value: trustedEvidence,
      enumerable: false,
      configurable: true,
      writable: false,
    });
  } catch {
    return payload;
  }

  return payload;
}

export function readOperatorAuthorizationEvidence(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return null;
  }
  if (!Object.prototype.hasOwnProperty.call(payload, EVIDENCE_KEY)) {
    return null;
  }
  // JSON, HTTP, LLM, and ordinary object-spread payloads create enumerable
  // properties. Only the server runtime may create this trusted non-enumerable
  // evidence marker.
  if (Object.prototype.propertyIsEnumerable.call(payload, EVIDENCE_KEY)) {
    return null;
  }

  const candidate = object(payload[EVIDENCE_KEY]);
  const mode = normalizedMode(candidate.mode);
  const originMode = normalizedMode(candidate.origin_mode);
  if (!mode && !originMode) return null;

  return {
    mode: mode || originMode || "unresolved",
    origin_mode:
      originMode ||
      (mode === "approval_resumed" ? "unresolved" : mode) ||
      "unresolved",
    conversationally_confirmed:
      (originMode || mode) === "user_confirmed",
    approval_resumed:
      candidate.approval_resumed === true || mode === "approval_resumed",
  };
}

export function sanitizedOperatorAuditPayload(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return payload;
  }

  const sanitized = { ...payload };
  delete sanitized[EVIDENCE_KEY];
  return sanitized;
}

export const OPERATOR_AUTHORIZATION_EVIDENCE_KEY = EVIDENCE_KEY;
