"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Landmark, RefreshCw, ShieldCheck } from "lucide-react";

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

async function readJson(response) {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return { success: false, error: text };
  }
}

export default function POSBankDepositsPanel({
  organizationId,
  entityId,
  applicationId,
  currencyCode,
  onChanged,
}) {
  const [actor, setActor] = useState(null);
  const [deposits, setDeposits] = useState([]);
  const [sources, setSources] = useState([]);
  const [transitLocations, setTransitLocations] = useState([]);
  const [banks, setBanks] = useState([]);
  const [canConfirm, setCanConfirm] = useState(false);
  const [sourceLocationId, setSourceLocationId] = useState("");
  const [transitLocationId, setTransitLocationId] = useState("");
  const [bankAccountId, setBankAccountId] = useState("");
  const [amount, setAmount] = useState("");
  const [depositDate, setDepositDate] = useState(() =>
    new Date().toISOString().slice(0, 10)
  );
  const [depositReference, setDepositReference] = useState("");
  const [evidenceUrl, setEvidenceUrl] = useState("");
  const [notes, setNotes] = useState("");
  const [confirmationByDeposit, setConfirmationByDeposit] = useState({});
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(null);
  const [error, setError] = useState(null);

  const bankMap = useMemo(
    () => new Map(banks.map((bank) => [String(bank.id), bank])),
    [banks]
  );

  const locationMap = useMemo(
    () =>
      new Map(
        [...sources, ...transitLocations].map((location) => [
          String(location.id),
          location,
        ])
      ),
    [sources, transitLocations]
  );

  const load = useCallback(async () => {
    if (!organizationId || !entityId || !applicationId) return;
    setLoading(true);
    setError(null);
    try {
      const search = new URLSearchParams({
        organizationId,
        entityId,
        applicationId,
      });
      const financeSearch = new URLSearchParams({ organizationId });
      const [depositResponse, financeResponse] = await Promise.all([
        fetch(`/api/pos/bank-deposits?${search.toString()}`, {
          cache: "no-store",
          credentials: "include",
        }),
        fetch(`/api/finance/bank-deposits/confirm?${financeSearch.toString()}`, {
          cache: "no-store",
          credentials: "include",
        }),
      ]);

      const [result, financeResult] = await Promise.all([
        readJson(depositResponse),
        readJson(financeResponse),
      ]);

      if (!depositResponse.ok || result.success === false) {
        throw new Error(result.error || "Unable to load bank deposits");
      }

      const nextSources = result.source_locations || [];
      const nextTransit = result.transit_locations || [];
      const nextBanks = result.bank_accounts || [];

      setActor(result.actor || null);
      setDeposits(result.deposits || []);
      setSources(nextSources);
      setTransitLocations(nextTransit);
      setBanks(nextBanks);
      setCanConfirm(
        Boolean(financeResponse.ok && financeResult?.success && financeResult?.can_confirm)
      );
      setSourceLocationId((current) => current || nextSources[0]?.id || "");
      setTransitLocationId((current) => current || nextTransit[0]?.id || "");
      setBankAccountId((current) => current || nextBanks[0]?.id || "");
    } catch (loadError) {
      setError(loadError.message);
    } finally {
      setLoading(false);
    }
  }, [applicationId, entityId, organizationId]);

  useEffect(() => {
    load();
  }, [load]);

  async function submitDeposit() {
    if (
      !sourceLocationId ||
      !transitLocationId ||
      !bankAccountId ||
      numeric(amount) <= 0 ||
      !depositDate ||
      !depositReference.trim()
    ) {
      setError(
        "Source, transit location, bank account, amount, date and deposit reference are required."
      );
      return;
    }

    setActionLoading("submit");
    setError(null);
    try {
      const response = await fetch("/api/pos/bank-deposits", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": `operations-bank-deposit:${crypto.randomUUID()}`,
        },
        body: JSON.stringify({
          organizationId,
          entityId,
          applicationId,
          sourceLocationId,
          transitLocationId,
          bankAccountId,
          amount: numeric(amount),
          depositDate,
          depositReference: depositReference.trim(),
          evidenceUrl: evidenceUrl.trim() || null,
          notes: notes.trim() || null,
        }),
      });
      const result = await readJson(response);
      if (!response.ok || result.success === false) {
        throw new Error(result.error || "Bank deposit submission failed");
      }
      setAmount("");
      setDepositReference("");
      setEvidenceUrl("");
      setNotes("");
      await load();
      await onChanged?.();
    } catch (actionError) {
      setError(actionError.message);
    } finally {
      setActionLoading(null);
    }
  }

  async function confirmDeposit(deposit) {
    const confirmationReference = String(
      confirmationByDeposit[deposit.id] || ""
    ).trim();
    if (!confirmationReference) {
      setError("Bank confirmation reference is required.");
      return;
    }

    setActionLoading(`confirm:${deposit.id}`);
    setError(null);
    try {
      const response = await fetch("/api/finance/bank-deposits/confirm", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": `finance-bank-deposit:${deposit.id}:${crypto.randomUUID()}`,
        },
        body: JSON.stringify({
          organizationId,
          entityId,
          depositId: deposit.id,
          confirmationReference,
        }),
      });
      const result = await readJson(response);
      if (!response.ok || result.success === false) {
        throw new Error(result.error || "Finance confirmation failed");
      }
      setConfirmationByDeposit((current) => ({
        ...current,
        [deposit.id]: "",
      }));
      await load();
      await onChanged?.();
    } catch (actionError) {
      setError(actionError.message);
    } finally {
      setActionLoading(null);
    }
  }

  return (
    <article className="rounded-[30px] border border-white/10 bg-white/[0.03] p-7 xl:col-span-2">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="text-xs uppercase tracking-[0.2em] text-[#D6A66A]">
            Bank deposits
          </div>
          <h2 className="mt-2 text-2xl font-semibold">
            Safe → Deposit in Transit → Bank
          </h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-white/40">
            Operations records physical custody leaving the safe. Finance confirms the bank receipt, posts Deposit in Transit to Bank, and existing bank reconciliation later matches the ledger to statement evidence.
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
        <span className="rounded-full border border-white/10 px-3 py-1.5">Manager submits</span>
        <span className="rounded-full border border-white/10 px-3 py-1.5">Finance confirms</span>
        <span className="rounded-full border border-white/10 px-3 py-1.5">No revenue impact</span>
        <span className="rounded-full border border-white/10 px-3 py-1.5">Statement reconciliation remains Finance-owned</span>
      </div>

      {error ? (
        <div className="mt-4 rounded-xl border border-red-400/20 bg-red-500/10 p-3 text-sm text-red-100">
          {error}
        </div>
      ) : null}

      {!banks.length ? (
        <div className="mt-5 rounded-2xl border border-amber-300/20 bg-amber-300/[0.06] p-4 text-sm text-amber-100/80">
          <strong>Bank master required.</strong> A real bank account must be configured for this legal entity before deposits can be submitted or confirmed. The system will not invent bank details.
        </div>
      ) : null}

      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <div className="rounded-2xl border border-white/10 bg-black/20 p-5">
          <div className="flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-white/35">
            <Landmark size={14} /> Submit physical deposit
          </div>

          <select value={sourceLocationId} onChange={(event) => setSourceLocationId(event.target.value)} className="mt-3 w-full rounded-xl border border-white/10 bg-black px-4 py-3 text-sm">
            <option value="">Source cash location</option>
            {sources.map((location) => (
              <option key={location.id} value={location.id}>
                {location.name} · {formatMoney(location.current_balance, location.currency_code || currencyCode)}
              </option>
            ))}
          </select>

          <select value={transitLocationId} onChange={(event) => setTransitLocationId(event.target.value)} className="mt-3 w-full rounded-xl border border-white/10 bg-black px-4 py-3 text-sm">
            <option value="">Deposit in Transit location</option>
            {transitLocations.map((location) => (
              <option key={location.id} value={location.id}>{location.name}</option>
            ))}
          </select>

          <select value={bankAccountId} onChange={(event) => setBankAccountId(event.target.value)} className="mt-3 w-full rounded-xl border border-white/10 bg-black px-4 py-3 text-sm">
            <option value="">Target bank account</option>
            {banks.map((bank) => (
              <option key={bank.id} value={bank.id}>
                {bank.bank_name} · {bank.account_name}{bank.account_number ? ` · ${bank.account_number}` : ""}
              </option>
            ))}
          </select>

          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <input type="number" min="0" step="0.01" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="Amount" className="rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-sm" />
            <input type="date" value={depositDate} onChange={(event) => setDepositDate(event.target.value)} className="rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-sm" />
          </div>
          <input value={depositReference} onChange={(event) => setDepositReference(event.target.value)} placeholder="Deposit slip / bank reference" className="mt-3 w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-sm" />
          <input value={evidenceUrl} onChange={(event) => setEvidenceUrl(event.target.value)} placeholder="Evidence URL (optional)" className="mt-3 w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-sm" />
          <textarea rows={2} value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Notes (optional)" className="mt-3 w-full resize-none rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-sm" />
          <button type="button" disabled={actionLoading === "submit" || !actor?.can_submit || !banks.length || !transitLocations.length} onClick={submitDeposit} className="mt-3 w-full rounded-xl bg-[#D6A66A] px-4 py-3 text-sm font-semibold text-black disabled:opacity-35">
            {actionLoading === "submit" ? "Submitting..." : "Submit bank deposit"}
          </button>
        </div>

        <div className="rounded-2xl border border-white/10 bg-black/20 p-5">
          <div className="flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-white/35">
            <ShieldCheck size={14} /> Deposit evidence
          </div>
          <div className="mt-3 max-h-[520px] space-y-3 overflow-y-auto pr-1">
            {loading ? (
              <div className="text-sm text-white/35">Loading deposits...</div>
            ) : deposits.length ? (
              deposits.map((deposit) => {
                const bank = bankMap.get(String(deposit.bank_account_id));
                const source = locationMap.get(String(deposit.source_location_id));
                const confirmed = String(deposit.status || "").toUpperCase() === "CONFIRMED";
                return (
                  <div key={deposit.id} className="rounded-2xl border border-white/10 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <div className="text-sm font-semibold">{source?.name || "Cash location"} → {bank?.bank_name || "Bank"}</div>
                        <div className="mt-1 text-xs text-white/35">{deposit.deposit_reference} · {deposit.deposit_date}</div>
                      </div>
                      <div className="text-right">
                        <div className="font-semibold text-[#E2C48A]">{formatMoney(deposit.amount, deposit.currency_code || currencyCode)}</div>
                        <div className={confirmed ? "mt-1 text-[10px] uppercase text-emerald-300" : "mt-1 text-[10px] uppercase text-amber-200"}>{deposit.status}</div>
                      </div>
                    </div>
                    {confirmed ? (
                      <div className="mt-3 text-xs text-white/35">Finance confirmed · {deposit.confirmation_reference || deposit.bank_ledger_id}</div>
                    ) : (
                      <div className="mt-3">
                        <input value={confirmationByDeposit[deposit.id] || ""} onChange={(event) => setConfirmationByDeposit((current) => ({ ...current, [deposit.id]: event.target.value }))} placeholder="Bank confirmation reference" className="w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-xs" />
                        <button type="button" disabled={!canConfirm || !bank?.finance_account_id || actionLoading === `confirm:${deposit.id}`} onClick={() => confirmDeposit(deposit)} className="mt-2 w-full rounded-xl border border-[#D6A66A]/40 px-3 py-2 text-xs font-semibold text-[#E8C98D] disabled:opacity-35">
                          {actionLoading === `confirm:${deposit.id}` ? "Confirming..." : bank?.finance_account_id ? "Finance confirm bank receipt" : "Bank Finance mapping required"}
                        </button>
                      </div>
                    )}
                  </div>
                );
              })
            ) : (
              <div className="text-sm text-white/35">No bank deposits recorded yet.</div>
            )}
          </div>
        </div>
      </div>
    </article>
  );
}
