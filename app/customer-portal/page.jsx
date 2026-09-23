"use client";

import { useEffect, useMemo, useState } from "react";
import { CalendarDays, CreditCard, FileText, History, Home, MessageSquare, RefreshCw, UserRound, WalletCards } from "lucide-react";

function money(value, currency) {
  const amount = Number(value || 0);
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency: currency || "THB" }).format(amount);
  } catch {
    return `${amount.toLocaleString()} ${currency || ""}`.trim();
  }
}

function dateTime(value) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString();
}

function quotationExpired(quote) {
  const validUntil = String(quote?.valid_until || "").slice(0, 10);
  if (!validUntil) return false;
  return validUntil < new Date().toISOString().slice(0, 10);
}

function bookingRequestFor(data, booking, action) {
  const bookingType = booking?.portal_kind === "hotel" ? "HOTEL" : "SERVICE";
  return (data?.booking_requests || []).find((request) =>
    request.booking_type === bookingType &&
    request.booking_id === booking?.id &&
    request.requested_action === action
  ) || null;
}

function bookingRequestLabel(request) {
  if (!request) return null;
  const state = String(request.customer_state || request.processing_status || "REQUESTED").toUpperCase();
  if (state === "CANCELLED") return "Cancellation confirmed";
  if (state === "CHANGED") return "Change confirmed";
  if (state === "AWAITING_FOLLOW_UP") return "Follow-up in progress";
  if (state === "RESPONDED") return "Business responded";
  if (state === "NEEDS_ATTENTION") return "Needs review";
  if (state === "PROCESSING") return "Processing";
  return request.requested_action === "CANCEL" ? "Cancellation requested" : "Change requested";
}

function addressLabel(value) {
  if (!value) return "Not recorded";
  if (typeof value === "string") return value.trim() || "Not recorded";
  if (typeof value !== "object") return String(value);
  return [
    value.line1 || value.address_line_1 || value.street,
    value.line2 || value.address_line_2,
    value.city,
    value.province || value.state,
    value.postal_code || value.postcode || value.zip,
    value.country,
  ].filter(Boolean).join(", ") || "Not recorded";
}

export default function ExternalCustomerPortalPage() {
  const [state, setState] = useState({ loading: true, data: null, error: "" });
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [paying, setPaying] = useState(null);
  const [respondingQuote, setRespondingQuote] = useState(null);
  const [applyingWallet, setApplyingWallet] = useState(null);
  const [savingPreferences, setSavingPreferences] = useState(false);
  const [requestingBooking, setRequestingBooking] = useState("");
  const [bookingNotice, setBookingNotice] = useState("");
  const [preferences, setPreferences] = useState({ preferred_language: "", preferred_channel: "", allow_calls: true, allow_messages: true });
  const [paymentNotice, setPaymentNotice] = useState("");

  async function load() {
    setState((current) => ({ ...current, loading: true, error: "" }));
    const response = await fetch("/api/customer-portal/session", { cache: "no-store" });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || !payload.success) {
      setState({ loading: false, data: null, error: payload.error || "Open the secure link from your booking message to access the portal." });
      return;
    }
    setState({ loading: false, data: payload.data, error: "" });
    const contactPreferences = payload.data?.communication_preferences || {};
    setPreferences({
      preferred_language: contactPreferences.preferred_language || "",
      preferred_channel: contactPreferences.preferred_channel || "",
      allow_calls: contactPreferences.allow_calls !== false,
      allow_messages: contactPreferences.allow_messages !== false,
    });
  }

  useEffect(() => {
    load();
    const params = new URLSearchParams(window.location.search);
    const payment = params.get("payment");
    if (payment === "success") {
      setPaymentNotice("Payment submitted. We are confirming settlement now; the balance updates only after verified payment confirmation.");
    } else if (payment === "cancelled") {
      setPaymentNotice("Payment was cancelled. No portal balance was marked paid.");
    }
    if (payment) {
      params.delete("payment");
      params.delete("session_id");
      const next = params.toString();
      window.history.replaceState({}, "", `${window.location.pathname}${next ? `?${next}` : ""}`);
    }
  }, []);

  const data = state.data || {};
  const upcoming = useMemo(() => {
    const service = (data.booking_history || [])
      .filter((row) => new Date(row.occurrence_at || 0).getTime() >= Date.now() && row.status !== "cancelled")
      .map((row) => ({ ...row, portal_kind: "service", portal_date: row.occurrence_at }));
    const hotel = (data.hotel_bookings || [])
      .filter((row) => new Date(`${row.check_out_date || row.check_in_date}T23:59:59`).getTime() >= Date.now() && String(row.status || "").toUpperCase() !== "CANCELLED")
      .map((row) => ({ ...row, portal_kind: "hotel", portal_date: row.check_in_date }));
    return [...service, ...hotel].sort((a, b) => new Date(a.portal_date || 0) - new Date(b.portal_date || 0));
  }, [data.booking_history, data.hotel_bookings]);

  async function requestBookingAction(booking, action) {
    const key = `${booking.portal_kind}:${booking.id}:${action}`;
    setRequestingBooking(key);
    setBookingNotice("");
    try {
      const response = await fetch("/api/customer-portal/bookings/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bookingType: booking.portal_kind === "hotel" ? "HOTEL" : "SERVICE",
          bookingId: booking.id,
          action,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.success) throw new Error(payload.error || "Unable to send booking request");
      setBookingNotice(action === "CANCEL"
        ? "Cancellation request sent. Your booking is unchanged until the business confirms it."
        : "Change request sent. Your current booking remains active until the business confirms a new arrangement.");
      await load();
    } catch (error) {
      setState((current) => ({ ...current, error: error?.message || "Unable to send booking request" }));
    } finally {
      setRequestingBooking("");
    }
  }

  async function signOut() {
    try {
      await fetch("/api/customer-portal/session", { method: "DELETE" });
    } finally {
      window.location.assign("/customer-portal");
    }
  }

  async function pay(id) {
    setPaying(id);
    try {
      const response = await fetch("/api/customer-portal/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ payment_request_id: id }),
      });
      const payload = await response.json();
      if (!response.ok || !payload.success) throw new Error(payload.error || "Unable to start payment");
      if (payload.checkout_url) window.location.href = payload.checkout_url;
      else await load();
    } catch (error) {
      setState((current) => ({ ...current, error: error.message }));
    } finally {
      setPaying(null);
    }
  }

  async function applyWalletToInvoice(invoice) {
    const currency = String(invoice?.currency_code || "").toUpperCase();
    const entityId = invoice?.entity_id;
    const matching = (data.wallet?.entries || []).filter((entry) =>
      ["PREPAYMENT", "CUSTOMER_CREDIT"].includes(entry.balance_type) &&
      entry.entity_id === entityId &&
      String(entry.currency_code || "").toUpperCase() === currency &&
      Number(entry.available_amount || 0) > 0
    );
    const source = matching.find((entry) => entry.balance_type === "PREPAYMENT") || matching[0] || null;
    if (!source) {
      setState((current) => ({ ...current, error: "No matching wallet balance is available for this invoice." }));
      return;
    }
    setApplyingWallet(invoice.id);
    try {
      const response = await fetch("/api/customer-portal/wallet/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ invoiceId: invoice.id, walletEntryId: source.id, balanceType: source.balance_type }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.success) throw new Error(payload.error || "Unable to apply wallet balance");
      await load();
    } catch (error) {
      setState((current) => ({ ...current, error: error.message }));
    } finally {
      setApplyingWallet(null);
    }
  }

  async function respondToQuotation(quotationId, action) {
    setRespondingQuote(`${quotationId}:${action}`);
    try {
      const response = await fetch("/api/customer-portal/quotations/respond", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quotationId, action }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.success) throw new Error(payload.error || "Unable to update quotation");
      await load();
    } catch (error) {
      setState((current) => ({ ...current, error: error.message }));
    } finally {
      setRespondingQuote(null);
    }
  }

  async function savePreferences() {
    setSavingPreferences(true);
    try {
      const response = await fetch("/api/customer-portal/preferences", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(preferences),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.success) throw new Error(payload.error || "Unable to save preferences");
      await load();
    } catch (error) {
      setState((current) => ({ ...current, error: error.message }));
    } finally {
      setSavingPreferences(false);
    }
  }

  async function sendMessage() {
    const body = message.trim();
    if (!body) return;
    setSending(true);
    try {
      const response = await fetch("/api/customer-portal/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: body }),
      });
      const payload = await response.json();
      if (!response.ok || !payload.success) throw new Error(payload.error || "Unable to send message");
      setMessage("");
      await load();
    } catch (error) {
      setState((current) => ({ ...current, error: error.message }));
    } finally {
      setSending(false);
    }
  }

  if (state.loading) {
    return <main className="min-h-screen bg-[#F7F6F3] px-6 py-12 text-[#1B1A18]"><div className="mx-auto max-w-6xl text-sm text-[#79736B]">Opening your secure customer portal…</div></main>;
  }

  if (!data.customer) {
    return (
      <main className="min-h-screen bg-[#F7F6F3] px-6 py-12 text-[#1B1A18]">
        <div className="mx-auto max-w-xl rounded-3xl border border-black/[0.08] bg-white/[0.03] p-8">
          <div className="text-xs uppercase tracking-[0.2em] text-[#D6A66A]">Avantiqo Customer Portal</div>
          <h1 className="mt-3 text-3xl font-medium">Secure access required</h1>
          <p className="mt-3 text-sm leading-6 text-[#716B64]">{state.error || "Use the secure portal link sent to you by the business."}</p>
        </div>
      </main>
    );
  }

  return (
    <main id="portal-home" className="min-h-screen bg-[#F7F6F3] pb-24 text-[#1B1A18] md:pb-0">
      <div className="mx-auto max-w-7xl px-4 py-5 sm:px-5 sm:py-8 md:px-8">
        <header className="flex flex-col gap-4 border-b border-black/[0.07] pb-5 sm:gap-5 sm:pb-7 md:flex-row md:items-end md:justify-between">
          <div className="min-w-0">
            <div className="text-[9px] font-black uppercase tracking-[0.24em] text-[#D6A66A] sm:text-[10px]">Avantiqo Customer</div>
            <h1 className="mt-1.5 truncate text-2xl font-black tracking-[-0.04em] sm:mt-2 sm:text-3xl">{data.customer.display_name || "Your account"}</h1>
            <p className="mt-1.5 max-w-xl text-[11px] leading-5 text-[#817B73] sm:mt-2 sm:text-xs">Bookings, wallet, payments and messages in one secure place.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button onClick={load} className="inline-flex items-center gap-2 self-start rounded-xl border border-black/[0.075] bg-white px-4 py-2 text-xs text-[#4F4A43]"><RefreshCw size={13}/> Refresh</button>
            <button onClick={signOut} className="inline-flex items-center gap-2 self-start rounded-xl border border-black/[0.08] px-4 py-2 text-xs text-[#817B73]">Sign out</button>
          </div>
        </header>

        <section className="mt-4 grid grid-cols-2 gap-2 md:hidden">
          <a href="#bookings" className="rounded-[22px] border border-black/[0.07] bg-white p-4 shadow-[0_10px_30px_rgba(55,47,38,0.06)]">
            <div className="flex items-center justify-between text-[#D6A66A]"><CalendarDays size={16}/><span className="text-[9px] font-black uppercase tracking-[0.12em]">Next</span></div>
            <div className="mt-3 text-sm font-black">{upcoming[0] ? (upcoming[0].portal_kind === "hotel" ? upcoming[0].check_in_date || "Hotel booking" : dateTime(upcoming[0].occurrence_at)) : "No booking"}</div>
            <div className="mt-1 text-[10px] text-[#948E86]">Bookings</div>
          </a>
          <a href="#wallet" className="rounded-[22px] border border-black/[0.07] bg-white p-4 shadow-[0_10px_30px_rgba(55,47,38,0.06)]">
            <div className="flex items-center justify-between text-[#D6A66A]"><WalletCards size={16}/><span className="text-[9px] font-black uppercase tracking-[0.12em]">Wallet</span></div>
            <div className="mt-3 text-sm font-black">{data.wallet?.balances?.[0] ? money(data.wallet.balances[0].available_amount, data.wallet.balances[0].currency_code) : money(0, "THB")}</div>
            <div className="mt-1 text-[10px] text-[#948E86]">Available</div>
          </a>
        </section>

        {state.error ? <div className="mt-5 rounded-2xl border border-red-400/20 bg-red-400/5 px-4 py-3 text-xs text-[#984C43]">{state.error}</div> : null}
        {paymentNotice ? <div className="mt-5 rounded-2xl border border-[#D6A66A]/20 bg-[#D6A66A]/[0.06] px-4 py-3 text-xs leading-5 text-[#76583A]">{paymentNotice}</div> : null}
        {bookingNotice ? <div className="mt-3 rounded-2xl border border-[#D6A66A]/20 bg-[#D6A66A]/[0.06] px-4 py-3 text-xs leading-5 text-[#76583A]">{bookingNotice}</div> : null}

        <section id="bookings" className="mt-4 grid scroll-mt-24 gap-3 sm:mt-6 sm:gap-4 xl:grid-cols-4">
          <div id="booking-card" className="scroll-mt-24">
          <Panel icon={<CalendarDays size={16}/>} title="Upcoming bookings">
            {upcoming.length ? upcoming.slice(0, 6).map((row) => (
              <div key={row.id} className="border-b border-black/[0.065] py-3 last:border-0">
                <div className="text-sm">{row.portal_kind === "hotel" ? `Hotel · ${row.booking_reference || "Booking"}` : dateTime(row.occurrence_at)}</div>
                <div className="mt-1 text-[10px] uppercase tracking-[0.12em] text-[#948E86]">{row.portal_kind === "hotel" ? `${row.check_in_date} → ${row.check_out_date} · ${row.status}` : row.status}</div>
                <div className="mt-2 flex flex-wrap gap-2">
                  <button
                    onClick={() => requestBookingAction(row, "CHANGE")}
                    disabled={Boolean(requestingBooking) || Boolean(bookingRequestFor(data, row, "CHANGE"))}
                    className="rounded-lg border border-black/[0.08] px-2.5 py-1.5 text-[10px] text-[#716B64] disabled:opacity-40"
                  >
                    {requestingBooking === `${row.portal_kind}:${row.id}:CHANGE` ? "Sending..." : bookingRequestLabel(bookingRequestFor(data, row, "CHANGE")) || "Request change"}
                  </button>
                  <button
                    onClick={() => requestBookingAction(row, "CANCEL")}
                    disabled={Boolean(requestingBooking) || Boolean(bookingRequestFor(data, row, "CANCEL"))}
                    className="rounded-lg border border-black/[0.08] px-2.5 py-1.5 text-[10px] text-[#8A847C] disabled:opacity-40"
                  >
                    {requestingBooking === `${row.portal_kind}:${row.id}:CANCEL` ? "Sending..." : bookingRequestLabel(bookingRequestFor(data, row, "CANCEL")) || "Request cancellation"}
                  </button>
                </div>
                {[bookingRequestFor(data, row, "CHANGE"), bookingRequestFor(data, row, "CANCEL")].filter(Boolean).map((request) => (
                  <div key={request.message_id} className="mt-2 rounded-xl border border-[#D6A66A]/15 bg-[#D6A66A]/[0.04] px-3 py-2">
                    <div className="text-[9px] font-semibold uppercase tracking-[0.12em] text-[#D6A66A]">{bookingRequestLabel(request)}</div>
                    {request.response_text ? <div className="mt-1 text-[11px] leading-4 text-[#716B64]">{request.response_text}</div> : <div className="mt-1 text-[10px] text-[#A09A92]">The business has received your request.</div>}
                  </div>
                ))}
              </div>
            )) : <Empty>No upcoming bookings.</Empty>}
          </Panel>
          </div>

          <div id="payments" className="scroll-mt-24">
          <Panel icon={<CreditCard size={16}/>} title="Payments">
            {(data.payable_items || []).length ? data.payable_items.map((item) => (
              <div key={item.id} className="border-b border-black/[0.065] py-3 last:border-0">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="text-sm">{item.description}</div>
                    <div className="mt-1 text-xs text-[#817B73]">{money(item.amount, item.currency_code)} · {item.status}</div>
                  </div>
                  {item.status !== "PAID" && item.status !== "CANCELLED" ? (
                    <button disabled={paying === item.id} onClick={() => pay(item.id)} className="rounded-lg bg-[#D6A66A] px-3 py-2 text-[10px] font-semibold text-black disabled:opacity-50">
                      {paying === item.id ? "Opening…" : "Pay by card"}
                    </button>
                  ) : null}
                </div>
              </div>
            )) : <Empty>No payment due.</Empty>}
          </Panel>
          </div>

          <div id="wallet" className="scroll-mt-24">
          <Panel icon={<WalletCards size={16}/>} title="Wallet">
            {(data.wallet?.balances || []).length ? (data.wallet.balances || []).map((balance) => (
              <div key={balance.currency_code} className="border-b border-black/[0.065] py-3 last:border-0">
                <div className="flex items-end justify-between gap-3">
                  <div>
                    <div className="text-[10px] uppercase tracking-[0.12em] text-[#948E86]">Available balance</div>
                    <div className="mt-1 text-xl font-medium">{money(balance.available_amount, balance.currency_code)}</div>
                  </div>
                  <div className="text-right text-[10px] leading-5 text-[#8A847C]">
                    <div>Prepaid {money(balance.prepayment_amount, balance.currency_code)}</div>
                    <div>Credit {money(balance.credit_amount, balance.currency_code)}</div>
                  </div>
                </div>
              </div>
            )) : <Empty>No wallet balance yet.</Empty>}
            {(data.loyalty_accounts || []).length ? (
              <div className="mt-4 border-t border-black/[0.065] pt-3">
                <div className="text-[10px] uppercase tracking-[0.12em] text-[#948E86]">Loyalty</div>
                {(data.loyalty_accounts || []).slice(0, 3).map((account) => (
                  <div key={account.id} className="mt-2 flex items-center justify-between gap-3 text-xs">
                    <span className="text-[#716B64]">{account.tier || "Member"}</span>
                    <span className="font-medium text-[#76583A]">{Number(account.loyalty_points || 0).toLocaleString()} points</span>
                  </div>
                ))}
              </div>
            ) : null}
            {(data.payments || []).length ? (
              <div className="mt-4 border-t border-black/[0.065] pt-3">
                <div className="text-[10px] uppercase tracking-[0.12em] text-[#948E86]">Recent payments</div>
                {(data.payments || []).slice(0, 3).map((payment) => (
                  <div key={payment.id} className="mt-2 flex items-center justify-between gap-3 text-xs">
                    <span className="text-[#817B73]">{payment.payment_date || "Payment"}</span>
                    <span className="text-[#5E5952]">{money(payment.amount, payment.currency_code)}</span>
                  </div>
                ))}
              </div>
            ) : null}
            <div className="mt-3 text-[10px] leading-4 text-[#A09A92]">Wallet balances come directly from posted customer prepayments and available customer credits.</div>
          </Panel>
          </div>

          <div id="messages" className="scroll-mt-24">
          <Panel icon={<MessageSquare size={16}/>} title="Messages">
            <div className="mb-3 max-h-56 space-y-2 overflow-y-auto pr-1">
              {(data.conversation_history || []).length ? (data.conversation_history || []).slice(-20).map((item) => (
                <div key={item.id} className={`rounded-xl px-3 py-2 text-xs leading-5 ${item.direction === "INBOUND" ? "ml-6 bg-[#D6A66A]/10 text-[#76583A]" : "mr-6 bg-white/[0.05] text-[#5E5952]"}`}>
                  {item.body || "Message"}
                </div>
              )) : <Empty>No messages yet.</Empty>}
            </div>
            <textarea value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Write a message…" className="min-h-24 w-full resize-none rounded-xl border border-black/[0.09] bg-white p-3 text-sm outline-none placeholder:text-[#AAA49C] focus:border-[#D6A66A]/50"/>
            <button onClick={sendMessage} disabled={sending || !message.trim()} className="mt-3 min-h-11 w-full rounded-xl bg-[#D6A66A] px-4 py-2 text-xs font-black text-[#171614] disabled:opacity-40 sm:w-auto sm:border sm:border-[#D6A66A]/40 sm:bg-transparent sm:text-[#76583A]">{sending ? "Sending…" : "Send message"}</button>
          </Panel>
          </div>
        </section>

        <section className="mt-4 grid gap-4 lg:grid-cols-2">
          <Panel icon={<History size={16}/>} title="Updates">
            {(data.updates || []).length ? (data.updates || []).slice(0, 12).map((item) => (
              <div key={item.id} className="border-b border-black/[0.065] py-3 last:border-0">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="text-sm">{item.title}</div>
                    {item.detail ? <div className="mt-1 text-xs leading-5 text-[#8A847C]">{item.detail}</div> : null}
                  </div>
                  <div className="text-right">
                    <div className="text-[10px] uppercase tracking-[0.12em] text-[#948E86]">{item.status || item.kind}</div>
                    <div className="mt-1 text-[10px] text-[#AAA49C]">{dateTime(item.occurred_at)}</div>
                  </div>
                </div>
              </div>
            )) : <Empty>No updates yet.</Empty>}
          </Panel>

          <Panel icon={<FileText size={16}/>} title="Documents">
            {(data.documents || []).length ? (data.documents || []).slice(0, 20).map((document) => (
              <div key={document.id} className="flex items-center justify-between gap-4 border-b border-black/[0.065] py-3 last:border-0">
                <div>
                  <div className="text-sm">{document.document_name || "Document"}</div>
                  <div className="mt-1 text-[10px] uppercase tracking-[0.12em] text-[#948E86]">{document.document_type || "Document"} · {document.document_status || "Available"}</div>
                </div>
                <a href={`/api/customer-portal/documents/${document.id}/download?redirect=1`} target="_blank" rel="noreferrer" className="rounded-lg border border-[#D6A66A]/30 px-3 py-1.5 text-[10px] text-[#76583A]">Open</a>
              </div>
            )) : <Empty>No shared documents yet.</Empty>}
          </Panel>
        </section>

        <section className="mt-4 grid gap-4 xl:grid-cols-4">
          <Panel icon={<History size={16}/>} title="Service history">
            {(data.booking_history || []).length ? (data.booking_history || []).slice(0, 20).map((row) => (
              <div key={row.id} className="flex items-center justify-between gap-4 border-b border-black/[0.065] py-3 last:border-0">
                <div className="text-xs">{dateTime(row.occurrence_at)}</div>
                <div className="text-[10px] uppercase tracking-[0.12em] text-[#948E86]">{row.status}</div>
              </div>
            )) : <Empty>No service history yet.</Empty>}
          </Panel>

          <Panel icon={<FileText size={16}/>} title="Quotations">
            {(data.quotations || []).length ? (data.quotations || []).slice(0, 20).map((quote) => (
              <div key={quote.id} className="flex items-center justify-between gap-4 border-b border-black/[0.065] py-3 last:border-0">
                <div>
                  <div className="text-sm">{quote.quotation_number || "Quotation"}</div>
                  <div className="mt-1 text-xs text-[#8A847C]">Valid until {quote.valid_until || "—"}</div>
                </div>
                <div className="text-right">
                  <div className="text-sm">{money(quote.total_amount, quote.currency_code)}</div>
                  <div className="mt-1 text-[10px] uppercase tracking-[0.12em] text-[#948E86]">{quote.status}</div>
                  {String(quote.status || "").toUpperCase() === "SENT" && quotationExpired(quote) ? (
                    <div className="mt-2 text-[10px] uppercase tracking-[0.1em] text-[#A09A92]">Expired</div>
                  ) : null}
                  {String(quote.status || "").toUpperCase() === "SENT" && !quotationExpired(quote) ? (
                    <div className="mt-2 flex justify-end gap-2">
                      <button onClick={() => respondToQuotation(quote.id, "ACCEPT")} disabled={Boolean(respondingQuote)} className="rounded-lg bg-[#D6A66A] px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-[#171614] disabled:opacity-40">{respondingQuote === `${quote.id}:ACCEPT` ? "Accepting…" : "Accept"}</button>
                      <button onClick={() => respondToQuotation(quote.id, "REJECT")} disabled={Boolean(respondingQuote)} className="rounded-lg border border-black/[0.08] px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-[#716B64] disabled:opacity-40">{respondingQuote === `${quote.id}:REJECT` ? "Rejecting…" : "Reject"}</button>
                    </div>
                  ) : null}
                </div>
              </div>
            )) : <Empty>No quotations yet.</Empty>}
          </Panel>

          <Panel icon={<History size={16}/>} title="Orders">
            {(data.sales_orders || []).length ? (data.sales_orders || []).slice(0, 20).map((order) => (
              <div key={order.id} className="border-b border-black/[0.065] py-3 last:border-0">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="text-sm">{order.order_number || "Order"}</div>
                    <div className="mt-1 text-[10px] uppercase tracking-[0.12em] text-[#948E86]">{order.fulfillment_status || order.status}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm">{money(order.total_amount, order.currency_code)}</div>
                    <div className="mt-1 text-[10px] uppercase tracking-[0.12em] text-[#948E86]">{order.payment_status}</div>
                  </div>
                </div>
                {Number(order.remaining_balance || 0) > 0 ? <div className="mt-2 text-[10px] text-[#948E86]">Remaining {money(order.remaining_balance, order.currency_code)}</div> : null}
              </div>
            )) : <Empty>No orders yet.</Empty>}
          </Panel>

          <Panel icon={<FileText size={16}/>} title="Invoices & receipts">
            {(data.invoices || []).length ? (data.invoices || []).slice(0, 20).map((invoice) => (
              <div key={invoice.id} className="flex items-center justify-between gap-4 border-b border-black/[0.065] py-3 last:border-0">
                <div>
                  <div className="text-sm">{invoice.invoice_number || invoice.reference_number || "Invoice"}</div>
                  <div className="mt-1 text-xs text-[#8A847C]">{invoice.invoice_date || ""}</div>
                </div>
                <div className="text-right">
                  <div className="text-sm">{money(invoice.total_amount, invoice.currency_code)}</div>
                  <div className="mt-1 text-[10px] uppercase tracking-[0.12em] text-[#948E86]">{invoice.status}</div>
                  <div className="mt-2 flex flex-wrap justify-end gap-2">
                    {Number(invoice.outstanding_balance || 0) > 0 && (data.wallet?.entries || []).some((entry) => ["PREPAYMENT", "CUSTOMER_CREDIT"].includes(entry.balance_type) && entry.entity_id === invoice.entity_id && String(entry.currency_code || "").toUpperCase() === String(invoice.currency_code || "").toUpperCase() && Number(entry.available_amount || 0) > 0) ? (
                      <button onClick={() => applyWalletToInvoice(invoice)} disabled={applyingWallet === invoice.id} className="rounded-lg border border-[#D6A66A]/30 px-2.5 py-1 text-[10px] text-[#D6A66A] disabled:opacity-40">{applyingWallet === invoice.id ? "Applying…" : "Use wallet"}</button>
                    ) : null}
                    <a href={`/api/customer-portal/invoices/${invoice.id}/pdf`} target="_blank" rel="noreferrer" className="text-[10px] text-[#D6A66A] hover:underline">Invoice</a>
                    {String(invoice.status || "").toUpperCase() === "PAID" ? <a href={`/api/customer-portal/invoices/${invoice.id}/pdf?mode=receipt`} target="_blank" rel="noreferrer" className="text-[10px] text-[#D6A66A] hover:underline">Receipt</a> : null}
                  </div>
                </div>
              </div>
            )) : <Empty>No invoices yet.</Empty>}
          </Panel>
        </section>

        <section id="account" className="mt-4 grid scroll-mt-24 gap-4 lg:grid-cols-[0.85fr_1.65fr]">
          <div className="rounded-2xl border border-black/[0.075] bg-white p-5">
            <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#D6A66A]">Account details</div>
            <div className="mt-4 space-y-3">
              {[
                ["Name", data.customer.display_name || "Not recorded"],
                ["Email", data.customer.email || "Not recorded"],
                ["Phone", data.customer.phone || "Not recorded"],
                ["Address", addressLabel(data.customer.address)],
              ].map(([label, value]) => (
                <div key={label} className="rounded-xl border border-black/[0.06] bg-[#FCFBF9] px-3 py-2.5">
                  <div className="text-[9px] uppercase tracking-[0.12em] text-[#AAA49C]">{label}</div>
                  <div className="mt-1 break-words text-xs text-[#5E5952]">{value}</div>
                </div>
              ))}
            </div>
            <p className="mt-4 text-[10px] leading-4 text-[#A09A92]">For verified contact or legal identity changes, send a message here so the business can confirm the change safely.</p>
          </div>

          <div className="rounded-2xl border border-black/[0.075] bg-white p-5">
            <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#D6A66A]">Communication preferences</div>
                <p className="mt-2 max-w-2xl text-xs leading-5 text-[#8A847C]">Choose how this business should contact you. These settings update your canonical customer contact profile.</p>
              </div>
              <div className="grid min-w-0 flex-1 gap-3 sm:grid-cols-2 lg:max-w-3xl lg:grid-cols-4">
                <input value={preferences.preferred_language} onChange={(e) => setPreferences((current) => ({ ...current, preferred_language: e.target.value }))} placeholder="Language" className="h-10 rounded-xl border border-black/[0.09] bg-white px-3 text-xs outline-none placeholder:text-[#B4AEA6]" />
                <select value={preferences.preferred_channel} onChange={(e) => setPreferences((current) => ({ ...current, preferred_channel: e.target.value }))} className="h-10 rounded-xl border border-black/[0.09] bg-white px-3 text-xs outline-none">
                  <option value="">Preferred channel</option>
                  <option value="whatsapp">WhatsApp</option>
                  <option value="line">LINE</option>
                  <option value="instagram">Instagram</option>
                  <option value="messenger">Messenger</option>
                  <option value="email">Email</option>
                  <option value="sms">SMS</option>
                </select>
                <label className="flex h-10 items-center gap-2 rounded-xl border border-black/[0.09] bg-white px-3 text-xs text-[#716B64]"><input type="checkbox" checked={preferences.allow_messages} onChange={(e) => setPreferences((current) => ({ ...current, allow_messages: e.target.checked }))}/> Messages</label>
                <label className="flex h-10 items-center gap-2 rounded-xl border border-black/[0.09] bg-white px-3 text-xs text-[#716B64]"><input type="checkbox" checked={preferences.allow_calls} onChange={(e) => setPreferences((current) => ({ ...current, allow_calls: e.target.checked }))}/> Calls</label>
              </div>
              <button onClick={savePreferences} disabled={savingPreferences} className="h-10 shrink-0 rounded-xl border border-[#D6A66A]/40 px-4 text-[10px] font-semibold uppercase tracking-[0.12em] text-[#76583A] disabled:opacity-40">{savingPreferences ? "Saving…" : "Save"}</button>
            </div>
          </div>
        </section>
      </div>

      <nav className="fixed inset-x-3 bottom-3 z-50 grid grid-cols-5 rounded-[26px] border border-black/[0.08] bg-white/95 p-1.5 shadow-[0_18px_55px_rgba(57,47,35,0.18)] backdrop-blur-xl md:hidden" aria-label="Customer mobile navigation">
        {[
          { href: "#portal-home", label: "Home", icon: Home },
          { href: "#bookings", label: "Bookings", icon: CalendarDays },
          { href: "#payments", label: "Pay", icon: CreditCard },
          { href: "#messages", label: "Messages", icon: MessageSquare },
          { href: "#account", label: "Account", icon: UserRound },
        ].map((item) => {
          const Icon = item.icon;
          return <a key={item.href} href={item.href} className="flex min-h-14 flex-col items-center justify-center gap-1 rounded-[20px] px-1 text-[#807970] active:bg-[#F4EEE5] active:text-[#76583A]"><Icon className="h-[18px] w-[18px]"/><span className="text-[9px] font-black">{item.label}</span></a>;
        })}
      </nav>
    </main>
  );
}

function Panel({ icon, title, children }) {
  return <section className="h-full rounded-[24px] border border-black/[0.07] bg-white p-4 shadow-[0_12px_34px_rgba(55,47,38,0.06)] sm:p-5"><div className="mb-3 flex items-center gap-2 text-[#D6A66A]">{icon}<h2 className="text-[11px] font-semibold uppercase tracking-[0.16em]">{title}</h2></div>{children}</section>;
}

function Empty({ children }) {
  return <div className="py-6 text-xs text-[#948E86]">{children}</div>;
}
