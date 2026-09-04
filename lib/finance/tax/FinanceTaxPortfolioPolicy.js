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
