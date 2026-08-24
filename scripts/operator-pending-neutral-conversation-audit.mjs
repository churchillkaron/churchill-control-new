import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const corePath = "lib/operator/runtime/OperatorTurnRuntimeCore.js";
const fastPath = "lib/operator/runtime/OperatorFastConversationRuntime.js";
const [coreSource, fastSource] = await Promise.all([
  readFile(corePath, "utf8"),
  readFile(fastPath, "utf8"),
]);

function requireFragments(path, source, fragments) {
  for (const fragment of fragments) {
    assert.ok(source.includes(fragment), `${path} missing ${fragment}`);
  }
}

requireFragments(corePath, coreSource, [
  "const fastConversation = Boolean(",
  "if (fastConversation) {",
  "const exactPendingBinding = Boolean(",
  'offeredPending.resume_kind === "mission"',
  "missionResumeProjectionMatches(offeredPending, activeRun)",
  "operatorPendingExecutionMatchesAutonomousRun(",
  "const fastConversationAgreementState =",
  "hasStoredPendingExecution(agreementState) && !exactPendingBinding",
  "? clearedAgreementState(agreementState)",
  ": agreementState",
  "agreementState: fastConversationAgreementState",
]);

const pendingStart = coreSource.indexOf(
  "const pending = respondsToPending ? offeredPending : null;",
);
const fastStart = coreSource.indexOf("const fastConversation = Boolean(", pendingStart);
const fastReturn = coreSource.indexOf(
  "return runFastConversationTurn({",
  fastStart,
);
const supersedeStart = coreSource.indexOf(
  "const activeAgreementState = respondsToPending",
  fastStart,
);

assert.ok(pendingStart >= 0, "pending classification must exist");
assert.ok(fastStart > pendingStart, "fast conversation must be classified after pending response classification");
assert.ok(fastReturn > fastStart, "fast conversation must return directly");
assert.ok(
  supersedeStart > fastReturn,
  "neutral fast conversation must return before new-direction supersession",
);

const fastBlock = coreSource.slice(fastStart, supersedeStart);
assert.ok(
  fastBlock.includes("agreementState: fastConversationAgreementState"),
  "fast conversation must use its independently validated agreement state",
);
assert.ok(
  fastBlock.includes("\n      source,\n"),
  "the original operator channel must be forwarded into the conversation runtime",
);
assert.ok(
  !fastBlock.includes("clearPendingAndSupersedeRun("),
  "neutral fast conversation must not supersede valid pending work",
);
assert.ok(
  !fastBlock.includes("executeCapability("),
  "neutral fast conversation must not execute business capabilities",
);

const exactBindingBranch = `hasStoredPendingExecution(agreementState) && !exactPendingBinding\n        ? clearedAgreementState(agreementState)\n        : agreementState`;
assert.ok(
  coreSource.includes(exactBindingBranch),
  "malformed stored pending must be cleared while exact pending is preserved",
);

requireFragments(fastPath, fastSource, [
  "const TEXT_NEUTRAL_CONVERSATION_PATTERN =",
  'const channel = text(source).toLowerCase() || "text"',
  'if (channel !== "voice") {',
  "return TEXT_NEUTRAL_CONVERSATION_PATTERN.test(normalized(clean))",
  "if (PROJECT_CONTROL_PATTERN.test(clean)) return false",
  'source = "voice"',
  "const pendingContext = compactPendingContext(agreementState)",
  "do not treat discussion, questions, acknowledgements, or thanks as confirmation, cancellation, resumption, or execution authority",
  "without invoking business workflows or claiming any side effect",
  "channel,",
  'latency_class: voice ? "realtime" : "interactive"',
  "pending_action_context: Boolean(pendingContext)",
  "execution: null",
  "capability_key: null",
  "agreement_state: agreementState",
]);

const textPatternSource = fastSource.match(
  /const TEXT_NEUTRAL_CONVERSATION_PATTERN = (\/.*\/[a-z]*);/,
)?.[1];
assert.ok(textPatternSource, "text neutral conversation regex must be extractable");
const textNeutralPattern = Function(`return ${textPatternSource}`)();

function normalizeForTextGate(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9+\-*/.\u0e00-\u0e7f\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

for (const message of [
  "why?",
  "why not?",
  "tell me more",
  "what do you mean?",
  "what are the tradeoffs?",
  "what are the risks?",
  "is this safe?",
  "what exactly will you do?",
  "thanks",
  "got it",
  "varför?",
  "vad menar du?",
  "kan du förklara det?",
  "vilka är riskerna?",
  "låter bra",
  "warum?",
  "was meinst du?",
  "kannst du das erklären?",
  "welche Risiken gibt es?",
  "klingt gut",
  "pourquoi?",
  "tu veux dire quoi?",
  "peux-tu expliquer?",
  "quels sont les risques?",
  "ça a du sens",
  "¿por qué?",
  "¿qué quieres decir?",
  "¿puedes explicar eso?",
  "¿cuáles son los riesgos?",
  "suena bien",
  "ทำไม?",
  "หมายความว่าอะไร?",
  "อธิบายได้ไหม?",
  "มีความเสี่ยงอะไรบ้าง?",
  "ฟังดูดี",
]) {
  assert.equal(
    textNeutralPattern.test(normalizeForTextGate(message)),
    true,
    `neutral text follow-up must remain discussion-only: ${message}`,
  );
}

for (const message of [
  "continue",
  "go on",
  "do it",
  "yes",
  "cancel",
  "open finance",
  "create a report",
  "change the supplier",
  "what about changing the supplier",
  "should we use another supplier instead",
  "ja",
  "nej",
  "fortsätt",
  "gör det",
  "oui",
  "non",
  "continuez",
  "faites-le",
  "sí",
  "no",
  "continúa",
  "hazlo",
  "ใช่",
  "ไม่",
  "ยืนยัน",
  "ยกเลิก",
]) {
  assert.equal(
    textNeutralPattern.test(normalizeForTextGate(message)),
    false,
    `control or new-direction text must not be classified as neutral discussion: ${message}`,
  );
}

const pendingContextStart = fastSource.indexOf("function compactPendingContext(");
const pendingContextEnd = fastSource.indexOf(
  "function fastStrategicDiscussion(",
  pendingContextStart,
);
assert.ok(
  pendingContextStart >= 0 && pendingContextEnd > pendingContextStart,
  "bounded pending conversation context must exist",
);
const pendingContextSource = fastSource.slice(
  pendingContextStart,
  pendingContextEnd,
);
for (const allowedField of [
  "objective:",
  "status:",
  "current_step:",
  "pending_reason:",
  "original_request:",
]) {
  assert.ok(
    pendingContextSource.includes(allowedField),
    `pending conversation context missing ${allowedField}`,
  );
}
assert.ok(
  !pendingContextSource.includes("pending.payload"),
  "neutral discussion must not expose the stored execution payload to the conversation model",
);
assert.ok(
  !pendingContextSource.includes("pending.run_id"),
  "neutral discussion must not expose the pending run referent to the conversation model",
);
assert.ok(
  !pendingContextSource.includes("approval_request_id"),
  "neutral discussion must not expose approval identifiers to the conversation model",
);

const newDirectionSupersession = coreSource.indexOf(
  "clearPendingAndSupersedeRun(agreementState, Boolean(offeredPending))",
  fastReturn,
);
assert.ok(
  newDirectionSupersession > fastReturn,
  "non-fast new requests must still pass through pending supersession",
);

console.log("OPERATOR_PENDING_NEUTRAL_CONVERSATION_AUDIT=PASS");
console.log("OPERATOR_PENDING_NEUTRAL_CONVERSATION_VALID=EXACT_PENDING_PRESERVED");
console.log("OPERATOR_PENDING_NEUTRAL_CONVERSATION_MISSION=EXACT_MISSION_PRESERVED");
console.log("OPERATOR_PENDING_NEUTRAL_CONVERSATION_MALFORMED=STALE_PENDING_CLEARED_NO_EXECUTION");
console.log("OPERATOR_PENDING_NEUTRAL_CONVERSATION_TEXT=NEUTRAL_DISCUSSION_ONLY");
console.log("OPERATOR_PENDING_NEUTRAL_CONVERSATION_MULTILINGUAL=DISCUSSION_ONLY");
console.log("OPERATOR_PENDING_NEUTRAL_CONVERSATION_CONTROL=NOT_RECLASSIFIED");
console.log("OPERATOR_PENDING_NEUTRAL_CONVERSATION_CHANNEL=TEXT_VOICE_SOURCE_PRESERVED");
console.log("OPERATOR_PENDING_NEUTRAL_CONVERSATION_CONTEXT=BOUNDED_NO_EXECUTION_REFERENTS");
console.log("OPERATOR_PENDING_NEUTRAL_CONVERSATION_NEW_DIRECTION=SUPERSESSION_UNCHANGED");
console.log("OPERATOR_PENDING_NEUTRAL_CONVERSATION_EXECUTION=DISABLED");
