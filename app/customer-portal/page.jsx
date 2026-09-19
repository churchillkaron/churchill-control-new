"use client";

import { useEffect, useMemo, useState } from "react";
import { CalendarDays, CreditCard, FileText, History, MessageSquare, RefreshCw } from "lucide-react";

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

export default function ExternalCustomerPortalPage() {
  const [state, setState] = useState({ loading: true, data: null, error: "" });
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [paying, setPaying] = useState(null);

  async function load() {
    setState((current) => ({ ...current, loading: true, error: "" }));
    const response = await fetch("/api/customer-portal/session", { cache: "no-store" });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || !payload.success) {
      setState({ loading: false, data: null, error: payload.error || "Open the secure link from your booking message to access the portal." });
      return;
    }
    setState({ loading: false, data: payload.data, error: "" });
  }

  useEffect(() => { load(); }, []);

  const data = state.data || {};
  const upcoming = useMemo(
    () => (data.booking_history || []).filter((row) => new Date(row.occurrence_at || 0).getTime() >= Date.now() && row.status !== "cancelled"),
    [data.booking_history],
  );

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
    return <main className="min-h-screen bg-[#090909] px-6 py-12 text-white"><div className="mx-auto max-w-6xl text-sm text-white/50">Opening your secure customer portal…</div></main>;
  }

  if (!data.customer) {
    return (
      <main className="min-h-screen bg-[#090909] px-6 py-12 text-white">
        <div className="mx-auto max-w-xl rounded-3xl border border-white/10 bg-white/[0.03] p-8">
          <div className="text-xs uppercase tracking-[0.2em] text-[#D6A66A]">Avantiqo Customer Portal</div>
          <h1 className="mt-3 text-3xl font-medium">Secure access required</h1>
          <p className="mt-3 text-sm leading-6 text-white/55">{state.error || "Use the secure portal link sent to you by the business."}</p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#090909] text-white">
      <div className="mx-auto max-w-7xl px-5 py-8 md:px-8">
        <header className="flex flex-col gap-5 border-b border-white/10 pb-7 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-[0.24em] text-[#D6A66A]">Customer Portal</div>
            <h1 className="mt-2 text-3xl font-medium tracking-[-0.04em]">{data.customer.display_name || "Your account"}</h1>
            <p className="mt-2 text-xs text-white/45">Bookings, payments, documents and conversations in one secure place.</p>
          </div>
          <button onClick={load} className="inline-flex items-center gap-2 self-start rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2 text-xs text-white/70"><RefreshCw size={13}/> Refresh</button>
        </header>

        {state.error ? <div className="mt-5 rounded-2xl border border-red-400/20 bg-red-400/5 px-4 py-3 text-xs text-red-200">{state.error}</div> : null}

        <section className="mt-6 grid gap-4 lg:grid-cols-3">
          <Panel icon={<CalendarDays size={16}/>} title="Upcoming bookings">
            {upcoming.length ? upcoming.slice(0, 6).map((row) => (
              <div key={row.id} className="border-b border-white/[0.07] py-3 last:border-0">
                <div className="text-sm">{dateTime(row.occurrence_at)}</div>
                <div className="mt-1 text-[10px] uppercase tracking-[0.12em] text-white/35">{row.status}</div>
              </div>
            )) : <Empty>No upcoming bookings.</Empty>}
          </Panel>

          <Panel icon={<CreditCard size={16}/>} title="Payments">
            {(data.payable_items || []).length ? data.payable_items.map((item) => (
              <div key={item.id} className="border-b border-white/[0.07] py-3 last:border-0">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="text-sm">{item.description}</div>
                    <div className="mt-1 text-xs text-white/45">{money(item.amount, item.currency_code)} · {item.status}</div>
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

          <Panel icon={<MessageSquare size={16}/>} title="Messages">
            <div className="mb-3 max-h-56 space-y-2 overflow-y-auto pr-1">
              {(data.conversation_history || []).length ? (data.conversation_history || []).slice(-20).map((item) => (
                <div key={item.id} className={`rounded-xl px-3 py-2 text-xs leading-5 ${item.direction === "INBOUND" ? "ml-6 bg-[#D6A66A]/10 text-[#E8C391]" : "mr-6 bg-white/[0.05] text-white/65"}`}>
                  {item.body || "Message"}
                </div>
              )) : <Empty>No messages yet.</Empty>}
            </div>
            <textarea value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Write a message…" className="min-h-24 w-full resize-none rounded-xl border border-white/10 bg-black/30 p-3 text-sm outline-none placeholder:text-white/25 focus:border-[#D6A66A]/50"/>
            <button onClick={sendMessage} disabled={sending || !message.trim()} className="mt-3 rounded-lg border border-[#D6A66A]/40 px-4 py-2 text-xs text-[#E8C391] disabled:opacity-40">{sending ? "Sending…" : "Send message"}</button>
          </Panel>
        </section>

        <section className="mt-4 grid gap-4 lg:grid-cols-2">
          <Panel icon={<History size={16}/>} title="Service history">
            {(data.booking_history || []).length ? (data.booking_history || []).slice(0, 20).map((row) => (
              <div key={row.id} className="flex items-center justify-between gap-4 border-b border-white/[0.07] py-3 last:border-0">
                <div className="text-xs">{dateTime(row.occurrence_at)}</div>
                <div className="text-[10px] uppercase tracking-[0.12em] text-white/35">{row.status}</div>
              </div>
            )) : <Empty>No service history yet.</Empty>}
          </Panel>

          <Panel icon={<FileText size={16}/>} title="Invoices & receipts">
            {(data.invoices || []).length ? (data.invoices || []).slice(0, 20).map((invoice) => (
              <div key={invoice.id} className="flex items-center justify-between gap-4 border-b border-white/[0.07] py-3 last:border-0">
                <div>
                  <div className="text-sm">{invoice.invoice_number || invoice.reference_number || "Invoice"}</div>
                  <div className="mt-1 text-xs text-white/40">{invoice.invoice_date || ""}</div>
                </div>
                <div className="text-right">
                  <div className="text-sm">{money(invoice.total_amount, invoice.currency_code)}</div>
                  <div className="mt-1 text-[10px] uppercase tracking-[0.12em] text-white/35">{invoice.status}</div>
                </div>
              </div>
            )) : <Empty>No invoices yet.</Empty>}
          </Panel>
        </section>
      </div>
    </main>
  );
}

function Panel({ icon, title, children }) {
  return <section className="rounded-2xl border border-white/10 bg-white/[0.035] p-5 shadow-2xl shadow-black/20"><div className="mb-3 flex items-center gap-2 text-[#D6A66A]">{icon}<h2 className="text-[11px] font-semibold uppercase tracking-[0.16em]">{title}</h2></div>{children}</section>;
}

function Empty({ children }) {
  return <div className="py-6 text-xs text-white/35">{children}</div>;
}
