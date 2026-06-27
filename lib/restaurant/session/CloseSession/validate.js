export function validate(payload) {
  if (!payload.sessionId && !payload.session_id) {
    throw new Error("sessionId required");
  }
  return payload;
}
