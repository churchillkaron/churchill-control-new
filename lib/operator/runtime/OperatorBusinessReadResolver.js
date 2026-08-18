function text(value) {
  return String(value ?? "").trim();
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

function normalized(value) {
  return text(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s_-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const BUSINESS_READ_TOPICS = Object.freeze([
  {
    id: "business_performance",
    patterns: [
      /\bhow are we doing\b/i,
      /\bhow is (?:the )?business doing\b/i,
      /\bperformance\b/i,
      /\bkpis?\b/i,
      /\bmetrics?\b/i,
      /\bdashboard\b/i,
      /\banalytics\b/i,
    ],
    hints: ["performance", "kpi", "metric", "analytics", "summary", "dashboard", "report", "trend"],
  },
  {
    id: "revenue",
    patterns: [
      /\brevenue\b/i,
      /\bturnover\b/i,
      /\btakings\b/i,
      /\bearnings\b/i,
      /\bsales\b/i,
      /\bhow much (?:did|do|have) we (?:make|made|earn|earned)\b/i,
      /\bwhat (?:did|do|have) we (?:make|made|earn|earned)\b/i,
    ],
    hints: ["revenue", "sales", "income", "turnover", "earnings", "ledger", "trial balance", "report", "orders", "invoices"],
  },
  {
    id: "profit",
    patterns: [
      /\bprofit\b/i,
      /\bmargin\b/i,
      /\bgross profit\b/i,
      /\bnet income\b/i,
      /\bwhat(?:'s| is) hurting (?:our )?profit\b/i,
    ],
    hints: ["profit", "margin", "income", "revenue", "cost", "expense", "ledger", "trial balance", "report"],
  },
  {
    id: "cash",
    patterns: [
      /\bcash\b/i,
      /\bliquidity\b/i,
      /\btreasury\b/i,
      /\bcash ?flow\b/i,
      /\bbank balance\b/i,
      /\bhow much money do we have\b/i,
    ],
    hints: ["cash", "bank", "balance", "liquidity", "treasury", "cashflow", "cash flow", "payment", "statement"],
  },
  {
    id: "receivables",
    patterns: [
      /\breceivables?\b/i,
      /\bcustomer invoices?\b/i,
      /\bcustomers? owe(?:s)? us\b/i,
      /\bmoney owed to us\b/i,
      /\boverdue customers?\b/i,
    ],
    hints: ["receivable", "customer", "invoice", "aging", "collection", "outstanding", "overdue", "statement"],
  },
  {
    id: "payables",
    patterns: [
      /\bpayables?\b/i,
      /\bvendor invoices?\b/i,
      /\bsupplier invoices?\b/i,
      /\bbills? due\b/i,
      /\bwhat do we owe\b/i,
    ],
    hints: ["payable", "vendor", "supplier", "invoice", "aging", "purchase", "payment", "outstanding", "due"],
  },
  {
    id: "costs",
    patterns: [
      /\bcosts?\b/i,
      /\bexpenses?\b/i,
      /\bspending\b/i,
      /\bspend\b/i,
      /\bburn rate\b/i,
    ],
    hints: ["cost", "expense", "spend", "purchase", "payable", "vendor", "budget", "ledger", "report"],
  },
  {
    id: "inventory",
    patterns: [
      /\binventory\b/i,
      /\bstock\b/i,
      /\bon hand\b/i,
      /\bwarehouse\b/i,
      /\bvaluation\b/i,
    ],
    hints: ["inventory", "stock", "warehouse", "on hand", "movement", "valuation", "availability", "item"],
  },
  {
    id: "payroll",
    patterns: [
      /\bpayroll\b/i,
      /\bsalar(?:y|ies)\b/i,
      /\bwages?\b/i,
      /\bcompensation\b/i,
      /\bpayslips?\b/i,
      /\bstaff cost\b/i,
      /\blabou?r cost\b/i,
    ],
    hints: ["payroll", "salary", "wage", "compensation", "payslip", "attendance", "staff", "employee", "cost"],
  },
  {
    id: "customers",
    patterns: [
      /\bcustomers?\b/i,
      /\bclients?\b/i,
      /\bleads?\b/i,
      /\bcrm\b/i,
    ],
    hints: ["customer", "client", "crm", "lead", "sales", "quote", "order", "communication"],
  },
  {
    id: "orders",
    patterns: [
      /\borders?\b/i,
      /\bbookings?\b/i,
      /\breservations?\b/i,
      /\btransactions?\b/i,
    ],
    hints: ["order", "booking", "reservation", "transaction", "sales", "customer", "fulfillment", "pos"],
  },
]);

function matchedTopics(message) {
  const source = text(message);
  return BUSINESS_READ_TOPICS.filter((topic) =>
    topic.patterns.some((pattern) => pattern.test(source)),
  );
}

function capabilityText(capability = {}) {
  const primary = normalized([
    capability.key,
    capability.domain,
    capability.capability,
    capability.action,
    capability.document,
  ].filter(Boolean).join(" "));

  const secondary = normalized([
    capability.description,
    capability.search_text,
    capability.group_name,
    ...list(capability.tags),
  ].filter(Boolean).join(" "));

  return { primary, secondary };
}

function hintScore(capability, hints) {
  const { primary, secondary } = capabilityText(capability);
  let score = 0;

  for (const hint of hints) {
    const needle = normalized(hint);
    if (!needle) continue;
    if (primary.includes(needle)) score += 8;
    if (secondary.includes(needle)) score += 3;
  }

  const action = normalized(capability.action);
  if (["read", "get", "list", "summary", "report", "inspect", "search"].includes(action)) {
    score += 2;
  }

  if (/\b(?:report|summary|balance|status|aging|analytics|ledger|statement)\b/.test(primary)) {
    score += 2;
  }

  return score;
}

export function resolveOperatorBusinessRead({ message, capabilities = [], limit = 6 } = {}) {
  const topics = matchedTopics(message);
  if (!topics.length) return null;

  const hints = Array.from(new Set(topics.flatMap((topic) => topic.hints)));
  const ranked = list(capabilities)
    .filter((capability) => normalized(capability.mode) === "read")
    .map((capability, index) => ({
      capability,
      index,
      score: hintScore(capability, hints),
    }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, Math.max(1, Math.min(Number(limit) || 6, 12)));

  if (!ranked.length) return null;

  const topScore = ranked[0].score;
  const confidence = Math.max(0.55, Math.min(0.99, 0.55 + topScore / 80));

  return {
    topic: topics[0].id,
    topics: topics.map((topic) => topic.id),
    confidence,
    hints,
    capability_keys: ranked
      .map((entry) => text(entry.capability?.key))
      .filter(Boolean),
    capabilities: ranked.map((entry) => entry.capability),
  };
}

export function prioritizeOperatorBusinessReads({
  message,
  capabilities = [],
  fallback = [],
  limit = 18,
} = {}) {
  const resolution = resolveOperatorBusinessRead({
    message,
    capabilities,
    limit: Math.min(8, Number(limit) || 18),
  });

  if (!resolution) {
    return {
      resolution: null,
      capabilities: list(fallback).slice(0, limit),
    };
  }

  const selected = [];
  const seen = new Set();

  for (const capability of [...resolution.capabilities, ...list(fallback)]) {
    const key = text(capability?.key);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    selected.push(capability);
    if (selected.length >= limit) break;
  }

  return {
    resolution: {
      topic: resolution.topic,
      topics: resolution.topics,
      confidence: resolution.confidence,
      capability_keys: resolution.capability_keys,
    },
    capabilities: selected,
  };
}

export default resolveOperatorBusinessRead;
