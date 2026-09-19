import { createHash } from "node:crypto";

const CONTRACT = "AVANTIQO_INTELLIGENCE_CONTEXT_FINGERPRINT_V2";

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value).sort().map((key) => [key, stable(value[key])]),
    );
  }
  return value ?? null;
}

function encoded(value) {
  try { return JSON.stringify(stable(value)); } catch { return "null"; }
}

function fingerprint(value) {
  return createHash("sha256").update(encoded(value)).digest("hex").slice(0, 32);
}
export function intelligenceContextFingerprint({
  scope = {}, projectCheckpoint = {}, durableMemory = [], attachments = [], recentConversation = [], toolDescriptors = [],
} = {}) {
  const staticContext = { scope, project_checkpoint: projectCheckpoint, durable_memory: durableMemory, attachments };
  const volatileContext = { recent_conversation: recentConversation };
  const descriptorContext = { tools: toolDescriptors };
  const staticChars = encoded(staticContext).length;
  const volatileChars = encoded(volatileContext).length;
  const descriptorChars = encoded(descriptorContext).length;

  return {
    contract: CONTRACT,
    static_context_fingerprint: fingerprint(staticContext),
    tool_descriptor_fingerprint: fingerprint(descriptorContext),
    cacheable_static_chars: staticChars + descriptorChars,
    volatile_chars: volatileChars,
    cacheable: staticChars + descriptorChars > 0,
    raw_content_returned: false,
  };
}

export const IntelligenceContextFingerprintPolicy = Object.freeze({
  contract: CONTRACT,
  fingerprint: intelligenceContextFingerprint,
});
