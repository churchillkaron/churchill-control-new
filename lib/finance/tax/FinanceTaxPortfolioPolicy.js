function text(value) {
  return String(value ?? "").trim();
}

function upper(value) {
  return text(value).toUpperCase();
}

function isoDay(value) {
  return text(value).slice(0, 10) || null;
}

function dayDistance(from, to) {
  if (!from || !to) return null;
  const left = new Date(`${from}T00:00:00Z`).getTime();
  const right = new Date(`${to}T00:00:00Z`).getTime();
  if (!Number.isFinite(left) || !Number.isFinite(right)) return null;
  return Math.round((right - left) / 86400000);
}

function amendmentState(vatReturn) {
  const raw = vatReturn?.metadata?.tax_amendments;
  const history = Array.isArray(raw?.history) ? raw.history : [];
  return {
    active: raw?.active || null,
    filed_count: history.length,
  };
}

function settlementPriority(settlement) {
  const state = upper(settlement?.state);
  const map = {
    SETTLEMENT_SETUP_REQUIRED: [845, "Map VAT control accounts", "Tax settlement setup is missing."],
    LIABILITY_POSTING_REQUIRED: [835, "Post tax liability", "The filed return is not yet recognized in the VAT settlement control account."],
    PAYMENT_DUE: [825, "Pay tax authority", "VAT is filed and payable but no cash settlement has been recorded."],
    REFUND_DUE: [820, "Track authority refund", "VAT is filed with a refund due from the authority."],
    PART_PAID: [815, "Complete VAT payment", "A partial authority payment is recorded; a balance remains."],
    PART_REFUNDED: [810, "Complete VAT refund", "A partial authority refund is recorded; a balance remains."],
    PAID_AWAITING_BANK_MATCH: [785, "Match payment in Banking", "The VAT payment journal is posted but bank reconciliation evidence is incomplete."],
    REFUNDED_AWAITING_BANK_MATCH: [780, "Match refund in Banking", "The VAT refund journal is posted but bank reconciliation evidence is incomplete."],
  };
  if (settlement?.needs_attention) {
    return [870, "Repair settlement evidence", "A VAT settlement journal was reversed or invalidated and no longer clears the authority balance."];
  }
  return map[state] || null;
}

export function rankFinanceTaxPortfolioRow({ vatReturn, entity, settlement = null, today }) {
  const status = upper(vatReturn?.status || "DRAFT");
  const dueDate = isoDay(vatReturn?.filing_due_date);
  const daysToDue = dayDistance(today, dueDate);
  const amendment = amendmentState(vatReturn);
  const settlementRank = status === "SUBMITTED" ? settlementPriority(settlement) : null;

  let priority = 100;
  let lane = "COMPLETE";
  let nextAction = "Filed and controlled";
  let reason = "No current tax action is required.";

  if (status !== "SUBMITTED" && daysToDue !== null && daysToDue < 0) {
    priority = 1000 + Math.min(Math.abs(daysToDue), 365);
    lane = "OVERDUE";
    nextAction = status === "CALCULATED" ? "File overdue VAT return" : "Prepare overdue VAT return";
    reason = `Statutory filing deadline passed ${Math.abs(daysToDue)} day${Math.abs(daysToDue) === 1 ? "" : "s"} ago.`;
  } else if (status !== "SUBMITTED" && daysToDue !== null && daysToDue <= 3) {
    priority = 950 - Math.max(daysToDue, 0);
    lane = "DEADLINE";
    nextAction = status === "CALCULATED" ? "Complete filing" : "Finish VAT preparation";
    reason = daysToDue === 0 ? "VAT filing is due today." : `VAT filing is due in ${daysToDue} day${daysToDue === 1 ? "" : "s"}.`;
  } else if (amendment.active) {
    priority = 900;
    lane = "AMENDMENT";
    nextAction = upper(amendment.active.status) === "CALCULATED" ? "File amendment" : "Finish amendment evidence";
    reason = `${amendment.active.label || "VAT amendment"} is open and has not been filed.`;
  } else if (settlementRank) {
    [priority, nextAction, reason] = settlementRank;
    lane = "SETTLEMENT";
  } else if (status !== "SUBMITTED" && daysToDue !== null && daysToDue <= 14) {
    priority = 750 - Math.max(daysToDue, 0);
    lane = "UPCOMING";
    nextAction = status === "CALCULATED" ? "Review and file VAT" : "Prepare VAT return";
    reason = `VAT filing is due in ${daysToDue} days.`;
  } else if (status === "CALCULATED") {
    priority = 700;
    lane = "READY_TO_FILE";
    nextAction = "Review and file VAT";
    reason = "VAT has been calculated and is waiting for filing evidence.";
  } else if (status === "DRAFT") {
    priority = 620;
    lane = "PREPARE";
    nextAction = "Prepare VAT return";
    reason = dueDate ? `VAT filing is open for ${dueDate}.` : "VAT filing is open and needs a governed deadline.";
  } else if (status === "SUBMITTED" && settlement?.state === "CLEARED") {
    priority = 80;
    lane = "CLEARED";
    nextAction = "No action";
    reason = "Filed VAT, settlement journal, cash and bank evidence are cleared.";
  } else if (status === "SUBMITTED" && settlement?.state === "NO_BALANCE") {
    priority = 75;
    lane = "CLEARED";
    nextAction = "No action";
    reason = "Filed VAT has no payable/refund balance and its settlement control is recognized.";
  }

  return {
    id: vatReturn.id,
    entity_id: vatReturn.entity_id,
    entity_code: entity?.code || null,
    entity_name: entity?.legal_name || entity?.display_name || entity?.name || entity?.code || "Legal entity",
    jurisdiction_code: vatReturn.jurisdiction_code || null,
    period_start: vatReturn.period_start,
    period_end: vatReturn.period_end,
    filing_due_date: dueDate,
    status,
    submission_reference: vatReturn.submission_reference || null,
    submitted_at: vatReturn.submitted_at || null,
    currency_code: vatReturn.currency_code || settlement?.currency_code || "THB",
    tax_payable: Number(vatReturn.tax_payable || 0),
    tax_refund: Number(vatReturn.tax_refund || 0),
    days_to_due: daysToDue,
    amendment_active: amendment.active,
    amendment_count: amendment.filed_count,
    settlement_state: settlement?.state || (status === "SUBMITTED" ? "NOT_EVALUATED" : null),
    settlement_remaining: Number(settlement?.amount_remaining || 0),
    settlement_bank_complete: settlement?.bank_evidence_complete === true,
    lane,
    priority,
    next_action: nextAction,
    reason,
  };
}

export function summarizeFinanceTaxPortfolio(rows) {
  const values = Array.isArray(rows) ? rows : [];
  return {
    total: values.length,
    overdue: values.filter(row => row.lane === "OVERDUE").length,
    due_14_days: values.filter(row => row.status !== "SUBMITTED" && row.days_to_due !== null && row.days_to_due >= 0 && row.days_to_due <= 14).length,
    amendments_open: values.filter(row => row.lane === "AMENDMENT").length,
    settlement_attention: values.filter(row => row.lane === "SETTLEMENT").length,
    cleared: values.filter(row => row.lane === "CLEARED").length,
  };
}

function requestState(request) {
  if (!request) return "NONE";
  if (request.accepted_at || ["ACCEPTED", "CLOSED", "COMPLETE", "COMPLETED"].includes(upper(request.status))) return "ACCEPTED";
  if (request.submitted_at || ["SUBMITTED", "RESPONDED", "RECEIVED"].includes(upper(request.status))) return "CLIENT_RESPONDED";
  if (request.sent_at) return "WITH_CLIENT";
  return "DRAFT";
}

export function buildFinanceTaxDependencyPortfolioRows({ filingRows, guidanceByReturnId, envelopes = [], clientRequests = [], currentUserId = null }) {
  const filings = new Map((Array.isArray(filingRows) ? filingRows : []).map(row => [row.id, row]));
  const envelopeMap = new Map((Array.isArray(envelopes) ? envelopes : []).map(row => [`${row.vat_return_id}:${upper(row.dependency_code)}`, row]));
  const requestMap = new Map((Array.isArray(clientRequests) ? clientRequests : []).map(row => [row.id, row]));
  const rows = [];

  for (const [returnId, guidance] of guidanceByReturnId instanceof Map ? guidanceByReturnId.entries() : []) {
    const filing = filings.get(returnId);
    if (!filing || !guidance || guidance.state === "FILED") continue;
    for (const dependency of guidance.dependencies || []) {
      const envelope = envelopeMap.get(`${returnId}:${upper(dependency.code)}`) || null;
      const request = envelope?.client_request_id ? requestMap.get(envelope.client_request_id) || null : null;
      const ownedByMe = Boolean(envelope?.assigned_to && currentUserId && envelope.assigned_to === currentUserId);
      const ownedByColleague = Boolean(envelope?.assigned_to && (!currentUserId || envelope.assigned_to !== currentUserId));
      const targetDate = isoDay(envelope?.target_at);
      const targetOverdue = Boolean(targetDate && guidance.legal_date && targetDate < guidance.legal_date);
      const requestStatus = requestState(request);
      const dependencyUrgency = Math.max(0, 10 - Number(dependency.priority ?? 9));
      const coordinationBoost = (ownedByMe ? 30 : !envelope?.assigned_to ? 20 : 0) + (targetOverdue ? 25 : 0) + (requestStatus === "CLIENT_RESPONDED" ? 20 : 0);
      rows.push({
        id: dependency.id,
        vat_return_id: returnId,
        entity_id: filing.entity_id,
        entity_code: filing.entity_code,
        entity_name: filing.entity_name,
        jurisdiction_code: filing.jurisdiction_code,
        period_start: filing.period_start,
        period_end: filing.period_end,
        filing_due_date: dependency.filing_due_date || filing.filing_due_date,
        days_to_due: dependency.days_remaining ?? filing.days_to_due,
        filing_lane: filing.lane,
        filing_status: filing.status,
        code: dependency.code,
        title: dependency.title,
        detail: dependency.detail,
        next_action: dependency.next_action,
        resolution_rule: dependency.resolution_rule,
        blocking: dependency.blocking === true,
        responsibility: dependency.responsibility,
        client_evidence: dependency.responsibility === "CLIENT_EVIDENCE_ACCOUNTANT_VALIDATION",
        assigned_to: envelope?.assigned_to || null,
        owned_by_me: ownedByMe,
        owned_by_colleague: ownedByColleague,
        unowned: !envelope?.assigned_to,
        target_at: envelope?.target_at || null,
        target_overdue: targetOverdue,
        acknowledged_at: envelope?.acknowledged_at || null,
        note: envelope?.note || null,
        client_request_id: envelope?.client_request_id || null,
        client_request_state: requestStatus,
        client_request_due_at: request?.due_at || null,
        client_request_sent_at: request?.sent_at || null,
        evidence_count: Number(dependency.evidence_count || 0),
        priority: Number(filing.priority || 0) * 100 + dependencyUrgency * 5 + coordinationBoost,
        manual_complete_allowed: false,
      });
    }
  }

  return rows.sort((left, right) => right.priority - left.priority
    || Number(right.blocking) - Number(left.blocking)
    || String(left.filing_due_date || "9999").localeCompare(String(right.filing_due_date || "9999"))
    || String(left.entity_name).localeCompare(String(right.entity_name))
    || String(left.title).localeCompare(String(right.title)));
}

export function summarizeFinanceTaxDependencyPortfolio(rows) {
  const values = Array.isArray(rows) ? rows : [];
  return {
    total: values.length,
    mine: values.filter(row => row.owned_by_me).length,
    unowned: values.filter(row => row.unowned).length,
    client_evidence: values.filter(row => row.client_evidence).length,
    accountant: values.filter(row => !row.client_evidence).length,
    deadline: values.filter(row => Number.isFinite(row.days_to_due) && row.days_to_due <= 7).length,
    overdue: values.filter(row => Number.isFinite(row.days_to_due) && row.days_to_due < 0).length,
    client_responded: values.filter(row => row.client_request_state === "CLIENT_RESPONDED").length,
  };
}
