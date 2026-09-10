const FRONTIER_RESEARCH_PATTERN = /\b(novel|invent|invention|breakthrough|unsolved|unknown approach|unknown solution|no known solution|no existing solution|no implementation|no existing implementation|not been done|never been done|nobody has|no one has|cannot find an implementation|can'?t find an implementation|failed approach|known approach failed|existing approach failed|fundamental limit|first[- ]principles|new architecture|new algorithm|adjacent fields?|adjacent science|adjacent engineering|form hypotheses?|falsifiable hypotheses?|design experiments?|test hypotheses?)\b/i;
const PUBLIC_CURRENT_FACT_PATTERN = /\b(weather|forecast|exchange rate|fx rate|currency rate|current price|latest price|opening hours|business hours|address|located|location|where is|where are|who is|who owns|when is|availability|available today|current version|latest version)\b/i;
const INTERNAL_RECORD_PATTERN = /\b(our|my|this (?:company|business|organization|organisation)|company|business)\b.{0,120}\b(invoice|invoices|bill|bills|payment|payments|document|documents|file|files|certificate|certificates|employee|employees|staff|project|projects|studio|shot|shots|production|task|tasks|booking|bookings|reservation|reservations|customer|customers|supplier|suppliers|inventory|stock|order|orders|finance|payroll|compliance|asset|assets)\b|\b(invoice|invoices|bill|bills|payment|payments|document|documents|file|files|certificate|certificates|employee|employees|staff|project|projects|studio|shot|shots|production|task|tasks|booking|bookings|reservation|reservations|customer|customers|supplier|suppliers|inventory|stock|order|orders|finance|payroll|compliance|asset|assets)\b.{0,120}\b(our|my|this (?:company|business|organization|organisation))\b/i;
const EXTERNAL_TOPIC_PATTERN = /\b(competitors?|competitive landscape|market research|market trends?|industry research|industry trends?|regulations?|legislation|laws?|legal requirements?|standards?|current events?|news|press coverage|public information|external evidence|external sources?|official documentation|official docs|official website|benchmarks?|benchmarking|compare these sources|reconcile these sources)\b/i;

function text(value, limit = 12000) {
  return String(value ?? "").trim().slice(0, limit);
}

export function externalResearchRequested(value) {
  const message = text(value).toLowerCase();
  if (!message) return false;
  if (/https?:\/\//.test(message)) return true;

  const explicitSearch = /\b(search|research|look\s*up|check|find|read|inspect)\b.{0,80}\b(web|internet|online|public sources?|official sources?|url|webpage|website)\b/.test(message) ||
    /\b(web|internet|online|url|webpage|website)\b.{0,80}\b(search|research|look\s*up|check|find|read|inspect)\b/.test(message);
  if (explicitSearch || FRONTIER_RESEARCH_PATTERN.test(message)) return true;
  if (EXTERNAL_TOPIC_PATTERN.test(message)) return true;
  if (INTERNAL_RECORD_PATTERN.test(message)) return false;
  return PUBLIC_CURRENT_FACT_PATTERN.test(message);
}

export default externalResearchRequested;
