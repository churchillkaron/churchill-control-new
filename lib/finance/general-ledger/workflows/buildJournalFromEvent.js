export function buildJournalFromEvent({ event, rule }) {

  const payload = event.payload || {};
  const amount = Number(payload.amount || 0);
  const taxAmount = Number(payload.taxAmount || 0);

  const netAmount = amount - taxAmount;

  const lines = [
    {
      account_id: rule.debit_account_id,
      debit: amount,
      credit: 0,
      description: `${event.event_type} debit`,
    },
    {
      account_id: rule.credit_account_id,
      debit: 0,
      credit: netAmount,
      description: `${event.event_type} credit`,
    },
  ];

  if (taxAmount > 0 && rule.tax_account_id) {
    lines.push({
      account_id: rule.tax_account_id,
      debit: 0,
      credit: taxAmount,
      description: `${event.event_type} tax`,
    });
  }

  return lines;
}
