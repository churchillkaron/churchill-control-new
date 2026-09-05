"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";

import {
  HotelEmptyState,
  HotelError,
  HotelField,
  HotelMetric,
  HotelPrimaryAction,
  HotelSecondaryAction,
  HotelSection,
  HotelStatusPill,
  HotelSuccess,
  HotelWorkspaceShell,
  hotelInputClass,
} from "@/components/workspace/hotel/HotelWorkspaceUI";

async function api(url, options) {
  const response = await fetch(url, { cache: "no-store", credentials: "include", ...options });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.success === false) {
    const error = new Error(payload.error || "Request failed");
    error.blocker = payload.blocker || null;
    throw error;
  }
  return payload;
}

function money(value, currency = "THB") {
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 2 }).format(Number(value || 0));
  } catch {
    return `${Number(value || 0).toFixed(2)} ${currency}`;
  }
}

export default function HotelPaymentsPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const organizationId = String(params?.organizationId || "");
  const [properties, setProperties] = useState([]);
  const [propertyId, setPropertyId] = useState("");
  const [stays, setStays] = useState({ bookings: [], guests: [] });
  const [transactions, setTransactions] = useState([]);
  const [bookingId, setBookingId] = useState("");
  const [transactionType, setTransactionType] = useState("PAYMENT");
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [refundAmounts, setRefundAmounts] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    api(`/api/hotel/properties/list?organizationId=${encodeURIComponent(organizationId)}`)
      .then((payload) => {
        const list = payload.properties || [];
        setProperties(list);
        setPropertyId((current) => current || list[0]?.id || "");
      })
      .catch((reason) => setError(reason.message));
  }, [organizationId]);

  const load = useCallback(async () => {
    if (!propertyId) { setLoading(false); return; }
    setLoading(true); setError("");
    try {
      const query = `organizationId=${encodeURIComponent(organizationId)}&propertyId=${encodeURIComponent(propertyId)}`;
      const [stayPayload, paymentPayload] = await Promise.all([
        api(`/api/hotel/stays?${query}`),
        api(`/api/hotel/payments?${query}`),
      ]);
      setStays(stayPayload);
      setTransactions(paymentPayload.transactions || []);
      const requestedBooking = searchParams?.get("bookingId") || "";
      setBookingId((current) => {
        if (requestedBooking && stayPayload.bookings?.some((item) => item.id === requestedBooking)) return requestedBooking;
        if (current && stayPayload.bookings?.some((item) => item.id === current)) return current;
        return stayPayload.bookings?.[0]?.id || "";
      });
    } catch (reason) {
      setError(reason.message);
    } finally {
      setLoading(false);
    }
  }, [organizationId, propertyId, searchParams]);

  useEffect(() => { load(); }, [load]);

  const guestById = useMemo(() => new Map((stays.guests || []).map((guest) => [guest.id, guest])), [stays.guests]);
  const booking = (stays.bookings || []).find((item) => item.id === bookingId) || null;
  const guest = booking ? guestById.get(booking.guest_id) : null;
  const bookingTransactions = useMemo(() => transactions.filter((item) => item.booking_id === bookingId), [transactions, bookingId]);
  const settled = transactions.filter((item) => item.status === "SETTLED");
  const pending = transactions.filter((item) => item.status === "PENDING");
  const failed = transactions.filter((item) => item.status === "FAILED");
  const settledWithoutFinance = settled.filter((item) => !item.finance_payment_id);
  const collected = transactions
    .filter((item) => item.status === "SETTLED" && ["PAYMENT", "DEPOSIT"].includes(item.transaction_type))
    .reduce((sum, item) => sum + Number(item.applied_amount || 0), 0);

  useEffect(() => {
    if (!booking) return;
    const balance = Math.max(Number(booking.total_amount || 0) - Number(booking.paid_amount || 0), 0);
    setAmount(balance > 0 ? String(balance) : "");
    setDescription("");
  }, [bookingId, booking?.total_amount, booking?.paid_amount]);

  async function collect() {
    if (!booking || !amount) return;
    setSaving(true); setError(""); setSuccess("");
    try {
      const payload = await api("/api/hotel/payments", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          organizationId,
          bookingId: booking.id,
          action: "CREATE_CHECKOUT",
          transactionType,
          amount: Number(amount),
          description,
          idempotencyKey: crypto.randomUUID(),
        }),
      });
      if (!payload.checkoutUrl) throw new Error("Payment provider did not return a hosted checkout URL");
      window.location.assign(payload.checkoutUrl);
    } catch (reason) {
      setError(reason.message);
    } finally {
      setSaving(false);
    }
  }

  async function refund(transaction) {
    const refundAmount = Number(refundAmounts[transaction.id] || 0);
    if (!refundAmount) return;
    setSaving(true); setError(""); setSuccess("");
    try {
      const payload = await api("/api/hotel/payments", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          organizationId,
          bookingId: transaction.booking_id,
          action: "REFUND",
          transactionId: transaction.id,
          amount: refundAmount,
          idempotencyKey: crypto.randomUUID(),
        }),
      });
      setRefundAmounts((current) => ({ ...current, [transaction.id]: "" }));
      setSuccess(payload.refund?.status === "succeeded"
        ? "Refund confirmed by the gateway and atomically posted to Finance and the Hotel folio."
        : "Refund submitted. Avantiqo keeps it pending until gateway confirmation and Finance reconciliation complete.");
      await load();
    } catch (reason) {
      setError(reason.message);
    } finally {
      setSaving(false);
    }
  }

  const paymentReturn = searchParams?.get("paymentReturn");

  return (
    <HotelWorkspaceShell
      organizationId={organizationId}
      active="payments"
      eyebrow="Guest settlement"
      title="Hotel Payments"
      subtitle="Collect deposits and stay payments through hosted checkout, post confirmed settlement into Finance and the guest folio, and refund only against the original processed payment. Raw card data never enters Avantiqo."
      context={properties.find((item) => item.id === propertyId)?.name || "Choose property"}
      actions={<HotelSecondaryAction onClick={load} disabled={loading}>Refresh</HotelSecondaryAction>}
    >
      <HotelError>{error}</HotelError>
      <HotelSuccess>{success || (paymentReturn === "success" ? "The guest returned from hosted checkout. Settlement appears only after the signed gateway event and Finance posting both succeed." : paymentReturn === "cancelled" ? "Hosted checkout was cancelled. No Hotel or Finance settlement is posted." : "")}</HotelSuccess>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <HotelMetric label="Gateway settled" value={settled.length} detail={`${money(collected, booking?.currency_code || "THB")} net applied`} />
        <HotelMetric label="Pending" value={pending.length} detail="Gateway / Finance reconciliation" attention={pending.length > 0} />
        <HotelMetric label="Failed" value={failed.length} detail="Needs operator attention" attention={failed.length > 0} />
        <HotelMetric label="Finance posted" value={settled.length ? `${settled.length - settledWithoutFinance.length}/${settled.length}` : "—"} detail="Settled transactions with Finance evidence" attention={settledWithoutFinance.length > 0} />
      </div>

      <HotelSection eyebrow="Scope" title="Choose property and stay" detail="Payment context is bound to organization, property, guest party, legal entity, settlement bank account and customer-deposit liability before checkout can start.">
        <div className="grid gap-3 p-4 md:grid-cols-2 md:p-5">
          <HotelField label="Property"><select className={hotelInputClass} value={propertyId} onChange={(event) => { setPropertyId(event.target.value); setBookingId(""); }}><option value="">Select property</option>{properties.map((property) => <option key={property.id} value={property.id}>{property.name}</option>)}</select></HotelField>
          <HotelField label="Stay"><select className={hotelInputClass} value={bookingId} onChange={(event) => setBookingId(event.target.value)}><option value="">Select stay</option>{(stays.bookings || []).map((item) => { const itemGuest = guestById.get(item.guest_id); return <option key={item.id} value={item.id}>{itemGuest?.full_name || "Guest"} · {item.booking_reference || item.id.slice(0, 8)} · {item.status}</option>; })}</select></HotelField>
        </div>
      </HotelSection>

      {!booking ? <HotelSection title="Settlement"><HotelEmptyState>{loading ? "Loading Hotel payments…" : "Choose a stay to collect or review payment."}</HotelEmptyState></HotelSection> : <>
        <div className="grid gap-4 xl:grid-cols-[minmax(330px,0.72fr)_minmax(0,1.28fr)]">
          <HotelSection eyebrow="Collect" title={guest?.full_name || "Guest payment"} detail={`${booking.booking_reference || "Reservation"} · ${booking.check_in_date} → ${booking.check_out_date}`} action={<HotelStatusPill value={booking.payment_status || "UNPAID"} />}>
            <div className="space-y-3 p-4 md:p-5">
              <div className="grid grid-cols-2 gap-2 rounded-xl border border-black/[0.06] bg-[#FBFAF7] p-3">
                <div><div className="text-[7px] uppercase tracking-[0.1em] text-[#938C84]">Stay total</div><div className="mt-1 text-[12px] font-semibold">{money(booking.total_amount, booking.currency_code)}</div></div>
                <div><div className="text-[7px] uppercase tracking-[0.1em] text-[#938C84]">Gateway applied</div><div className="mt-1 text-[12px] font-semibold">{money(booking.paid_amount, booking.currency_code)}</div></div>
              </div>
              <HotelField label="Purpose"><select className={hotelInputClass} value={transactionType} onChange={(event) => setTransactionType(event.target.value)}><option value="PAYMENT">Stay payment</option><option value="DEPOSIT">Deposit</option></select></HotelField>
              <HotelField label={`Amount · ${booking.currency_code || "THB"}`}><input className={hotelInputClass} inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} /></HotelField>
              <HotelField label="Description"><input className={hotelInputClass} value={description} onChange={(event) => setDescription(event.target.value)} placeholder={transactionType === "DEPOSIT" ? "Reservation deposit" : "Stay settlement"} /></HotelField>
              <HotelPrimaryAction disabled={saving || !amount || Number(amount) <= 0} onClick={collect}>{saving ? "Preparing…" : transactionType === "DEPOSIT" ? "Collect deposit securely" : "Collect payment securely"}</HotelPrimaryAction>
              <p className="text-[7px] leading-4 text-[#918B83]">Avantiqo opens hosted checkout. A signed gateway confirmation triggers one governed transaction that posts cash, guest-deposit liability, Finance prepayment and Hotel folio evidence together.</p>
            </div>
          </HotelSection>

          <HotelSection eyebrow="Settlement evidence" title="Transactions for this stay" detail="Processed gateway payments are kept separate from manually recorded external references.">
            {!bookingTransactions.length ? <HotelEmptyState>No gateway transactions for this stay.</HotelEmptyState> : <div className="divide-y divide-black/[0.05]">
              {bookingTransactions.map((transaction) => {
                const refundable = Math.max(Number(transaction.amount || 0) - Number(transaction.refunded_amount || 0), 0);
                const canRefund = transaction.status === "SETTLED" && ["PAYMENT", "DEPOSIT"].includes(transaction.transaction_type) && transaction.processor_mode === "AVANTIQO_GATEWAY" && Boolean(transaction.finance_payment_id) && refundable > 0.005;
                return <div key={transaction.id} className="grid gap-3 px-4 py-3 md:grid-cols-[minmax(170px,1fr)_105px_120px_minmax(180px,0.9fr)] md:items-center md:px-5">
                  <div><div className="text-[8px] font-semibold text-[#403C37]">{transaction.description || transaction.transaction_type}</div><div className="mt-0.5 text-[7px] text-[#918B83]">{transaction.provider || "External"} · {transaction.processor_mode === "AVANTIQO_GATEWAY" ? "Processed" : "Recorded"} · {new Date(transaction.created_at).toLocaleString()}</div></div>
                  <HotelStatusPill value={transaction.status} />
                  <div className="text-right text-[9px] font-semibold tabular-nums">{transaction.transaction_type === "REFUND" ? "+" : "−"}{money(transaction.amount, transaction.currency_code)}</div>
                  <div>{canRefund ? <div className="flex gap-2"><input className={hotelInputClass} inputMode="decimal" value={refundAmounts[transaction.id] || ""} onChange={(event) => setRefundAmounts((current) => ({ ...current, [transaction.id]: event.target.value }))} placeholder={`Max ${refundable.toFixed(2)}`} /><HotelSecondaryAction disabled={saving || !refundAmounts[transaction.id]} onClick={() => refund(transaction)}>Refund</HotelSecondaryAction></div> : <div className="text-[7px] text-[#918B83]">{transaction.transaction_type === "REFUND" ? `Original ${String(transaction.parent_transaction_id || "").slice(0, 8)} · ${transaction.finance_payment_id ? "Finance posted" : "Finance pending"}` : transaction.status === "SETTLED" ? `Applied ${money(transaction.applied_amount, transaction.currency_code)} · ${transaction.finance_payment_id ? "Finance posted" : "Finance missing"}` : transaction.failure_reason || "Awaiting confirmation"}</div>}</div>
                </div>;
              })}
            </div>}
          </HotelSection>
        </div>

        <HotelSection eyebrow="Governance" title="Settlement truth" detail="Processed guest money is only called settled when gateway evidence, Finance posting and Hotel folio reconciliation agree.">
          <div className="grid gap-3 p-4 sm:grid-cols-3 md:p-5">
            <div className="rounded-xl border border-black/[0.06] p-3"><HotelStatusPill value="READY" /><div className="mt-2 text-[8px] font-semibold">Gateway evidence</div><p className="mt-1 text-[7px] leading-4 text-[#918B83]">Signed webhook, provider IDs, idempotency and original-payment refund lineage.</p></div>
            <div className="rounded-xl border border-black/[0.06] p-3"><HotelStatusPill value="READY" /><div className="mt-2 text-[8px] font-semibold">Hotel folio settlement</div><p className="mt-1 text-[7px] leading-4 text-[#918B83]">Confirmed payments and refunds post exactly once and recompute booking payment status.</p></div>
            <div className="rounded-xl border border-black/[0.06] p-3"><HotelStatusPill value="READY" /><div className="mt-2 text-[8px] font-semibold">Finance journal</div><p className="mt-1 text-[7px] leading-4 text-[#918B83]">Payment: bank debit / deposit-liability credit. Refund: liability debit / bank credit. Partial refunds use governed unapplied-cash accounting.</p></div>
          </div>
        </HotelSection>
      </>}
    </HotelWorkspaceShell>
  );
}