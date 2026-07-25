export function validateJournalIntegrity(lines) {
  if (!Array.isArray(lines) || lines.length < 2) {
    throw new Error(
      "A journal requires at least two lines"
    );
  }

  let totalDebit = 0;
  let totalCredit = 0;

  lines.forEach((line, index) => {
    if (!line?.account_id) {
      throw new Error(
        `account_id required on line ${index + 1}`
      );
    }

    const debit = Number(line.debit || 0);
    const credit = Number(line.credit || 0);

    if (
      !Number.isFinite(debit) ||
      !Number.isFinite(credit)
    ) {
      throw new Error(
        `Invalid amount on line ${index + 1}`
      );
    }

    if (debit < 0 || credit < 0) {
      throw new Error(
        `Negative amount on line ${index + 1}`
      );
    }

    if (
      (debit > 0 && credit > 0) ||
      (debit === 0 && credit === 0)
    ) {
      throw new Error(
        `Line ${index + 1} must contain either debit or credit`
      );
    }

    totalDebit += debit;
    totalCredit += credit;
  });

  const debit =
    Math.round(totalDebit * 100) / 100;

  const credit =
    Math.round(totalCredit * 100) / 100;

  if (debit !== credit) {
    throw new Error(
      `UNBALANCED JOURNAL: debit=${debit} credit=${credit}`
    );
  }

  if (debit <= 0) {
    throw new Error(
      "Journal total must be positive"
    );
  }

  return true;
}
