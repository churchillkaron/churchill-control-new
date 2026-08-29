const PRODUCT_ENGINEERING_CYCLE_KEY =
  "platform.product_engineering_cycle.execute";

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

const OWNED_PRODUCT_PATTERN =
  /\b(avantiqo|churchill[-\s]?control(?:[-\s]?new)?|churchillkaron\/churchill-control-new|app\.churchillkaron\.com)\b/i;
const TECHNICAL_SURFACE_PATTERN =
  /\b(github|repo|repository|source|source code|codebase|code|frontend|component|react|next\.?js|ui|ux|interface|screen|page|workspace|dashboard|chat|composer|message list|scroll|scrolling|scrollbar|layout|responsive|css|style|button|input|textarea|polling|setinterval|useeffect|render|browser)\b/i;
const DEFECT_OR_ACTION_PATTERN =
  /\b(fix|repair|solve|solved|change|update|improve|inspect|investigate|check|debug|diagnose|problem|issue|bug|broken|wrong|failing|fail|not working|doesn t work|does not work|not practical|jump|jumping|moves|moving|scroll|scrolling|stuck|flicker|flickering|needs? to be (?:fixed|solved|changed)|need this (?:fixed|solved)|make (?:it|this) work)\b/i;
const LOCAL_SURFACE_REFERENCE_PATTERN =
  /\b(this|the|our)\s+(?:app|page|screen|workspace|dashboard|chat|interface|ui|layout|composer)\b/i;

export function isAvantiqoSelfEngineeringTopic({
  message,
  conversation = [],
  pathname = null,
} = {}) {
  const current = normalized(message);
  const recent = normalized(conversationText(conversation));
  const combined = `${current}\n${recent}`.trim();
  if (!combined) return false;

  const ownedProduct = OWNED_PRODUCT_PATTERN.test(combined);
  const technicalSurface = TECHNICAL_SURFACE_PATTERN.test(combined);
  const localSurface =
    LOCAL_SURFACE_REFERENCE_PATTERN.test(current) &&
    /^\/workspace(?:\/|$)/i.test(text(pathname, 500));

  return technicalSurface && (ownedProduct || localSurface);
}

export function isAvantiqoSelfEngineeringRequest(options = {}) {
  const current = normalized(options.message);
  if (!current || !DEFECT_OR_ACTION_PATTERN.test(current)) return false;
  return isAvantiqoSelfEngineeringTopic(options);
}

function boundedEngineeringContext({ message, conversation = [] } = {}) {
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
  return [...recent, current ? `Operator current request: ${current}` : null]
    .filter(Boolean)
    .join("\n")
    .slice(-5200);
}

export function buildAvantiqoSelfEngineeringMessage(options = {}) {
  const context = boundedEngineeringContext(options);
  return [
    `Execute the registered ${PRODUCT_ENGINEERING_CYCLE_KEY} capability for this Avantiqo-owned product/source defect.`,
    "Inspect actual current GitHub main yourself through the registered Product Engineering and Code AI lane; do not ask the operator to paste file paths, code snippets, framework details, repository links, scroll-container code, polling code, or diagnosis that Avantiqo can obtain from its own source.",
    "Treat the conversation below only as symptom and prioritization context. Reassess current main, select the bounded repository-grounded objective, implement it through Code AI, and verify the result under the capability's normal governance. Do not claim completion without observed verification.",
    context ? `Reported context:\n${context}` : "",
  ]
    .filter(Boolean)
    .join("\n\n")
    .slice(0, 7800);
}

export const OPERATOR_SELF_ENGINEERING_CAPABILITY_KEY =
  PRODUCT_ENGINEERING_CYCLE_KEY;
