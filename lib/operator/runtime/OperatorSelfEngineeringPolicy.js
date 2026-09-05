const PRODUCT_ENGINEERING_CYCLE_KEY =
  "platform.product_engineering_cycle.execute";
const PRODUCT_ENGINEERING_PORTFOLIO_KEY =
  "platform.product_engineering_portfolio.execute";
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
  /\b(fix|repair|solve|solved|change|update|improve|implement|build|create|add|refactor|test|continue|resume|finish|complete|make|upgrade|redesign|analy[sz]e|inspect|investigate|check|review|explain|debug|diagnose|problem|issue|bug|broken|wrong|failing|fail|not working|doesn t work|does not work|not practical|jump|jumping|moves|moving|scroll|scrolling|stuck|flicker|flickering|world class|worldclass|best in class|end to end|needs? to be (?:fixed|solved|changed)|need this (?:fixed|solved)|make (?:it|this) work)\b/i;
const LOCAL_SURFACE_REFERENCE_PATTERN =
  /\b(this|the|our)\s+(?:app|page|screen|workspace|dashboard|chat|interface|ui|layout|composer)\b/i;
const EXPLICIT_CODE_EXECUTION_PATTERN =
  /\b(?:use|run|start|enter|go into|work in|work on|switch to|continue|resume)\s+(?:the\s+)?(?:avantiqo\s+)?code\b|\b(?:fix|repair|debug|implement|build|change|update|improve|refactor|test|continue|resume)\b.{0,80}\b(?:code|repo|repository|github)\b|\b(?:code|repo|repository|github)\b.{0,80}\b(?:fix|repair|debug|implement|build|change|update|improve|refactor|test|continue|resume)\b/i;
const ATTACHED_DEVELOPER_SOURCE_PATTERN =
  /\b(?:this|the|attached|selected|uploaded)\s+(?:code|file|source|script|component|config|configuration|log|repo|repository)\b|\b(?:code|file|source|script|component|config|configuration|log)\s+(?:i|we)\s+(?:attached|selected|uploaded)\b/i;
const ATTACHED_DEICTIC_ANALYSIS_PATTERN =
  /^(?:(?:yes|ok|okay|please|so|then|now)\s+)*(?:can you\s+|could you\s+|would you\s+)?(?:analy[sz]e|inspect|investigate|check|review|explain|debug|diagnose|fix|repair)(?:\s+(?:this|it|that|the attached|the selected|the uploaded)(?:\s+(?:one|file|code|source|script|component|config|configuration|log))?)?[\s?.!]*$|^(?:what(?:'s| is) wrong with|what is this|what does this do|why is this (?:broken|wrong|failing)|find the (?:bug|issue|problem) in)\s+(?:this|it|that)[\s?.!]*$/i;
const PORTFOLIO_BROAD_SCOPE_PATTERN =
  /\b(world class|worldclass|best in class|end to end|whole|entire|across the|across all|all of|complete the|finish the|full domain|entire domain|whole domain|whole area|entire area|business level roadmap|engineering roadmap)\b/i;
const PORTFOLIO_PRODUCT_AREA_PATTERN =
  /\b(finance|accounting|tax|operations|pest control|pestcontrol|hotel|hotels|commercial|sales|crm|supply chain|projects|people|documents|analytics|compliance|creative|video studio|music studio|code studio|business partner|intelligence|learning|administration|platform)\b/i;
const PORTFOLIO_EXPLICIT_PATTERN =
  /\b(?:run|start|continue|resume|build|create)\b.{0,80}\b(?:business level|engineering|product)\s+roadmap\b|\bportfolio\b.{0,80}\b(?:engineering|code|product)\b/i;

function broadPortfolioContext(options = {}) {
  const current = normalized(options.message);
  const recent = normalized(conversationText(options.conversation));
  const projectObjective = normalized(options?.projectState?.objective);
  return `${current}\n${recent}\n${projectObjective}`.trim();
}

export function isAvantiqoEngineeringPortfolioRequest(options = {}) {
  const current = normalized(options.message);
  const combined = broadPortfolioContext(options);
  if (!current || !combined) return false;

  if (PORTFOLIO_EXPLICIT_PATTERN.test(combined)) return true;
  const broad = PORTFOLIO_BROAD_SCOPE_PATTERN.test(combined);
  const productArea = PORTFOLIO_PRODUCT_AREA_PATTERN.test(combined);
  const owned = OWNED_PRODUCT_PATTERN.test(combined);
  const workspaceSurface = /^\/workspace(?:\/|$)/i.test(
    text(options.pathname, 500),
  );
  const continuation = /^(?:next|continue|resume|keep going|go on)$/i.test(current);

  return Boolean(
    broad &&
    productArea &&
    (owned || workspaceSurface || continuation)
  );
}

export function isAvantiqoSelfEngineeringTopic({
  message,
  conversation = [],
  pathname = null,
  callerRequest = null,
  projectState = {},
} = {}) {
  const current = normalized(message);
  const recent = normalized(conversationText(conversation));
  const combined = `${current}\n${recent}`.trim();
  if (!combined) return false;

  const ownedProduct = OWNED_PRODUCT_PATTERN.test(combined);
  const technicalSurface = TECHNICAL_SURFACE_PATTERN.test(combined);
  const attachmentSetId = developerAttachmentSetId(callerRequest);
  const workspaceSurface = /^\/workspace(?:\/|$)/i.test(text(pathname, 500));
  const localSurface =
    LOCAL_SURFACE_REFERENCE_PATTERN.test(current) &&
    workspaceSurface;
  const explicitCodeExecution =
    workspaceSurface &&
    EXPLICIT_CODE_EXECUTION_PATTERN.test(current);
  const selectedDeveloperEvidence = Boolean(
    attachmentSetId &&
    (
      TECHNICAL_SURFACE_PATTERN.test(current) ||
      ATTACHED_DEVELOPER_SOURCE_PATTERN.test(current) ||
      ATTACHED_DEICTIC_ANALYSIS_PATTERN.test(current)
    )
  );
  const broadPortfolio = isAvantiqoEngineeringPortfolioRequest({
    message,
    conversation,
    pathname,
    projectState,
  });

  return (
    broadPortfolio ||
    (technicalSurface && (ownedProduct || localSurface)) ||
    explicitCodeExecution ||
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

export function resolveAvantiqoSelfEngineeringCapabilityKey(options = {}) {
  return isAvantiqoEngineeringPortfolioRequest(options)
    ? PRODUCT_ENGINEERING_PORTFOLIO_KEY
    : PRODUCT_ENGINEERING_CYCLE_KEY;
}

export function buildAvantiqoSelfEngineeringMessage(options = {}) {
  const context = boundedEngineeringContext(options);
  const portfolio = isAvantiqoEngineeringPortfolioRequest(options);
  const capabilityKey = portfolio
    ? PRODUCT_ENGINEERING_PORTFOLIO_KEY
    : PRODUCT_ENGINEERING_CYCLE_KEY;

  if (portfolio) {
    return [
      `Execute the registered ${capabilityKey} capability for this broad Avantiqo-owned business/product engineering goal.`,
      "Set business_goal from the operator's broad outcome in the reported context. Do not collapse the request into one guessed source patch. Use the capability's current-main repository assessment to create the bounded multi-objective roadmap, derive dependencies, and start at most one local engineering cycle this invocation.",
      "Keep queued roadmap objectives provisional. Preserve the governed persistence boundary: no objective is retired until its exact persisted commit is independently verified on main. After verified persistence, reassess actual current main and re-rank the remaining roadmap before another objective can start. Never fan out hidden branches or parallel source-mutating Code agents.",
      "Keep Business Partner as the control plane. Code Studio is an optional evidence/inspection surface. No automatic commit, production deploy, database migration, publication, or governance bypass is authorized by this portfolio request.",
      context ? `Reported context:\n${context}` : "",
    ]
      .filter(Boolean)
      .join("\n\n")
      .slice(0, 9000);
  }

  return [
    `Execute the registered ${capabilityKey} capability for this Avantiqo-owned product/source defect.`,
    "Inspect actual current GitHub main yourself through the registered Product Engineering and Code AI lane; do not ask the operator to paste file paths, code snippets, framework details, repository links, scroll-container code, polling code, or diagnosis that Avantiqo can obtain from its own source or explicitly selected developer evidence.",
    "Treat the conversation and any selected developer files only as symptom/evidence and prioritization context. Reassess current main, select the bounded repository-grounded objective, implement it through Code AI, and verify the result under the capability's normal governance. Do not claim completion without observed verification.",
    "Keep the Business Partner conversation as the control plane. Do not require the operator to navigate to Code Studio to complete the mission; Code Studio is an optional inspection surface, while the governed Code capability performs the work and returns the verified outcome to the conversation.",
    context ? `Reported context:\n${context}` : "",
  ]
    .filter(Boolean)
    .join("\n\n")
    .slice(0, 8200);
}

export const OPERATOR_SELF_ENGINEERING_CAPABILITY_KEY =
  PRODUCT_ENGINEERING_CYCLE_KEY;
export const OPERATOR_SELF_ENGINEERING_PORTFOLIO_CAPABILITY_KEY =
  PRODUCT_ENGINEERING_PORTFOLIO_KEY;
