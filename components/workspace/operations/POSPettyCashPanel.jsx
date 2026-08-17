"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Coins, RefreshCw, ShieldCheck } from "lucide-react";

function numeric(value) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatMoney(value, currencyCode) {
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: currencyCode || "THB",
    }).format(numeric(value));
  } catch {
    return numeric(value).toFixed(2);
  }
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

async function readJson(response) {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return { success: false, error: text };
  }
}

export default function POSPettyCashPanel({
  organizationId,
  entityId,
  applicationId,
  currencyCode,
  onChanged,
}) {
  const [actor, setActor] = useState(null);
  const [funds, setFunds] = useState([]);
  const [requests, setRequests] = useState([]);
  const [disbursements, setDisbursements] = useState([]);
  const [receipts, setReceipts] = useState([]);
  const [replenishments, setReplenishments] = useState([]);
  const [pettyCashLocations, setPettyCashLocations] = useState([]);
  const [replenishSources, setReplenishSources] = useState([]);
  const [advanceAccounts, setAdvanceAccounts] = useState([]);
  const [expenseAccounts, setExpenseAccounts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(null);
  const [error, setError] = useState(null);

  const [cashLocationId, setCashLocationId] = useState("");
  const [advanceAccountId, setAdvanceAccountId] = useState("");
  const [replenishSourceLocationId, setReplenishSourceLocationId] = useState("");
  const [targetBalance, setTargetBalance] = useState("");

  const [requestFundId, setRequestFundId] = useState("");
  const [purpose, setPurpose] = useState("");
  const [requestedAmount, setRequestedAmount] = useState("");
  const [decisionByRequest, setDecisionByRequest] = useState({});
  const [receiptByDisbursement, setReceiptByDisbursement] = useState({});
  const [settlementByDisbursement, setSettlementByDisbursement] = useState({});
  const [replenishByFund, setReplenishByFund] = useState({});

  const locationMap = useMemo(
    () =>
      new Map(
        [...pettyCashLocations, ...replenishSources].map((row) => [String(row.id), row])
      ),
    [pettyCashLocations, replenishSources]
  );

  const disbursementByRequest = useMemo(
    () => new Map(disbursements.map((row) => [String(row.request_id), row])),
    [disbursements]
  );

  const receiptTotals = useMemo(() => {
    const totals = new Map();
    for (const receipt of receipts) {
      const key = String(receipt.disbursement_id);
      totals.set(key, numeric(totals.get(key)) + numeric(receipt.amount));
    }
    return totals;
  }, [receipts]);

  const load = useCallback(async () => {
    if (!organizationId || !entityId || !applicationId) return;
    setLoading(true);
    setError(null);
    try {
      const search = new URLSearchParams({ organizationId, entityId, applicationId });
      const response = await fetch(`/api/pos/petty-cash?${search.toString()}`, {
        cache: "no-store",
        credentials: "include",
      });
      const result = await readJson(response);
      if (!response.ok || result.success === false) {
        throw new Error(result.error || "Unable to load petty cash");
      }

      const nextFunds = result.funds || [];
      const nextPettyLocations = result.petty_cash_locations || [];
      const nextSources = result.replenish_sources || [];
      const nextAdvance = result.advance_accounts || [];

      setActor(result.actor || null);
      setFunds(nextFunds);
      setRequests(result.requests || []);
      setDisbursements(result.disbursements || []);
      setReceipts(result.receipts || []);
      setReplenishments(result.replenishments || []);
      setPettyCashLocations(nextPettyLocations);
      setReplenishSources(nextSources);
      setAdvanceAccounts(nextAdvance);
      setExpenseAccounts(result.expense_accounts || []);

      setRequestFundId((current) => current || nextFunds[0]?.id || "");
      setCashLocationId((current) => current || nextPettyLocations[0]?.id || "");
      setAdvanceAccountId((current) => current || nextAdvance[0]?.id || "");
      setReplenishSourceLocationId((current) => {
        if (current) return current;
        const pettyId = nextPettyLocations[0]?.id;
        return nextSources.find((row) => row.id !== pettyId)?.id || "";
      });
    } catch (loadError) {
      setError(loadError.message);
    } finally {
      setLoading(false);
    }
  }, [applicationId, entityId, organizationId]);

  useEffect(() => {
    load();
  }, [load]);

  async function execute(action, body, key) {
    setActionLoading(key || action);
    setError(null);
    try {
      const response = await fetch("/api/pos/petty-cash", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": `operations-petty-cash:${action}:${crypto.randomUUID()}`,
        },
        body: JSON.stringify({
          organizationId,
          entityId,
          applicationId,
          action,
          ...body,
        }),
      });
      const result = await readJson(response);
      if (!response.ok || result.success === false) {
        throw new Error(result.error || "Petty cash action failed");
      }
      await load();
      await onChanged?.();
      return result;
    } catch (actionError) {
      setError(actionError.message);
      return null;
    } finally {
      setActionLoading(null);
    }
  }

  async function configureFund() {
    if (!cashLocationId || !advanceAccountId || !replenishSourceLocationId) {
      setError("Petty cash location, clearing asset and replenishment source are required.");
      return;
    }
    const result = await execute(
      "configure_fund",
      {
        cashLocationId,
        advanceAccountId,
        replenishSourceLocationId,
        targetBalance: targetBalance === "" ? null : numeric(targetBalance),
      },
      "configure"
    );
    if (result) setTargetBalance("");
  }

  async function createRequest() {
    if (!requestFundId || !purpose.trim() || numeric(requestedAmount) <= 0) {
      setError("Fund, business purpose and requested amount are required.");
      return;
    }
    const result = await execute(
      "create_request",
      {
        fundId: requestFundId,
        purpose: purpose.trim(),
        requestedAmount: numeric(requestedAmount),
      },
      "request"
    );
    if (result) {
      setPurpose("");
      setRequestedAmount("");
    }
  }

  async function decideRequest(request, decision) {
    const draft = decisionByRequest[request.id] || {};
    const approvedAmount = numeric(draft.amount || request.requested_amount);
    const notes = String(draft.notes || "").trim();
    if (decision === "APPROVE" && approvedAmount <= 0) {
      setError("Approved amount must be greater than zero.");
      return;
    }
    if (decision === "REJECT" && !notes) {
      setError("A rejection reason is required.");
      return;
    }
    await execute(
      "decide_request",
      {
        requestId: request.id,
        decision,
        approvedAmount,
        notes: notes || null,
      },
      `decision:${request.id}`
    );
  }

  async function disburse(request) {
    await execute(
      "disburse",
      { requestId: request.id, disbursementDate: today() },
      `disburse:${request.id}`
    );
  }

  async function addReceipt(disbursement) {
    const draft = receiptByDisbursement[disbursement.id] || {};
    if (
      !draft.expenseAccountId ||
      numeric(draft.amount) <= 0 ||
      !String(draft.receiptReference || "").trim() ||
      !String(draft.evidenceUrl || "").trim()
    ) {
      setError("Expense account, amount, receipt reference and evidence URL are required.");
      return;
    }
    const result = await execute(
      "add_receipt",
      {
        disbursementId: disbursement.id,
        expenseAccountId: draft.expenseAccountId,
        amount: numeric(draft.amount),
        receiptDate: draft.receiptDate || today(),
        receiptReference: String(draft.receiptReference).trim(),
        supplier: String(draft.supplier || "").trim() || null,
        evidenceUrl: String(draft.evidenceUrl).trim(),
        notes: String(draft.notes || "").trim() || null,
      },
      `receipt:${disbursement.id}`
    );
    if (result) {
      setReceiptByDisbursement((current) => ({ ...current, [disbursement.id]: {} }));
    }
  }

  async function settle(disbursement) {
    const draft = settlementByDisbursement[disbursement.id] || {};
    const reference = String(draft.reference || "").trim();
    if (!reference) {
      setError("Settlement reference is required.");
      return;
    }
    await execute(
      "settle",
      {
        disbursementId: disbursement.id,
        settlementDate: draft.date || today(),
        settlementReference: reference,
      },
      `settle:${disbursement.id}`
    );
  }

  async function replenish(fund) {
    const draft = replenishByFund[fund.id] || {};
    const reason = String(draft.reason || "").trim();
    if (numeric(draft.amount) <= 0 || !reason) {
      setError("Replenishment amount and reason are required.");
      return;
    }
    const result = await execute(
      "replenish",
      { fundId: fund.id, amount: numeric(draft.amount), reason },
      `replenish:${fund.id}`
    );
    if (result) {
      setReplenishByFund((current) => ({ ...current, [fund.id]: {} }));
    }
  }

  return (
    <article className="rounded-[30px] border border-white/10 bg-white/[0.03] p-7 xl:col-span-2">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="text-xs uppercase tracking-[0.2em] text-[#D6A66A]">
            Petty Cash
          </div>
          <h2 className="mt-2 text-2xl font-semibold">Controlled fund lifecycle</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-white/40">
            Request → approve → disburse → receipt evidence → Finance settlement → replenish. Accounting entries and custody balances are posted atomically by the accepted database lifecycle.
          </p>
        </div>
        <button
          type="button"
          onClick={load}
          className="inline-flex items-center gap-2 rounded-xl border border-white/10 px-4 py-2 text-sm text-white/55"
        >
          <RefreshCw size={14} /> Refresh
        </button>
      </div>

      <div className="mt-4 flex flex-wrap gap-2 text-[11px] text-white/40">
        <span className="rounded-full border border-white/10 px-3 py-1.5">Manager approval</span>
        <span className="rounded-full border border-white/10 px-3 py-1.5">No self-approval</span>
        <span className="rounded-full border border-white/10 px-3 py-1.5">Receipt evidence required</span>
        <span className="rounded-full border border-white/10 px-3 py-1.5">Finance settlement</span>
        <span className="rounded-full border border-white/10 px-3 py-1.5">Immutable evidence</span>
        <span className="rounded-full border border-white/10 px-3 py-1.5">No revenue impact</span>
      </div>

      {error ? (
        <div className="mt-4 rounded-xl border border-red-400/20 bg-red-500/10 p-3 text-sm text-red-100">
          {error}
        </div>
      ) : null}

      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <div className="rounded-2xl border border-white/10 bg-black/20 p-5">
          <div className="flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-white/35">
            <ShieldCheck size={14} /> Fund control
          </div>
          <div className="mt-3 grid gap-3">
            <select value={cashLocationId} onChange={(event) => setCashLocationId(event.target.value)} className="rounded-xl border border-white/10 bg-black px-4 py-3 text-sm">
              <option value="">PETTY_CASH custody location</option>
              {pettyCashLocations.map((row) => (
                <option key={row.id} value={row.id}>{row.name} · {formatMoney(row.current_balance, row.currency_code || currencyCode)}</option>
              ))}
            </select>
            <select value={advanceAccountId} onChange={(event) => setAdvanceAccountId(event.target.value)} className="rounded-xl border border-white/10 bg-black px-4 py-3 text-sm">
              <option value="">Petty cash advance / clearing asset</option>
              {advanceAccounts.map((row) => (
                <option key={row.id} value={row.id}>{row.account_code} · {row.account_name}</option>
              ))}
            </select>
            <select value={replenishSourceLocationId} onChange={(event) => setReplenishSourceLocationId(event.target.value)} className="rounded-xl border border-white/10 bg-black px-4 py-3 text-sm">
              <option value="">Replenishment source</option>
              {replenishSources.filter((row) => row.id !== cashLocationId).map((row) => (
                <option key={row.id} value={row.id}>{row.name}</option>
              ))}
            </select>
            <input type="number" min="0" step="0.01" value={targetBalance} onChange={(event) => setTargetBalance(event.target.value)} placeholder="Target balance (optional)" className="rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-sm" />
            <button type="button" disabled={!actor?.can_manage || actionLoading === "configure"} onClick={configureFund} className="rounded-xl border border-[#D6A66A]/40 px-4 py-3 text-sm font-semibold text-[#E8C98D] disabled:opacity-35">
              {actionLoading === "configure" ? "Saving..." : "Configure controlled fund"}
            </button>
          </div>
        </div>

        <div className="rounded-2xl border border-white/10 bg-black/20 p-5">
          <div className="flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-white/35">
            <Coins size={14} /> New request
          </div>
          <select value={requestFundId} onChange={(event) => setRequestFundId(event.target.value)} className="mt-3 w-full rounded-xl border border-white/10 bg-black px-4 py-3 text-sm">
            <option value="">Petty cash fund</option>
            {funds.map((fund) => {
              const location = locationMap.get(String(fund.cash_location_id));
              return <option key={fund.id} value={fund.id}>{location?.name || "Petty Cash"} · {formatMoney(location?.current_balance, fund.currency_code || currencyCode)}</option>;
            })}
          </select>
          <textarea rows={2} value={purpose} onChange={(event) => setPurpose(event.target.value)} placeholder="Business purpose" className="mt-3 w-full resize-none rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-sm" />
          <input type="number" min="0" step="0.01" value={requestedAmount} onChange={(event) => setRequestedAmount(event.target.value)} placeholder="Requested amount" className="mt-3 w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-sm" />
          <button type="button" disabled={!actor?.can_request || !funds.length || actionLoading === "request"} onClick={createRequest} className="mt-3 w-full rounded-xl bg-[#D6A66A] px-4 py-3 text-sm font-semibold text-black disabled:opacity-35">
            {actionLoading === "request" ? "Submitting..." : "Submit petty cash request"}
          </button>
        </div>
      </div>

      <div className="mt-6 space-y-4">
        <div className="text-xs uppercase tracking-[0.18em] text-white/35">Lifecycle evidence</div>
        {loading ? (
          <div className="rounded-2xl border border-white/10 p-5 text-sm text-white/35">Loading petty cash...</div>
        ) : requests.length ? (
          requests.map((request) => {
            const disbursement = disbursementByRequest.get(String(request.id));
            const receiptTotal = disbursement ? numeric(receiptTotals.get(String(disbursement.id))) : 0;
            const status = String(request.status || "").toUpperCase();
            const decisionDraft = decisionByRequest[request.id] || {};
            const receiptDraft = disbursement ? receiptByDisbursement[disbursement.id] || {} : {};
            const settlementDraft = disbursement ? settlementByDisbursement[disbursement.id] || {} : {};

            return (
              <div key={request.id} className="rounded-2xl border border-white/10 bg-black/20 p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="font-semibold">{request.purpose}</div>
                    <div className="mt-1 text-xs text-white/35">{request.requested_at ? new Date(request.requested_at).toLocaleString() : request.id}</div>
                  </div>
                  <div className="text-right">
                    <div className="font-semibold text-[#E2C48A]">{formatMoney(request.approved_amount || request.requested_amount, request.currency_code || currencyCode)}</div>
                    <div className="mt-1 text-[10px] uppercase text-white/40">{status}</div>
                  </div>
                </div>

                {status === "PENDING" && actor?.can_manage ? (
                  <div className="mt-4 grid gap-2 sm:grid-cols-[0.4fr_1fr_auto_auto]">
                    <input type="number" min="0" step="0.01" value={decisionDraft.amount ?? request.requested_amount} onChange={(event) => setDecisionByRequest((current) => ({ ...current, [request.id]: { ...current[request.id], amount: event.target.value } }))} className="rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-xs" />
                    <input value={decisionDraft.notes || ""} onChange={(event) => setDecisionByRequest((current) => ({ ...current, [request.id]: { ...current[request.id], notes: event.target.value } }))} placeholder="Approval note / rejection reason" className="rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-xs" />
                    <button type="button" disabled={actionLoading === `decision:${request.id}`} onClick={() => decideRequest(request, "APPROVE")} className="rounded-xl border border-emerald-400/30 px-3 py-2 text-xs text-emerald-200 disabled:opacity-35">Approve</button>
                    <button type="button" disabled={actionLoading === `decision:${request.id}`} onClick={() => decideRequest(request, "REJECT")} className="rounded-xl border border-red-400/30 px-3 py-2 text-xs text-red-200 disabled:opacity-35">Reject</button>
                  </div>
                ) : null}

                {status === "APPROVED" && actor?.can_manage ? (
                  <button type="button" disabled={actionLoading === `disburse:${request.id}`} onClick={() => disburse(request)} className="mt-4 rounded-xl border border-[#D6A66A]/40 px-4 py-2.5 text-xs font-semibold text-[#E8C98D] disabled:opacity-35">Disburse approved amount</button>
                ) : null}

                {disbursement ? (
                  <div className="mt-4 rounded-xl border border-white/10 p-4">
                    <div className="flex flex-wrap justify-between gap-3 text-xs">
                      <span className="text-white/45">Disbursed {disbursement.disbursement_date} · {disbursement.status}</span>
                      <span className="text-white/60">Receipts {formatMoney(receiptTotal, disbursement.currency_code || currencyCode)} / {formatMoney(disbursement.amount, disbursement.currency_code || currencyCode)}</span>
                    </div>

                    {String(disbursement.status || "").toUpperCase() !== "SETTLED" ? (
                      <div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-4">
                        <select value={receiptDraft.expenseAccountId || ""} onChange={(event) => setReceiptByDisbursement((current) => ({ ...current, [disbursement.id]: { ...current[disbursement.id], expenseAccountId: event.target.value } }))} className="rounded-xl border border-white/10 bg-black px-3 py-2 text-xs">
                          <option value="">Expense / COGS account</option>
                          {expenseAccounts.map((row) => <option key={row.id} value={row.id}>{row.account_code} · {row.account_name}</option>)}
                        </select>
                        <input type="number" min="0" step="0.01" value={receiptDraft.amount || ""} onChange={(event) => setReceiptByDisbursement((current) => ({ ...current, [disbursement.id]: { ...current[disbursement.id], amount: event.target.value } }))} placeholder="Receipt amount" className="rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-xs" />
                        <input value={receiptDraft.receiptReference || ""} onChange={(event) => setReceiptByDisbursement((current) => ({ ...current, [disbursement.id]: { ...current[disbursement.id], receiptReference: event.target.value } }))} placeholder="Receipt reference" className="rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-xs" />
                        <input value={receiptDraft.evidenceUrl || ""} onChange={(event) => setReceiptByDisbursement((current) => ({ ...current, [disbursement.id]: { ...current[disbursement.id], evidenceUrl: event.target.value } }))} placeholder="Evidence URL" className="rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-xs" />
                        <input value={receiptDraft.supplier || ""} onChange={(event) => setReceiptByDisbursement((current) => ({ ...current, [disbursement.id]: { ...current[disbursement.id], supplier: event.target.value } }))} placeholder="Supplier (optional)" className="rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-xs" />
                        <input type="date" value={receiptDraft.receiptDate || today()} onChange={(event) => setReceiptByDisbursement((current) => ({ ...current, [disbursement.id]: { ...current[disbursement.id], receiptDate: event.target.value } }))} className="rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-xs" />
                        <button type="button" disabled={actionLoading === `receipt:${disbursement.id}`} onClick={() => addReceipt(disbursement)} className="rounded-xl border border-white/15 px-3 py-2 text-xs disabled:opacity-35">Add receipt evidence</button>
                      </div>
                    ) : null}

                    {String(disbursement.status || "").toUpperCase() === "EVIDENCE_SUBMITTED" && actor?.can_settle ? (
                      <div className="mt-4 grid gap-2 sm:grid-cols-[0.5fr_1fr_auto]">
                        <input type="date" value={settlementDraft.date || today()} onChange={(event) => setSettlementByDisbursement((current) => ({ ...current, [disbursement.id]: { ...current[disbursement.id], date: event.target.value } }))} className="rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-xs" />
                        <input value={settlementDraft.reference || ""} onChange={(event) => setSettlementByDisbursement((current) => ({ ...current, [disbursement.id]: { ...current[disbursement.id], reference: event.target.value } }))} placeholder="Settlement reference" className="rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-xs" />
                        <button type="button" disabled={actionLoading === `settle:${disbursement.id}`} onClick={() => settle(disbursement)} className="rounded-xl border border-emerald-400/30 px-3 py-2 text-xs text-emerald-200 disabled:opacity-35">Finance settle</button>
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>
            );
          })
        ) : (
          <div className="rounded-2xl border border-white/10 p-5 text-sm text-white/35">No petty cash requests recorded.</div>
        )}
      </div>

      {funds.length && actor?.can_manage ? (
        <div className="mt-6 grid gap-4 xl:grid-cols-2">
          {funds.map((fund) => {
            const location = locationMap.get(String(fund.cash_location_id));
            const draft = replenishByFund[fund.id] || {};
            const recent = replenishments.filter((row) => row.fund_id === fund.id).slice(0, 3);
            return (
              <div key={fund.id} className="rounded-2xl border border-white/10 bg-black/20 p-5">
                <div className="flex justify-between gap-3">
                  <div>
                    <div className="text-xs uppercase tracking-[0.18em] text-white/35">Replenish fund</div>
                    <div className="mt-2 font-semibold">{location?.name || "Petty Cash"}</div>
                  </div>
                  <div className="font-semibold text-[#E2C48A]">{formatMoney(location?.current_balance, fund.currency_code || currencyCode)}</div>
                </div>
                <div className="mt-3 grid gap-2 sm:grid-cols-[0.5fr_1fr_auto]">
                  <input type="number" min="0" step="0.01" value={draft.amount || ""} onChange={(event) => setReplenishByFund((current) => ({ ...current, [fund.id]: { ...current[fund.id], amount: event.target.value } }))} placeholder="Amount" className="rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-xs" />
                  <input value={draft.reason || ""} onChange={(event) => setReplenishByFund((current) => ({ ...current, [fund.id]: { ...current[fund.id], reason: event.target.value } }))} placeholder="Replenishment reason" className="rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-xs" />
                  <button type="button" disabled={actionLoading === `replenish:${fund.id}`} onClick={() => replenish(fund)} className="rounded-xl border border-[#D6A66A]/40 px-3 py-2 text-xs text-[#E8C98D] disabled:opacity-35">Replenish</button>
                </div>
                {recent.length ? <div className="mt-3 text-[10px] text-white/25">Last replenishment: {formatMoney(recent[0].amount, recent[0].currency_code || currencyCode)} · {recent[0].reason}</div> : null}
              </div>
            );
          })}
        </div>
      ) : null}
    </article>
  );
}
