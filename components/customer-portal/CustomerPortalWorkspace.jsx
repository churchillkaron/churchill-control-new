"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

function money(value, currency = "THB") {
  const amount = Number(value || 0);
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return currency + " " + amount.toFixed(2);
  }
}

function when(value) {
  if (!value) return "—";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return String(value);
  return parsed.toLocaleDateString();
}

function Panel({ eyebrow, title, children }) {
  return <section className="rounded-[24px] border border-black/[.07] bg-white p-5 shadow-[0_12px_36px_rgba(48,35,22,.035)] sm:p-6">
    {eyebrow ? <div className="text-[8px] font-semibold uppercase tracking-[.16em] text-[#9A744B]">{eyebrow}</div> : null}
    <h2 className="mt-1 text-[20px] font-semibold tracking-[-.025em]">{title}</h2>
    <div className="mt-4">{children}</div>
  </section>;
}

export default function CustomerPortalWorkspace({ section = "home" }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [loggingOut, setLoggingOut] = useState(false);
  const [paymentBusyId, setPaymentBusyId] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/customer-portal/context", { cache: "no-store" });
      const payload = await response.json().catch(() => ({}));
      if (response.status === 401) {
        setData(null);
        return;
      }
      if (!response.ok || !payload?.success) {
        throw new Error(payload?.error || "Unable to load customer portal");
      }
      setData(payload);
    } catch (loadError) {
      setError(loadError?.message || "Unable to load customer portal");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function startPayment(paymentRequestId) {
    if (!paymentRequestId) return;
    setPaymentBusyId(paymentRequestId);
    setError("");
    try {
      const response = await fetch("/api/customer-portal/payments/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paymentRequestId }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload?.success) {
        throw new Error(payload?.error || "Unable to start secure payment");
      }
      if (!payload.checkout_url) throw new Error("Secure checkout URL was not returned");
      window.location.assign(payload.checkout_url);
    } catch (paymentError) {
      setError(paymentError?.message || "Unable to start secure payment");
      setPaymentBusyId("");
    }
  }

  async function logout() {
    setLoggingOut(true);
    try {
      await fetch("/api/customer-portal/logout", { method: "POST" });
      setData(null);
    } finally {
      setLoggingOut(false);
    }
  }

  const invoices = data?.invoices || [];
  const payments = data?.payments || [];
  const orders = data?.orders || [];
  const bookings = data?.bookings || [];
  const paymentRequests = data?.payment_requests || [];
  const outstandingTotal = useMemo(
    () => invoices.reduce((sum, row) => sum + Number(row.outstanding_balance ?? row.outstanding_amount ?? 0), 0),
    [invoices]
  );
  const pendingPaymentRequests = paymentRequests.filter((row) => !["PAID","CANCELLED","REFUNDED"].includes(String(row.status || "").toUpperCase()));

  if (loading) {
    return <div className="mx-auto max-w-[1320px] px-5 py-10 sm:px-7 lg:px-10">
      <div className="rounded-[22px] border border-black/[.07] bg-white p-6 text-[10px] text-[#756E66]">Loading customer portal…</div>
    </div>;
  }

  if (!data) {
    return <section className="mx-auto max-w-[1180px] px-5 py-14 sm:px-7 lg:px-10 lg:py-20">
      <div className="text-[9px] font-semibold uppercase tracking-[.2em] text-[#9A744B]">Customer Portal</div>
      <h1 className="mt-4 max-w-4xl text-[46px] font-medium leading-[.96] tracking-[-.055em] sm:text-[62px]">Open the secure link sent by the business.</h1>
      <p className="mt-5 max-w-3xl text-[13px] leading-7 text-[#6B645C]">Customer Portal does not create staff access or an internal Avantiqo workspace. A business sends a one-time customer link for the exact customer relationship, and that link creates a private session for orders, invoices, payments and bookings.</p>
      {error ? <div className="mt-6 rounded-xl border border-red-700/15 bg-red-50 px-4 py-3 text-[10px] text-red-800">{error}</div> : null}
    </section>;
  }

  const organization = data.organization || {};
  const customer = data.customer || {};
  const heading =
    section === "home" ? "Your account with " + (organization.name || organization.legal_name || "this business") :
    section === "orders" ? "Orders" :
    section === "invoices" ? "Invoices" :
    section === "payments" ? "Payments" :
    section === "bookings" ? "Bookings" :
    "Customer profile";

  return <div className="mx-auto max-w-[1320px] px-5 py-8 sm:px-7 lg:px-10 lg:py-10">
    <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
      <div>
        <div className="text-[9px] font-semibold uppercase tracking-[.2em] text-[#9A744B]">Customer workspace</div>
        <h1 className="mt-2 text-[34px] font-medium tracking-[-.04em] sm:text-[44px]">{heading}</h1>
        <p className="mt-2 max-w-3xl text-[10px] leading-5 text-[#756E66]">This portal is scoped only to {organization.name || organization.legal_name || "the business"} and customer record {customer.display_name || customer.legal_name || "Customer"}.</p>
      </div>
      <button onClick={logout} disabled={loggingOut} className="rounded-xl border border-black/[.08] bg-white px-4 py-2 text-[8px] font-semibold text-[#625D56] disabled:opacity-40">Close secure session</button>
    </div>

    {error ? <div className="mb-5 rounded-xl border border-red-700/15 bg-red-50 px-4 py-3 text-[10px] text-red-800">{error}</div> : null}

    {section === "home" ? <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-[20px] border border-black/[.07] bg-white p-5"><div className="text-[8px] uppercase tracking-[.15em] text-[#9A744B]">Open balance</div><div className="mt-2 text-[24px] font-semibold">{money(outstandingTotal, invoices[0]?.currency_code || "THB")}</div><div className="mt-1 text-[8px] text-[#81786F]">{invoices.filter((row)=>Number(row.outstanding_balance ?? row.outstanding_amount ?? 0)>0).length} invoice(s)</div></div>
        <div className="rounded-[20px] border border-black/[.07] bg-white p-5"><div className="text-[8px] uppercase tracking-[.15em] text-[#9A744B]">Orders</div><div className="mt-2 text-[28px] font-semibold">{orders.length}</div><div className="mt-1 text-[8px] text-[#81786F]">Sales orders for this customer</div></div>
        <div className="rounded-[20px] border border-black/[.07] bg-white p-5"><div className="text-[8px] uppercase tracking-[.15em] text-[#9A744B]">Bookings</div><div className="mt-2 text-[28px] font-semibold">{bookings.length}</div><div className="mt-1 text-[8px] text-[#81786F]">Hospitality reservations linked to your Party</div></div>
        <div className="rounded-[20px] border border-black/[.07] bg-white p-5"><div className="text-[8px] uppercase tracking-[.15em] text-[#9A744B]">Payment requests</div><div className="mt-2 text-[28px] font-semibold">{pendingPaymentRequests.length}</div><div className="mt-1 text-[8px] text-[#81786F]">Pending customer payment request(s)</div></div>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Panel eyebrow="Latest invoices" title={invoices.length ? invoices.length + " invoice(s)" : "No invoices yet"}>
          <div className="space-y-2">{invoices.slice(0,5).map((row)=><div key={row.id} className="flex items-center justify-between gap-4 rounded-[14px] border border-black/[.06] bg-[#FBFAF8] p-3"><div><div className="text-[9px] font-semibold">{row.invoice_number}</div><div className="mt-1 text-[7px] text-[#81786F]">{row.status} · due {when(row.due_date)}</div></div><div className="text-right"><div className="text-[9px] font-semibold">{money(row.total_amount,row.currency_code || "THB")}</div><div className="mt-1 text-[7px] text-[#81786F]">Outstanding {money(row.outstanding_balance ?? row.outstanding_amount ?? 0,row.currency_code || "THB")}</div></div></div>)}</div>
        </Panel>
        <Panel eyebrow="Payment requests" title={pendingPaymentRequests.length ? "Action requested" : "Nothing due through the portal"}>
          <div className="space-y-2">{pendingPaymentRequests.slice(0,5).map((row)=>{const payable=["PENDING","CHECKOUT_CREATED","FAILED"].includes(String(row.status||"").toUpperCase());return <div key={row.id} className="rounded-[14px] border border-[#B7793B]/16 bg-[#FBF6EF] p-3"><div className="flex items-center justify-between gap-3"><div><div className="text-[9px] font-semibold">{row.description}</div><div className="mt-1 text-[7px] text-[#81786F]">{row.status} · {row.source_type}</div></div><div className="text-right"><div className="text-[9px] font-semibold">{money(row.amount,row.currency_code)}</div>{payable?<button onClick={()=>startPayment(row.id)} disabled={paymentBusyId===row.id} className="mt-2 rounded-lg bg-[#1D1A17] px-3 py-2 text-[7px] font-semibold text-white disabled:opacity-40">{paymentBusyId===row.id?"Opening…":"Pay securely"}</button>:null}</div></div></div>})}</div>
        </Panel>
      </div>
    </div> : null}

    {section === "orders" ? <Panel eyebrow="Commercial" title="Orders">
      <div className="space-y-2">{orders.map((row)=><article key={row.id} className="rounded-[16px] border border-black/[.06] bg-[#FBFAF8] p-4"><div className="flex flex-wrap items-start justify-between gap-4"><div><div className="text-[10px] font-semibold">{row.order_number || "Order"}</div><div className="mt-1 text-[8px] text-[#81786F]">{row.status} · payment {row.payment_status} · fulfillment {row.fulfillment_status}</div></div><div className="text-right"><div className="text-[10px] font-semibold">{money(row.total_amount,row.currency_code)}</div><div className="mt-1 text-[7px] text-[#81786F]">Remaining {money(row.remaining_balance,row.currency_code)}</div></div></div></article>)}</div>
      {!orders.length ? <div className="text-[9px] text-[#81786F]">No customer orders are visible for this relationship.</div> : null}
    </Panel> : null}

    {section === "invoices" ? <Panel eyebrow="Accounts receivable" title="Invoices">
      <div className="overflow-x-auto"><table className="min-w-full text-left text-[9px]"><thead className="text-[#91877C]"><tr><th className="pb-2 pr-4">Invoice</th><th className="pb-2 pr-4">Date</th><th className="pb-2 pr-4">Due</th><th className="pb-2 pr-4">Status</th><th className="pb-2 pr-4 text-right">Total</th><th className="pb-2 text-right">Outstanding</th></tr></thead><tbody className="divide-y divide-black/[.06]">{invoices.map((row)=><tr key={row.id}><td className="py-3 pr-4 font-semibold">{row.invoice_number}</td><td className="py-3 pr-4">{when(row.invoice_date)}</td><td className="py-3 pr-4">{when(row.due_date)}</td><td className="py-3 pr-4">{row.status}</td><td className="py-3 pr-4 text-right">{money(row.total_amount,row.currency_code || "THB")}</td><td className="py-3 text-right font-semibold">{money(row.outstanding_balance ?? row.outstanding_amount ?? 0,row.currency_code || "THB")}</td></tr>)}</tbody></table></div>
      {!invoices.length ? <div className="py-5 text-[9px] text-[#81786F]">No invoices are visible for this relationship.</div> : null}
    </Panel> : null}

    {section === "payments" ? <div className="space-y-4">
      <Panel eyebrow="Payment requests" title="Requested payments">
        <div className="space-y-2">{paymentRequests.map((row)=>{const payable=["PENDING","CHECKOUT_CREATED","FAILED"].includes(String(row.status||"").toUpperCase());return <div key={row.id} className="rounded-[15px] border border-black/[.06] bg-[#FBFAF8] p-4"><div className="flex flex-wrap items-center justify-between gap-4"><div><div className="text-[9px] font-semibold">{row.description}</div><div className="mt-1 text-[7px] text-[#81786F]">{row.status} · {row.provider} · {row.source_type}</div></div><div className="text-right"><div className="text-[10px] font-semibold">{money(row.amount,row.currency_code)}</div>{payable?<button onClick={()=>startPayment(row.id)} disabled={paymentBusyId===row.id} className="mt-2 rounded-lg bg-[#1D1A17] px-4 py-2 text-[8px] font-semibold text-white disabled:opacity-40">{paymentBusyId===row.id?"Opening secure checkout…":"Pay by card"}</button>:null}{String(row.status||"").toUpperCase()==="PAID"?<div className="mt-1 text-[7px] font-semibold text-emerald-700">Paid {row.settled_at?when(row.settled_at):""}</div>:null}</div></div></div>})}</div>
        {!paymentRequests.length ? <div className="text-[9px] text-[#81786F]">No payment requests.</div> : null}
      </Panel>
      <Panel eyebrow="Payment history" title="Recorded customer payments">
        <div className="space-y-2">{payments.map((row)=><div key={row.id} className="flex items-center justify-between gap-4 rounded-[15px] border border-black/[.06] p-4"><div><div className="text-[9px] font-semibold">{row.payment_number || row.reference_number || "Payment"}</div><div className="mt-1 text-[7px] text-[#81786F]">{when(row.payment_date)} · {row.payment_method || "Payment"} · {row.status || ""}</div></div><div className="text-[10px] font-semibold">{money(row.amount,row.currency_code || "THB")}</div></div>)}</div>
        {!payments.length ? <div className="text-[9px] text-[#81786F]">No payments recorded yet.</div> : null}
      </Panel>
    </div> : null}

    {section === "bookings" ? <Panel eyebrow="Hospitality" title="Bookings">
      <div className="space-y-2">{bookings.map((row)=><article key={row.id} className="rounded-[16px] border border-black/[.06] bg-[#FBFAF8] p-4"><div className="flex flex-wrap items-start justify-between gap-4"><div><div className="text-[10px] font-semibold">{row.booking_reference || "Booking"}</div><div className="mt-1 text-[8px] text-[#81786F]">{when(row.check_in_date)} → {when(row.check_out_date)} · {row.status} · {row.adults} adult(s){row.children ? " · " + row.children + " child(ren)" : ""}</div><div className="mt-1 text-[7px] text-[#81786F]">Pre-arrival {row.pre_arrival_status} · Registration {row.registration_status}</div></div><div className="text-right"><div className="text-[10px] font-semibold">{money(row.total_amount,row.currency_code || "THB")}</div><div className="mt-1 text-[7px] text-[#81786F]">{row.payment_status} · paid {money(row.paid_amount,row.currency_code || "THB")}</div></div></div></article>)}</div>
      {!bookings.length ? <div className="text-[9px] text-[#81786F]">No hospitality bookings are linked to this customer Party.</div> : null}
    </Panel> : null}

    {section === "profile" ? <div className="grid gap-4 xl:grid-cols-2">
      <Panel eyebrow="Customer relationship" title={customer.display_name || customer.legal_name || "Customer"}>
        <div className="grid gap-2 text-[9px] text-[#756E66]"><div>Email: {customer.email || "—"}</div><div>Phone: {customer.phone || "—"}</div><div>Address: {customer.address || "—"}</div><div>Status: {customer.status || "active"}</div></div>
      </Panel>
      <Panel eyebrow="Business" title={organization.name || organization.legal_name || "Organization"}>
        <div className="text-[9px] leading-5 text-[#756E66]">This secure session only exposes records where both the organization and Party match this customer relationship. It does not grant staff access or internal organization membership.</div>
      </Panel>
    </div> : null}
  </div>;
}
