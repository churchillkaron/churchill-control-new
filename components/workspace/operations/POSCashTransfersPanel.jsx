"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowRightLeft, Plus, RefreshCw } from "lucide-react";

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

const TRANSFER_TYPES = [
  { value: "DRAWER_TO_LOCATION", label: "Drawer → Location" },
  { value: "LOCATION_TO_DRAWER", label: "Location → Drawer" },
  { value: "LOCATION_TO_LOCATION", label: "Location → Location" },
];

const LOCATION_TYPES = ["SAFE", "PETTY_CASH", "CASH_OFFICE", "BANK_DEPOSIT", "OTHER"];

export default function POSCashTransfersPanel({
  organizationId,
  entityId,
  applicationId,
  currencyCode,
  activeSessionId,
  onChanged,
}) {
  const [actor, setActor] = useState(null);
  const [locations, setLocations] = useState([]);
  const [transfers, setTransfers] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [activeSession, setActiveSession] = useState(null);
  const [transferType, setTransferType] = useState("DRAWER_TO_LOCATION");
  const [sourceLocationId, setSourceLocationId] = useState("");
  const [destinationLocationId, setDestinationLocationId] = useState("");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [newLocationName, setNewLocationName] = useState("");
  const [newLocationType, setNewLocationType] = useState("SAFE");
  const [newLocationAccountId, setNewLocationAccountId] = useState("");
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState(null);

  const locationMap = useMemo(
    () => new Map(locations.map((location) => [String(location.id), location])),
    [locations]
  );

  const load = useCallback(async () => {
    if (!organizationId || !entityId || !applicationId) return;
    setLoading(true);
    setError(null);
    try {
      const search = new URLSearchParams({ organizationId, entityId, applicationId });
      const response = await fetch(`/api/pos/cash-transfers?${search.toString()}`, {
        cache: "no-store",
        credentials: "include",
      });
      const result = await readJson(response);
      if (!response.ok || result.success === false) {
        throw new Error(result.error || "Unable to load controlled cash transfers");
      }
      const nextLocations = result.locations || [];
      const nextAccounts = result.available_finance_accounts || [];
      setActor(result.actor || null);
      setLocations(nextLocations);
      setTransfers(result.transfers || []);
      setAccounts(nextAccounts);
      setActiveSession(result.active_cash_session || null);
      setSourceLocationId((current) => current || nextLocations[0]?.id || "");
      setDestinationLocationId((current) => current || nextLocations[0]?.id || "");
      setNewLocationAccountId((current) => current || nextAccounts[0]?.id || "");
    } catch (loadError) {
      setError(loadError.message);
    } finally {
      setLoading(false);
    }
  }, [applicationId, entityId, organizationId]);

  useEffect(() => {
    load();
  }, [load]);

  async function post(body) {
    const response = await fetch("/api/pos/cash-transfers", {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": `operations-cash:${crypto.randomUUID()}`,
      },
      body: JSON.stringify({ organizationId, entityId, applicationId, ...body }),
    });
    const result = await readJson(response);
    if (!response.ok || result.success === false) {
      throw new Error(result.error || "Controlled cash action failed");
    }
    return result;
  }

  async function createLocation() {
    if (!newLocationName.trim() || !newLocationAccountId) {
      setError("Location name and Finance cash account are required.");
      return;
    }
    setActionLoading(true);
    setError(null);
    try {
      await post({
        action: "CREATE_LOCATION",
        name: newLocationName.trim(),
        locationType: newLocationType,
        financeAccountId: newLocationAccountId,
      });
      setNewLocationName("");
      setNewLocationAccountId("");
      await load();
    } catch (actionError) {
      setError(actionError.message);
    } finally {
      setActionLoading(false);
    }
  }

  async function executeTransfer() {
    const transferAmount = numeric(amount);
    const drawerId = activeSessionId || activeSession?.id || null;
    if (transferAmount <= 0 || !reason.trim()) {
      setError("Amount greater than zero and a business reason are required.");
      return;
    }
    if (transferType === "DRAWER_TO_LOCATION" && (!drawerId || !destinationLocationId)) {
      setError("An open drawer and destination location are required.");
      return;
    }
    if (transferType === "LOCATION_TO_DRAWER" && (!drawerId || !sourceLocationId)) {
      setError("A source location and open drawer are required.");
      return;
    }
    if (
      transferType === "LOCATION_TO_LOCATION" &&
      (!sourceLocationId || !destinationLocationId || sourceLocationId === destinationLocationId)
    ) {
      setError("Select two different controlled cash locations.");
      return;
    }

    setActionLoading(true);
    setError(null);
    try {
      await post({
        action: "TRANSFER",
        transferType,
        sourceLocationId:
          transferType === "DRAWER_TO_LOCATION" ? null : sourceLocationId,
        destinationLocationId:
          transferType === "LOCATION_TO_DRAWER" ? null : destinationLocationId,
        sourceCashSessionId: transferType === "DRAWER_TO_LOCATION" ? drawerId : null,
        destinationCashSessionId: transferType === "LOCATION_TO_DRAWER" ? drawerId : null,
        amount: transferAmount,
        reason: reason.trim(),
      });
      setAmount("");
      setReason("");
      await load();
      await onChanged?.();
    } catch (actionError) {
      setError(actionError.message);
    } finally {
      setActionLoading(false);
    }
  }

  return (
    <article className="rounded-[30px] border border-white/10 bg-white/[0.03] p-7 xl:col-span-2">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="text-xs uppercase tracking-[0.2em] text-[#D6A66A]">Cash custody</div>
          <h2 className="mt-2 text-2xl font-semibold">Safe, petty cash & controlled transfers</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-white/40">
            Move physical cash between the active drawer and controlled custody locations. Transfers preserve revenue, create immutable Operations evidence, and post asset-to-asset Finance journals.
          </p>
        </div>
        <button type="button" onClick={load} className="inline-flex items-center gap-2 rounded-xl border border-white/10 px-4 py-2 text-sm text-white/55">
          <RefreshCw size={14} /> Refresh
        </button>
      </div>

      <div className="mt-4 flex flex-wrap gap-2 text-[11px] text-white/40">
        <span className="rounded-full border border-white/10 px-3 py-1.5">Manager / Owner</span>
        <span className="rounded-full border border-white/10 px-3 py-1.5">No revenue impact</span>
        <span className="rounded-full border border-white/10 px-3 py-1.5">Finance evidence required</span>
        <span className="rounded-full border border-white/10 px-3 py-1.5">Live balance protection</span>
      </div>

      {error ? <div className="mt-4 rounded-xl border border-red-400/20 bg-red-500/10 p-3 text-sm text-red-100">{error}</div> : null}
      {!actor?.can_control_cash ? <div className="mt-4 rounded-xl border border-white/10 p-3 text-sm text-white/40">Manager or owner authority is required for cash custody controls.</div> : null}

      <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {locations.length ? locations.map((location) => (
          <div key={location.id} className="rounded-2xl border border-white/10 bg-black/20 p-4">
            <div className="text-[10px] uppercase tracking-[0.18em] text-white/30">{String(location.location_type || "").replaceAll("_", " ")}</div>
            <div className="mt-2 font-semibold">{location.name}</div>
            <div className="mt-3 text-xl font-semibold text-[#E2C48A]">{formatMoney(location.current_balance, location.currency_code || currencyCode)}</div>
          </div>
        )) : <div className="rounded-2xl border border-white/10 p-4 text-sm text-white/35 sm:col-span-2">No controlled cash locations yet. Create a safe or petty-cash location below.</div>}
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <div className="rounded-2xl border border-white/10 bg-black/20 p-5">
          <div className="text-xs uppercase tracking-[0.18em] text-white/35">Move cash</div>
          <select value={transferType} onChange={(event) => setTransferType(event.target.value)} className="mt-3 w-full rounded-xl border border-white/10 bg-black px-4 py-3 text-sm outline-none">
            {TRANSFER_TYPES.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}
          </select>

          {transferType !== "DRAWER_TO_LOCATION" ? (
            <select value={sourceLocationId} onChange={(event) => setSourceLocationId(event.target.value)} className="mt-3 w-full rounded-xl border border-white/10 bg-black px-4 py-3 text-sm outline-none">
              <option value="">Source location</option>
              {locations.map((location) => <option key={location.id} value={location.id}>{location.name} · {formatMoney(location.current_balance, location.currency_code || currencyCode)}</option>)}
            </select>
          ) : null}

          {transferType !== "LOCATION_TO_DRAWER" ? (
            <select value={destinationLocationId} onChange={(event) => setDestinationLocationId(event.target.value)} className="mt-3 w-full rounded-xl border border-white/10 bg-black px-4 py-3 text-sm outline-none">
              <option value="">Destination location</option>
              {locations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}
            </select>
          ) : null}

          <input type="number" min="0" step="0.01" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="Amount" className="mt-3 w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-sm outline-none" />
          <textarea value={reason} onChange={(event) => setReason(event.target.value)} rows={2} placeholder="Required business reason" className="mt-3 w-full resize-none rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-sm outline-none" />
          <button type="button" disabled={actionLoading || !actor?.can_control_cash} onClick={executeTransfer} className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#D6A66A] px-4 py-3 text-sm font-semibold text-black disabled:opacity-35">
            <ArrowRightLeft size={15} /> {actionLoading ? "Posting..." : "Post transfer"}
          </button>
          {!activeSessionId && transferType !== "LOCATION_TO_LOCATION" ? <div className="mt-3 text-xs text-amber-100/60">Open a drawer before transferring to or from the POS.</div> : null}
        </div>

        <div className="rounded-2xl border border-white/10 bg-black/20 p-5">
          <div className="text-xs uppercase tracking-[0.18em] text-white/35">Create custody location</div>
          <input value={newLocationName} onChange={(event) => setNewLocationName(event.target.value)} placeholder="e.g. Main Safe" className="mt-3 w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-sm outline-none" />
          <select value={newLocationType} onChange={(event) => setNewLocationType(event.target.value)} className="mt-3 w-full rounded-xl border border-white/10 bg-black px-4 py-3 text-sm outline-none">
            {LOCATION_TYPES.map((type) => <option key={type} value={type}>{type.replaceAll("_", " ")}</option>)}
          </select>
          <select value={newLocationAccountId} onChange={(event) => setNewLocationAccountId(event.target.value)} className="mt-3 w-full rounded-xl border border-white/10 bg-black px-4 py-3 text-sm outline-none">
            <option value="">Finance cash asset account</option>
            {accounts.map((account) => <option key={account.id} value={account.id}>{account.account_code} · {account.account_name}</option>)}
          </select>
          <button type="button" disabled={actionLoading || !actor?.can_control_cash || !newLocationName.trim() || !newLocationAccountId} onClick={createLocation} className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-[#D6A66A]/40 px-4 py-3 text-sm font-semibold text-[#E8C98D] disabled:opacity-35">
            <Plus size={15} /> Create location
          </button>
          <div className="mt-3 text-xs leading-5 text-white/30">Each custody location uses its own active Finance asset account. Petty-cash spending is a separate expense workflow; this control only moves custody.</div>
        </div>
      </div>

      <div className="mt-6 text-xs uppercase tracking-[0.18em] text-white/35">Transfer evidence</div>
      <div className="mt-3 max-h-[420px] space-y-3 overflow-y-auto pr-1">
        {loading ? <div className="rounded-2xl border border-white/10 p-4 text-sm text-white/35">Loading transfers...</div> : transfers.length ? transfers.map((transfer) => {
          const source = locationMap.get(String(transfer.source_location_id));
          const destination = locationMap.get(String(transfer.destination_location_id));
          const sourceName = transfer.source_cash_session_id ? "POS Drawer" : source?.name || "Cash location";
          const destinationName = transfer.destination_cash_session_id ? "POS Drawer" : destination?.name || "Cash location";
          return (
            <div key={transfer.id} className="rounded-2xl border border-white/10 bg-black/20 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="text-sm font-semibold">{sourceName} → {destinationName}</div>
                <div className="font-semibold text-[#E2C48A]">{formatMoney(transfer.amount, transfer.currency_code || currencyCode)}</div>
              </div>
              <div className="mt-2 text-xs text-white/45">{transfer.reason}</div>
              <div className="mt-2 flex flex-wrap gap-3 text-[10px] text-white/25"><span>{transfer.created_at ? new Date(transfer.created_at).toLocaleString() : transfer.id}</span><span>Journal {String(transfer.journal_entry_id || "").slice(0, 8)}</span></div>
            </div>
          );
        }) : <div className="rounded-2xl border border-white/10 p-4 text-sm text-white/35">No controlled cash transfers recorded.</div>}
      </div>
    </article>
  );
}
