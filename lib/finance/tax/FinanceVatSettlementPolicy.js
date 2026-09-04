import {
  financeVatSnapshotDelta,
  financeVatSnapshotFromReturn,
  latestFinanceVatFiledSnapshot,
  normalizeFinanceVatAmendmentChain,
} from "@/lib/finance/tax/FinanceVatAmendmentPolicy";

const MONEY_TOLERANCE = 0.005;

function text(value) {
  return String(value ?? "").trim();
}

function upper(value) {
  return text(value).toUpperCase();
}

function numeric(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function roundMoney(value) {
  return Math.round((numeric(value) + Number.EPSILON) * 100) / 100;
}

function zeroSnapshot(currencyCode = "THB") {
  return {
    output_document_count: 0,
    customer_credit_note_count: 0,
    input_document_count: 0,
    output_tax: 0,
    input_tax: 0,
    tax_payable: 0,
    tax_refund: 0,
    currency_code: upper(currencyCode || "THB"),
  };
}

export function normalizeFinanceVatSettlement(vatReturn) {
  const raw = vatReturn?.metadata?.tax_settlement;
  return {
    version: 1,
    liability_events: Array.isArray(raw?.liability_events) ? raw.liability_events : [],
    cash_events: Array.isArray(raw?.cash_events) ? raw.cash_events : [],
  };
}

export function mergeFinanceVatSettlementMetadata(vatReturn, settlement) {
  return {
    ...(vatReturn?.metadata && typeof vatReturn.metadata === "object" ? vatReturn.metadata : {}),
    tax_settlement: settlement,
  };
}

export function financeVatSettlementTarget(vatReturn) {
  const chain = normalizeFinanceVatAmendmentChain(vatReturn);
  const latestAmendment = chain.history[chain.history.length - 1] || null;
  if (latestAmendment) {
    return {
      key: `amendment:${latestAmendment.id || latestAmendment.sequence}`,
      label: latestAmendment.label || `Amendment ${String(latestAmendment.sequence || chain.history.length).padStart(2, "0")}`,
      filed_at: latestAmendment.submitted_at || null,
      submission_reference: latestAmendment.submission_reference || null,
      values: latestFinanceVatFiledSnapshot(vatReturn, chain),
    };
  }

  return {
    key: "original",
    label: "Original",
    filed_at: vatReturn?.submitted_at || null,
    submission_reference: vatReturn?.submission_reference || null,
    values: financeVatSnapshotFromReturn(vatReturn),
  };
}

export function financeVatSettlementSignedBalance(snapshot) {
  return roundMoney(numeric(snapshot?.tax_payable) - numeric(snapshot?.tax_refund));
}

export function financeVatSettlementJournalLines({ delta, configuration }) {
  const lines = [];
  const outputDelta = roundMoney(delta?.output_tax);
  const inputDelta = roundMoney(delta?.input_tax);
  const netDelta = roundMoney(outputDelta - inputDelta);

  if (Math.abs(outputDelta) > MONEY_TOLERANCE) {
    lines.push({
      account_id: configuration.payable_tax_account_id,
      debit: outputDelta > 0 ? outputDelta : 0,
      credit: outputDelta < 0 ? Math.abs(outputDelta) : 0,
      description: "Close output VAT into tax settlement control",
    });
  }

  if (Math.abs(inputDelta) > MONEY_TOLERANCE) {
    lines.push({
      account_id: configuration.recoverable_tax_account_id,
      debit: inputDelta < 0 ? Math.abs(inputDelta) : 0,
      credit: inputDelta > 0 ? inputDelta : 0,
      description: "Close recoverable input VAT into tax settlement control",
    });
  }

  if (Math.abs(netDelta) > MONEY_TOLERANCE) {
    lines.push({
      account_id: configuration.settlement_account_id,
      debit: netDelta < 0 ? Math.abs(netDelta) : 0,
      credit: netDelta > 0 ? netDelta : 0,
      description: "Recognise VAT payable/refund in tax settlement control",
    });
  }

  return lines;
}

export function financeVatCashJournalLines({ direction, amount, settlementAccountId, bankAccountId }) {
  const normalizedDirection = upper(direction);
  const value = roundMoney(amount);
  if (!(value > 0)) throw new Error("Settlement cash amount must be positive");

  if (normalizedDirection === "PAYMENT") {
    return [
      {
        account_id: settlementAccountId,
        debit: value,
        credit: 0,
        description: "VAT payment to tax authority",
      },
      {
        account_id: bankAccountId,
        debit: 0,
        credit: value,
        description: "VAT payment from bank",
      },
    ];
  }

  if (normalizedDirection === "REFUND") {
    return [
      {
        account_id: bankAccountId,
        debit: value,
        credit: 0,
        description: "VAT refund received in bank",
      },
      {
        account_id: settlementAccountId,
        debit: 0,
        credit: value,
        description: "VAT refund from tax authority",
      },
    ];
  }

  throw new Error(`Unsupported VAT cash settlement direction: ${normalizedDirection}`);
}

function journalValid(event, journalsById) {
  if (event?.zero_value === true && !event?.journal_entry_id) return true;
  const journal = journalsById.get(event?.journal_entry_id);
  return Boolean(
    journal
    && upper(journal.status) === "POSTED"
    && journal.reversed !== true
  );
}

export function evaluateFinanceVatSettlement({
  vatReturn,
  configuration,
  journalRows = [],
  bankTransactionRows = [],
} = {}) {
  const settlement = normalizeFinanceVatSettlement(vatReturn);
  const target = financeVatSettlementTarget(vatReturn);
  const currency = upper(target.values?.currency_code || vatReturn?.currency_code || "THB");
  const journalsById = new Map((journalRows || []).map(row => [row.id, row]));
  const bankTransactionsById = new Map((bankTransactionRows || []).map(row => [row.id, row]));

  const liabilityEvents = settlement.liability_events.map(event => ({
    ...event,
    journal_valid: journalValid(event, journalsById),
    journal: event?.journal_entry_id ? journalsById.get(event.journal_entry_id) || null : null,
  }));
  const validLiabilityEvents = liabilityEvents.filter(event => event.journal_valid);
  const targetLiabilityEvent = [...validLiabilityEvents].reverse().find(event => event.source_version_key === target.key) || null;
  const latestRecognizedEvent = validLiabilityEvents[validLiabilityEvents.length - 1] || null;
  const recognizedSnapshot = latestRecognizedEvent?.snapshot_after || zeroSnapshot(currency);
  const targetDelta = financeVatSnapshotDelta(recognizedSnapshot, target.values);
  const targetRecognized = Boolean(targetLiabilityEvent);

  const cashEvents = settlement.cash_events.map(event => {
    const journal = event?.journal_entry_id ? journalsById.get(event.journal_entry_id) || null : null;
    const bankTransaction = event?.bank_transaction_id
      ? bankTransactionsById.get(event.bank_transaction_id) || null
      : null;
    const valid = Boolean(journal && upper(journal.status) === "POSTED" && journal.reversed !== true);
    return {
      ...event,
      journal,
      journal_valid: valid,
      bank_transaction: bankTransaction,
      bank_linked: Boolean(bankTransaction),
      bank_reconciled: bankTransaction?.reconciled === true,
    };
  });
  const validCashEvents = cashEvents.filter(event => event.journal_valid);
  const settledSigned = roundMoney(validCashEvents.reduce((sum, event) => {
    const sign = upper(event.direction) === "REFUND" ? -1 : 1;
    return sum + sign * numeric(event.amount);
  }, 0));
  const targetSigned = financeVatSettlementSignedBalance(target.values);
  const remainingSigned = roundMoney(targetSigned - settledSigned);
  const amountRemaining = Math.abs(remainingSigned);
  const expectedDirection = remainingSigned > MONEY_TOLERANCE
    ? "PAYMENT"
    : remainingSigned < -MONEY_TOLERANCE
      ? "REFUND"
      : null;
  const fullySettled = amountRemaining <= MONEY_TOLERANCE;
  const cashEvidenceComplete = validCashEvents.length > 0
    && validCashEvents.every(event => event.bank_linked && event.bank_reconciled);
  const configurationReady = Boolean(
    configuration
    && upper(configuration.status || "ACTIVE") === "ACTIVE"
    && configuration.recoverable_tax_account_id
    && configuration.payable_tax_account_id
    && configuration.settlement_account_id
  );

  let state = "UNFILED";
  if (upper(vatReturn?.status) === "SUBMITTED") {
    if (!configurationReady) {
      state = "SETTLEMENT_SETUP_REQUIRED";
    } else if (!targetRecognized) {
      state = "LIABILITY_POSTING_REQUIRED";
    } else if (Math.abs(targetSigned) <= MONEY_TOLERANCE && validCashEvents.length === 0) {
      state = "NO_BALANCE";
    } else if (!fullySettled) {
      const hasSameDirectionCash = validCashEvents.some(event => upper(event.direction) === expectedDirection);
      state = expectedDirection === "REFUND"
        ? hasSameDirectionCash ? "PART_REFUNDED" : "REFUND_DUE"
        : hasSameDirectionCash ? "PART_PAID" : "PAYMENT_DUE";
    } else if (!cashEvidenceComplete && validCashEvents.length > 0) {
      const lastDirection = upper(validCashEvents[validCashEvents.length - 1]?.direction);
      state = lastDirection === "REFUND" ? "REFUNDED_AWAITING_BANK_MATCH" : "PAID_AWAITING_BANK_MATCH";
    } else {
      state = "CLEARED";
    }
  }

  const reversedLiabilityEvents = liabilityEvents.filter(event => event.journal_entry_id && !event.journal_valid);
  const reversedCashEvents = cashEvents.filter(event => event.journal_entry_id && !event.journal_valid);

  return {
    state,
    currency_code: currency,
    configuration_ready: configurationReady,
    target,
    target_signed_balance: targetSigned,
    target_recognized: targetRecognized,
    recognized_snapshot: recognizedSnapshot,
    liability_delta: targetDelta,
    cash_settled_signed: settledSigned,
    remaining_signed: remainingSigned,
    amount_remaining: amountRemaining,
    expected_direction: expectedDirection,
    fully_settled: fullySettled,
    bank_evidence_complete: cashEvidenceComplete,
    settlement,
    liability_events: liabilityEvents,
    cash_events: cashEvents,
    reversed_liability_event_count: reversedLiabilityEvents.length,
    reversed_cash_event_count: reversedCashEvents.length,
    needs_attention: reversedLiabilityEvents.length > 0 || reversedCashEvents.length > 0,
  };
}

export function financeVatSettlementStateLabel(state) {
  return upper(state).replaceAll("_", " ") || "UNFILED";
}
