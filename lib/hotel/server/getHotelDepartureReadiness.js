const DEPARTURE_EPSILON = 0.005;

function clean(value) {
  return String(value ?? "").trim();
}

function normalizedStatus(value) {
  return clean(value).toUpperCase();
}

function finiteAmount(value) {
  const number = Number(value || 0);
  return Number.isFinite(number) ? number : 0;
}

function issue(code, label, detail, blocking = true) {
  return Object.freeze({ code, label, detail, blocking });
}

function activeFolioBalance(lines) {
  return (lines || [])
    .filter((line) => !line?.voided_at)
    .reduce(
      (sum, line) => sum + finiteAmount(line?.amount) + finiteAmount(line?.tax_amount),
      0,
    );
}

function balanceDetail(balance, currency) {
  if (balance > DEPARTURE_EPSILON) {
    return `${balance.toFixed(2)} ${currency} remains due on the guest folio.`;
  }
  if (balance < -DEPARTURE_EPSILON) {
    return `${Math.abs(balance).toFixed(2)} ${currency} remains as guest credit on the folio.`;
  }
  return "The guest folio is balanced but still open.";
}

export function evaluateHotelDepartureReadiness({
  booking,
  folio = null,
  folioLines = [],
  transactions = [],
} = {}) {
  const blockers = [];
  const attention = [];
  const bookingStatus = normalizedStatus(booking?.status);
  const folioStatus = normalizedStatus(folio?.status);
  const currency = clean(folio?.currency_code || booking?.currency_code) || "THB";
  const folioBalance = activeFolioBalance(folioLines);
  const pendingTransactions = (transactions || []).filter(
    (transaction) => normalizedStatus(transaction?.status) === "PENDING",
  );
  const financeEvidenceMissing = (transactions || []).filter(
    (transaction) =>
      normalizedStatus(transaction?.status) === "SETTLED" &&
      normalizedStatus(transaction?.processor_mode) === "AVANTIQO_GATEWAY" &&
      !transaction?.finance_payment_id,
  );

  if (bookingStatus !== "CHECKED_IN") {
    blockers.push(issue(
      "BOOKING_NOT_IN_HOUSE",
      "Stay state",
      "Only an in-house stay can be checked out.",
    ));
  }

  if (pendingTransactions.length) {
    blockers.push(issue(
      "PAYMENT_PENDING",
      "Settlement pending",
      `${pendingTransactions.length} payment or refund transaction${pendingTransactions.length === 1 ? " is" : "s are"} still awaiting gateway / Finance reconciliation. Keep the folio open until settlement is final.`,
    ));
  }

  if (financeEvidenceMissing.length) {
    blockers.push(issue(
      "FINANCE_EVIDENCE_MISSING",
      "Finance evidence missing",
      `${financeEvidenceMissing.length} settled gateway transaction${financeEvidenceMissing.length === 1 ? " has" : "s have"} no Finance posting evidence. Resolve settlement truth before departure.`,
    ));
  }

  if (folio && folioStatus === "OPEN") {
    if (Math.abs(folioBalance) > DEPARTURE_EPSILON) {
      blockers.push(issue(
        "FOLIO_BALANCE_OPEN",
        "Settle folio",
        `${balanceDetail(folioBalance, currency)} Settle the balance and close the folio before check-out.`,
      ));
    } else {
      blockers.push(issue(
        "FOLIO_OPEN_ZERO_BALANCE",
        "Close folio",
        "The guest folio is at zero balance but is still OPEN. Close it before check-out.",
      ));
    }
  }

  if (folio && folioStatus && !["OPEN", "CLOSED"].includes(folioStatus)) {
    attention.push(issue(
      "FOLIO_STATE_REVIEW",
      "Review folio state",
      `Folio state is ${folioStatus}. Review the stay before departure.`,
      false,
    ));
  }

  const canCheckOut = blockers.length === 0;
  const state = !canCheckOut ? "BLOCKED" : attention.length ? "NEEDS_ACTION" : "READY";

  return Object.freeze({
    state,
    can_check_out: canCheckOut,
    blockers,
    attention,
    folio_id: folio?.id || null,
    folio_status: folioStatus || null,
    folio_balance: folioBalance,
    currency_code: currency,
    pending_transactions: pendingTransactions.length,
    finance_evidence_missing: financeEvidenceMissing.length,
  });
}

export function firstHotelDepartureBlockerMessage(readiness) {
  return readiness?.blockers?.[0]?.detail || "Departure is not ready for check-out";
}

export { DEPARTURE_EPSILON };
export default evaluateHotelDepartureReadiness;
