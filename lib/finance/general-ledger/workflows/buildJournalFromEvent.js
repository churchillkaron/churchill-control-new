function money(value, field) {
  const resolved = Number(value ?? 0);

  if (!Number.isFinite(resolved)) {
    throw new Error(`${field} must be a valid number`);
  }

  return resolved;
}

function accountId(value, field) {
  const resolved = String(value || "").trim();

  if (!resolved) {
    throw new Error(`${field} is not configured`);
  }

  return resolved;
}

function taxPostingSide(rule, taxAmount) {
  if (taxAmount === 0) {
    return null;
  }

  const side = String(
    rule?.tax_posting_side ||
    rule?.taxPostingSide ||
    ""
  )
    .trim()
    .toUpperCase();

  if (!["DEBIT", "CREDIT"].includes(side)) {
    throw new Error(
      "Tax posting side must be configured as DEBIT or CREDIT for this posting rule"
    );
  }

  return side;
}

export function buildJournalFromEvent({ event, rule }) {
  if (!event?.event_type) {
    throw new Error("Accounting event type required");
  }

  if (!rule) {
    throw new Error(`Posting rule required for ${event.event_type}`);
  }

  const payload = event.payload || {};
  const amount = money(payload.amount, "amount");
  const taxAmount = money(
    payload.tax_amount ?? payload.taxAmount,
    "tax amount"
  );

  if (amount <= 0) {
    throw new Error("Accounting event amount must be greater than zero");
  }

  if (taxAmount < 0) {
    throw new Error("Accounting event tax amount cannot be negative");
  }

  if (taxAmount > amount) {
    throw new Error("Accounting event tax amount cannot exceed total amount");
  }

  const debitAccountId = accountId(
    rule.debit_account_id,
    "Debit account"
  );
  const creditAccountId = accountId(
    rule.credit_account_id,
    "Credit account"
  );
  const netAmount = amount - taxAmount;
  const side = taxPostingSide(rule, taxAmount);
  const description = String(
    payload.description || event.event_type
  ).trim();
  const dimensions = {
    cost_center_id:
      payload.cost_center_id || payload.costCenterId || null,
    department_id:
      payload.department_id || payload.departmentId || null,
    party_id:
      payload.party_id || payload.partyId || null,
    project_id:
      payload.project_id || payload.projectId || null,
  };

  if (taxAmount === 0) {
    return [
      {
        account_id: debitAccountId,
        debit: amount,
        credit: 0,
        description: `${description} debit`,
        ...dimensions,
      },
      {
        account_id: creditAccountId,
        debit: 0,
        credit: amount,
        description: `${description} credit`,
        ...dimensions,
      },
    ];
  }

  const taxAccountId = accountId(
    rule.tax_account_id,
    "Tax account"
  );

  if (side === "DEBIT") {
    return [
      {
        account_id: debitAccountId,
        debit: netAmount,
        credit: 0,
        description: `${description} net debit`,
        ...dimensions,
      },
      {
        account_id: taxAccountId,
        debit: taxAmount,
        credit: 0,
        description: `${description} tax debit`,
        ...dimensions,
      },
      {
        account_id: creditAccountId,
        debit: 0,
        credit: amount,
        description: `${description} total credit`,
        ...dimensions,
      },
    ];
  }

  return [
    {
      account_id: debitAccountId,
      debit: amount,
      credit: 0,
      description: `${description} total debit`,
      ...dimensions,
    },
    {
      account_id: creditAccountId,
      debit: 0,
      credit: netAmount,
      description: `${description} net credit`,
      ...dimensions,
    },
    {
      account_id: taxAccountId,
      debit: 0,
      credit: taxAmount,
      description: `${description} tax credit`,
      ...dimensions,
    },
  ];
}
