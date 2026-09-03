const ZERO_TOLERANCE = 0.005;

const COMPLETE_RECONCILIATION_STATUSES = new Set([
  "COMPLETE",
  "COMPLETED",
  "CLOSED",
  "DONE",
  "RECONCILED",
  "APPROVED",
]);

function clean(value) {
  return String(value ?? "").trim();
}

function upper(value) {
  return clean(value).toUpperCase().replace(/[\s-]+/g, "_");
}

function number(value) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function round(value, digits = 2) {
  const factor = 10 ** digits;
  return Math.round((number(value) + Number.EPSILON) * factor) / factor;
}

function rowMap(rows = []) {
  return new Map((rows || []).map((row) => [row.account_id, row]));
}

function expectedDirection(row = {}) {
  const explicit = clean(row.normal_balance).toLowerCase();
  if (explicit.includes("credit")) return "CREDIT";
  if (explicit.includes("debit")) return "DEBIT";
  if (["revenue", "liability", "equity"].includes(row.classification)) return "CREDIT";
  if (["asset", "cash", "cogs", "expense"].includes(row.classification)) return "DEBIT";
  return null;
}

function presentationAmount(netMovement, direction) {
  const net = number(netMovement);
  if (direction === "CREDIT") return -net;
  if (direction === "DEBIT") return net;
  return net;
}

function statusRank(state) {
  if (state === "BLOCKED") return 0;
  if (state === "ACTION_REQUIRED") return 20;
  if (state === "WATCH") return 60;
  return 90;
}

function raiseState(current, candidate) {
  return statusRank(candidate) < statusRank(current) ? candidate : current;
}

function isCompleteReconciliation(status) {
  return COMPLETE_RECONCILIATION_STATUSES.has(upper(status));
}

function asDateKey(value) {
  return value ? String(value).slice(0, 10) : null;
}

function latestReconciliationsByBankAccount(rows = []) {
  const map = new Map();
  for (const row of rows || []) {
    if (!row?.bank_account_id || map.has(row.bank_account_id)) continue;
    map.set(row.bank_account_id, row);
  }
  return map;
}

function linesByAccount(lines = []) {
  const map = new Map();
  for (const line of lines || []) {
    if (!line?.account_id) continue;
    if (!map.has(line.account_id)) map.set(line.account_id, []);
    map.get(line.account_id).push(line);
  }
  return map;
}

function bankAccountsByFinanceAccount(rows = []) {
  const map = new Map();
  for (const row of rows || []) {
    if (!row?.finance_account_id || row.active === false) continue;
    if (!map.has(row.finance_account_id)) map.set(row.finance_account_id, []);
    map.get(row.finance_account_id).push(row);
  }
  return map;
}

function activityFacts(lines = []) {
  if (!lines.length) {
    return {
      transaction_count: 0,
      gross_activity: 0,
      largest_line: 0,
      largest_line_share: 0,
    };
  }

  const grossValues = lines.map((line) => Math.abs(number(line.debit)) + Math.abs(number(line.credit)));
  const grossActivity = grossValues.reduce((total, value) => total + value, 0);
  const largestLine = Math.max(...grossValues, 0);

  return {
    transaction_count: lines.length,
    gross_activity: round(grossActivity),
    largest_line: round(largestLine),
    largest_line_share: grossActivity > ZERO_TOLERANCE ? round(largestLine / grossActivity, 4) : 0,
  };
}

function stateLabel(state) {
  if (state === "BLOCKED") return "Blocked";
  if (state === "ACTION_REQUIRED") return "Action required";
  if (state === "WATCH") return "Watch";
  return "On track";
}

function accountHref(account, state, hasBankMapping) {
  if (account.classification === "cash" && !hasBankMapping) return "/finance/bank-accounts";
  if (account.classification === "cash" && hasBankMapping && state !== "ON_TRACK") return "/finance/bank-reconciliation";
  if (account.classification === "unclassified") return "/finance/chart-of-accounts";
  return "/finance/ledger";
}

function buildAction(account) {
  if (account.state === "ON_TRACK") return null;
  return {
    id: `account-health:${account.account_id}`,
    kind: "account_health",
    title: `${account.account_code ? `${account.account_code} · ` : ""}${account.account_name}`,
    detail: account.reason,
    status: account.state,
    priority: account.state === "BLOCKED" || account.state === "ACTION_REQUIRED" ? "attention" : "watch",
    href: account.href,
    owner: "Accounting",
    source: "general_ledger",
    evidence_required: account.state === "BLOCKED" || account.state === "ACTION_REQUIRED",
    evidence_present: false,
    account_id: account.account_id,
  };
}

export function buildFinanceAccountHealth({
  closingResult,
  periodResult,
  bankAccounts = [],
  reconciliationRuns = [],
  periodStart = null,
  periodEnd = null,
  asOfDate = null,
} = {}) {
  const closingRows = rowMap(closingResult?.rows || []);
  const periodRows = rowMap(periodResult?.rows || []);
  const accountIds = new Set([...closingRows.keys(), ...periodRows.keys()]);
  const periodLines = linesByAccount(periodResult?.ledgerLines || []);
  const bankByFinanceAccount = bankAccountsByFinanceAccount(bankAccounts);
  const latestRecByBank = latestReconciliationsByBankAccount(reconciliationRuns);
  const accounts = [];

  for (const accountId of accountIds) {
    const closing = closingRows.get(accountId) || {};
    const period = periodRows.get(accountId) || {};
    const source = Object.keys(closing).length ? closing : period;
    const direction = expectedDirection(source);
    const closingAmount = presentationAmount(closing.net_movement, direction);
    const periodMovement = presentationAmount(period.net_movement, direction);
    const openingAmount = closingAmount - periodMovement;
    const activity = activityFacts(periodLines.get(accountId) || []);
    const mappedBanks = bankByFinanceAccount.get(accountId) || [];
    const reasons = [];
    const nextActions = [];
    let state = "ON_TRACK";
    let reconciliation = null;

    if (direction && closingAmount < -ZERO_TOLERANCE) {
      state = raiseState(state, "ACTION_REQUIRED");
      reasons.push(`Balance is opposite the configured ${direction.toLowerCase()} normal direction.`);
      nextActions.push("Inspect the ledger activity and supporting evidence before close.");
    }

    if (source.classification === "unclassified" && Math.abs(closingAmount) > ZERO_TOLERANCE) {
      state = raiseState(state, "ACTION_REQUIRED");
      reasons.push("Account has a non-zero balance but no reliable statement classification.");
      nextActions.push("Complete the chart-of-accounts classification.");
    }

    if (source.classification === "cash" && Math.abs(closingAmount) > ZERO_TOLERANCE) {
      if (!mappedBanks.length) {
        state = raiseState(state, "ACTION_REQUIRED");
        reasons.push("Cash balance has no bank-account mapping in Avantiqo.");
        nextActions.push("Confirm the substantiation method and link a bank account when this balance is bank-backed.");
      } else {
        const recs = mappedBanks
          .map((bank) => latestRecByBank.get(bank.id))
          .filter(Boolean)
          .sort((left, right) => String(right.reconciliation_date || "").localeCompare(String(left.reconciliation_date || "")));
        reconciliation = recs[0] || null;
        const recDate = asDateKey(reconciliation?.reconciliation_date);
        const inSelectedPeriod = Boolean(
          reconciliation &&
          (!periodStart || recDate >= asDateKey(periodStart)) &&
          (!asOfDate || recDate <= asDateKey(asOfDate)),
        );
        const difference = Math.abs(number(reconciliation?.difference_amount));

        if (reconciliation && difference > ZERO_TOLERANCE) {
          state = raiseState(state, "BLOCKED");
          reasons.push(`Latest linked bank reconciliation has ${round(difference)} unresolved difference.`);
          nextActions.push("Resolve the bank-to-book difference before final close.");
        } else if (!inSelectedPeriod) {
          state = raiseState(state, "ACTION_REQUIRED");
          reasons.push("No linked bank reconciliation is dated inside the selected accounting period.");
          nextActions.push("Reconcile the mapped bank account for this period.");
        } else if (!isCompleteReconciliation(reconciliation?.status)) {
          state = raiseState(state, "ACTION_REQUIRED");
          reasons.push(`Latest linked bank reconciliation is ${clean(reconciliation?.status) || "open"}.`);
          nextActions.push("Complete the bank reconciliation control.");
        }
      }
    }

    if (state === "ON_TRACK") {
      const openingMagnitude = Math.abs(openingAmount);
      const movementMagnitude = Math.abs(periodMovement);
      const movementRatio = openingMagnitude > ZERO_TOLERANCE ? movementMagnitude / openingMagnitude : 0;
      const concentrated = activity.transaction_count >= 3 && activity.largest_line_share >= 0.8;
      const movedMoreThanOpening = openingMagnitude > ZERO_TOLERANCE && movementRatio >= 1;

      if (movedMoreThanOpening || concentrated) {
        state = "WATCH";
        if (movedMoreThanOpening) {
          reasons.push("Period movement is at least as large as the opening balance.");
          nextActions.push("Review the movement against normal business activity and prior evidence.");
        }
        if (concentrated) {
          reasons.push(`One posting represents ${Math.round(activity.largest_line_share * 100)}% of period gross activity.`);
          nextActions.push("Inspect the concentrated posting and its source document.");
        }
      }
    }

    const reason = reasons.join(" ") || "No structural account-level exception is surfaced from the available accounting truth.";
    const nextAction = nextActions[0] || "Continue normal accounting and evidence collection.";
    const account = {
      account_id: accountId,
      account_code: source.account_code || "",
      account_name: source.account_name || "Unknown account",
      account_category: source.account_category || "",
      account_type: source.account_type || "",
      classification: source.classification || "unclassified",
      normal_balance: source.normal_balance || null,
      expected_direction: direction,
      state,
      state_label: stateLabel(state),
      reason,
      next_action: nextAction,
      href: accountHref(source, state, mappedBanks.length > 0),
      opening_amount: round(openingAmount),
      closing_amount: round(closingAmount),
      period_movement: round(periodMovement),
      transaction_count: activity.transaction_count,
      gross_activity: activity.gross_activity,
      largest_line: activity.largest_line,
      largest_line_share: activity.largest_line_share,
      bank_mapping_count: mappedBanks.length,
      reconciliation_date: reconciliation?.reconciliation_date || null,
      reconciliation_status: reconciliation?.status || null,
      reconciliation_difference: round(reconciliation?.difference_amount || 0),
    };
    accounts.push(account);
  }

  accounts.sort((left, right) =>
    statusRank(left.state) - statusRank(right.state) ||
    Math.abs(right.closing_amount) - Math.abs(left.closing_amount) ||
    String(left.account_code || "").localeCompare(String(right.account_code || "")),
  );

  const summary = {
    total_accounts: accounts.length,
    blocked: accounts.filter((row) => row.state === "BLOCKED").length,
    action_required: accounts.filter((row) => row.state === "ACTION_REQUIRED").length,
    watch: accounts.filter((row) => row.state === "WATCH").length,
    on_track: accounts.filter((row) => row.state === "ON_TRACK").length,
    opposite_normal_balance: accounts.filter((row) => row.reason.includes("opposite the configured")).length,
    unmapped_cash: accounts.filter((row) => row.reason.includes("no bank-account mapping")).length,
    as_of: asDateKey(asOfDate || periodEnd),
  };

  return {
    summary,
    accounts,
    actions: accounts.map(buildAction).filter(Boolean),
  };
}
