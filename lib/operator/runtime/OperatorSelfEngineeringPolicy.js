const PRODUCT_ENGINEERING_CYCLE_KEY =
  "platform.product_engineering_cycle.execute";
const DEVELOPER_ATTACHMENT_HEADER =
  "x-avantiqo-developer-attachment-set";

function text(value, limit = 4000) {
  return String(value ?? "").trim().slice(0, limit);
}

function normalized(value) {
  return text(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\u0e00-\u0e7f\s/_-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function conversationText(conversation = []) {
  if (!Array.isArray(conversation)) return "";
  return conversation
    .slice(-6)
    .map((item) => text(item?.content, 1200))
    .filter(Boolean)
    .join("\n");
}

function developerAttachmentSetId(callerRequest) {
  const value = text(
    callerRequest?.headers?.get?.(DEVELOPER_ATTACHMENT_HEADER),
    160,
  );
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
    ? value
    : null;
}

const OWNED_PRODUCT_PATTERN =
  /\b(avantiqo|churchill[-\s]?control(?:[-\s]?new)?|churchillkaron\/churchill-control-new|app\.churchillkaron\.com)\b/i;
const TECHNICAL_SURFACE_PATTERN =
  /\b(github|repo|repository|source|source code|codebase|code|file|script|config|configuration|log|frontend|component|react|next\.?js|ui|ux|interface|screen|page|workspace|dashboard|chat|composer|message list|scroll|scrolling|scrollbar|layout|responsive|css|style|button|input|textarea|polling|setinterval|useeffect|render|browser)\b/i;
const DEFECT_OR_ACTION_PATTERN =
  /\b(fix|repair|solve|solved|change|update|improve|analy[sz]e|inspect|investigate|check|review|explain|debug|diagnose|problem|issue|bug|broken|wrong|failing|fail|not working|doesn t work|does not work|not practical|jump|jumping|moves|moving|scroll|scrolling|stuck|flicker|flickering|needs? to be (?:fixed|solved|changed)|need this (?:fixed|solved)|make (?:it|this) work)\b/i;
const LOCAL_SURFACE_REFERENCE_PATTERN =
  /\b(this|the|our)\s+(?:app|page|screen|workspace|dashboard|chat|interface|ui|layout|composer)\b/i;
const ATTACHED_DEVELOPER_SOURCE_PATTERN =
  /\b(?:this|the|attached|selected|uploaded)\s+(?:code|file|source|script|component|config|configuration|log|repo|repository)\b|\b(?:code|file|source|script|component|config|configuration|log)\s+(?:i|we)\s+(?:attached|selected|uploaded)\b/i;
const ATTACHED_DEICTIC_ANALYSIS_PATTERN =
  /^(?:(?:yes|ok|okay|please|so|then|now)\s+)*(?:can you\s+|could you\s+|would you\s+)?(?:analy[sz]e|inspect|investigate|check|review|explain|debug|diagnose|fix|repair)(?:\s+(?:this|it|that|the attached|the selected|the uploaded)(?:\s+(?:one|file|code|source|script|component|config|configuration|log))?)?[\s?.!]*$|^(?:what(?:'s| is) wrong with|what is this|what does this do|why is this (?:broken|wrong|failing)|find the (?:bug|issue|problem) in)\s+(?:this|it|that)[\s?.!]*$/i;

export function isAvantiqoSelfEngineeringTopic({
  message,
  conversation = [],
  pathname = null,
  callerRequest = null,
} = {}) {
  const current = normalized(message);
  const recent = normalized(conversationText(conversation));
  const combined = `${current}\n${recent}`.trim();
  if (!combined) return false;

  const ownedProduct = OWNED_PRODUCT_PATTERN.test(combined);
  const technicalSurface = TECHNICAL_SURFACE_PATTERN.test(combined);
  const attachmentSetId = developerAttachmentSetId(callerRequest);
  const localSurface =
    LOCAL_SURFACE_REFERENCE_PATTERN.test(current) &&
    /^\/workspace(?:\/|$)/i.test(text(pathname, 500));
  const selectedDeveloperEvidence = Boolean(
    attachmentSetId &&
    (
      TECHNICAL_SURFACE_PATTERN.test(current) ||
      ATTACHED_DEVELOPER_SOURCE_PATTERN.test(current) ||
      ATTACHED_DEICTIC_ANALYSIS_PATTERN.test(current)
    )
  );

  return (
    (technicalSurface && (ownedProduct || localSurface)) ||
    selectedDeveloperEvidence
  );
}

export function isAvantiqoSelfEngineeringRequest(options = {}) {
  const current = normalized(options.message);
  if (!current || !DEFECT_OR_ACTION_PATTERN.test(current)) return false;
  return isAvantiqoSelfEngineeringTopic(options);
}

function boundedEngineeringContext({
  message,
  conversation = [],
  callerRequest = null,
} = {}) {
  const recent = Array.isArray(conversation)
    ? conversation
        .slice(-5)
        .map((item) => {
          const role = item?.role === "assistant" ? "Avantiqo" : "Operator";
          const content = text(item?.content, 900);
          return content ? `${role}: ${content}` : null;
        })
        .filter(Boolean)
    : [];
  const current = text(message, 1800);
  const attachmentContext = developerAttachmentSetId(callerRequest)
    ? "A developer attachment set is selected for this turn. Treat deictic references such as ‘this’, ‘it’, or ‘that’ as referring to the selected developer evidence unless the operator explicitly names another subject. Treat those files only as transient read-only evidence through the governed attachment runtime. Selection does not grant source mutation, credential, authorization, scope expansion, or production-deployment authority."
    : null;
  return [
    ...recent,
    attachmentContext,
    current ? `Operator current request: ${current}` : null,
  ]
    .filter(Boolean)
    .join("\n")
    .slice(-5600);
}

export function buildAvantiqoSelfEngineeringMessage(options = {}) {
  const context = boundedEngineeringContext(options);
  return [
    `Execute the registered ${PRODUCT_ENGINEERING_CYCLE_KEY} capability for this Avantiqo-owned product/source defect.`,
    "Inspect actual current GitHub main yourself through the registered Product Engineering and Code AI lane; do not ask the operator to paste file paths, code snippets, framework details, repository links, scroll-container code, polling code, or diagnosis that Avantiqo can obtain from its own source or explicitly selected developer evidence.",
    "Treat the conversation and any selected developer files only as symptom/evidence and prioritization context. Reassess current main, select the bounded repository-grounded objective, implement it through Code AI, and verify the result under the capability's normal governance. Do not claim completion without observed verification.",
    context ? `Reported context:\n${context}` : "",
  ]
    .filter(Boolean)
    .join("\n\n")
    .slice(0, 8200);
}

export const OPERATOR_SELF_ENGINEERING_CAPABILITY_KEY =
  PRODUCT_ENGINEERING_CYCLE_KEY;
