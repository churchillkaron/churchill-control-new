function text(value) {
  return String(value ?? "").trim();
}

const GOVERNED_WRITE_VERB_PATTERN = /\b(?:send|publish|post|pay|refund|approve|reject|delete|remove|archive|close|reopen|lock|unlock|transfer|create|issue|submit|queue|schedule|book|cancel|update|change|edit|add|invite|terminate|reverse|void|apply|release|order)\b/i;
const BUSINESS_OBJECT_PATTERN = /\b(?:invoice|invoices|payment|payments|payroll|journal|journals|period|campaign|campaigns|message|messages|email|emails|supplier|suppliers|vendor|vendors|customer|customers|employee|employees|staff|booking|bookings|reservation|reservations|order|orders|purchase order|purchase orders|stock|inventory|transfer|refund|credit note|debit note|report|reports|asset|assets|user|users|role|roles|permission|permissions|contract|contracts|shift|shifts|schedule|schedules|price|prices|quotation|quotations|quote|quotes|bill|bills|tax|vat|bank|account|accounts)\b/i;
const HIGH_CONSEQUENCE_OBJECT_PATTERN = /\b(?:payment|payments|payroll|journal|journals|tax|vat|bank|transfer|refund|legal|contract|contracts|terminate|termination|delete|close period|lock period|reopen period|write off|credit note|debit note)\b/i;
const SYSTEM_REPAIR_PATTERN = /\b(?:fix|repair|resolve|correct|recover|restore)\b[\s\S]{0,120}\b(?:system|error|issue|problem|bug|deployment|integration|connection|sync|workflow|database|service|provider)\b/i;
const READ_VERB_PATTERN = /\b(?:check|review|inspect|look at|analyse|analyze|compare|verify|find|see|read|show|list|summarize|summarise)\b/i;
const ACTION_CONNECTOR_PATTERN = /\b(?:and|then|and then|after|after that|afterwards|if|if so|if needed|once)\b/i;
const PLANNING_ONLY_PATTERN = /\b(?:create|build|make|develop)\b[\s\S]{0,80}\b(?:plan|strategy|recommendation|recommendations|ideas|options)\b/i;

function actionVerbCount(message) {
  const matches = message.match(new RegExp(GOVERNED_WRITE_VERB_PATTERN.source, "gi"));
  return matches?.length || 0;
}

function isEvidenceFirstAction(message) {
  const readMatch = message.match(READ_VERB_PATTERN);
  if (!readMatch || readMatch.index === undefined) return false;

  const rest = message.slice(readMatch.index + readMatch[0].length);
  const connectorMatch = rest.match(ACTION_CONNECTOR_PATTERN);
  if (!connectorMatch || connectorMatch.index === undefined) return false;

  const afterConnector = rest.slice(
    connectorMatch.index + connectorMatch[0].length,
  );

  return (
    GOVERNED_WRITE_VERB_PATTERN.test(afterConnector) &&
    BUSINESS_OBJECT_PATTERN.test(message)
  );
}

export function routeOperatorCognition({ message, source = "text" } = {}) {
  const channel = text(source).toLowerCase();
  const clean = text(message).replace(/\s+/g, " ");

  if (channel !== "voice") {
    return {
      path: "standard",
      reason: "NON_VOICE",
    };
  }

  if (!clean) {
    return {
      path: "fast",
      reason: "EMPTY_OR_LIGHTWEIGHT",
    };
  }

  if (clean.length > 360) {
    return {
      path: "deep",
      reason: "LONG_COMPLEX_VOICE_TURN",
    };
  }

  if (SYSTEM_REPAIR_PATTERN.test(clean)) {
    return {
      path: "deep",
      reason: "SYSTEM_REPAIR",
    };
  }

  if (isEvidenceFirstAction(clean)) {
    return {
      path: "deep",
      reason: "EVIDENCE_FIRST_ACTION",
    };
  }

  if (PLANNING_ONLY_PATTERN.test(clean)) {
    return {
      path: "fast",
      reason: "STRATEGIC_PLANNING",
    };
  }

  if (
    GOVERNED_WRITE_VERB_PATTERN.test(clean) &&
    HIGH_CONSEQUENCE_OBJECT_PATTERN.test(clean)
  ) {
    return {
      path: "deep",
      reason: "HIGH_CONSEQUENCE_ACTION",
    };
  }

  if (
    GOVERNED_WRITE_VERB_PATTERN.test(clean) &&
    BUSINESS_OBJECT_PATTERN.test(clean)
  ) {
    return {
      path: "deep",
      reason: "GOVERNED_BUSINESS_ACTION",
    };
  }

  if (
    ACTION_CONNECTOR_PATTERN.test(clean) &&
    actionVerbCount(clean) >= 2
  ) {
    return {
      path: "deep",
      reason: "MULTI_STEP_ACTION",
    };
  }

  return {
    path: "fast",
    reason: "FAST_EXECUTIVE_TURN",
  };
}

export default routeOperatorCognition;
