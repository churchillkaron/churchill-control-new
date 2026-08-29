function text(value) {
  return String(value ?? "").trim();
}

function normalized(value) {
  return text(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\u0e00-\u0e7f\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const GREETING_PATTERN = /^(?:hi|hello|hey)(?: there)?$/;
const DAYPART_GREETING_PATTERN = /^good (?:morning|afternoon|evening)$/;

export function resolveOperatorInstantGreeting({ message, source = "text" } = {}) {
  if ((normalized(source) || "text") === "voice") return null;
  const clean = normalized(message);
  if (!clean) return null;
  if (GREETING_PATTERN.test(clean) || DAYPART_GREETING_PATTERN.test(clean)) {
    return "Hi. I'm here and ready.";
  }
  return null;
}

export const OperatorInstantGreetingPolicy = Object.freeze({
  resolve: resolveOperatorInstantGreeting,
});
