"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  Banknote,
  BookOpenCheck,
  Building2,
  Landmark,
  ReceiptText,
  Search,
  WalletCards,
} from "lucide-react";

import { getWorkspaceGroups } from "@/lib/platform/registry/erpRegistry";
import { resolveWorkspaceRoute } from "@/lib/platform/routing/resolveWorkspaceRoute";

const BOOK_AREA_BY_GROUP = Object.freeze({
  accounting: "ledger",
  order_to_cash: "sales",
  procure_to_pay: "purchases",
  treasury: "banking",
});

const BOOK_AREA_BY_ITEM = Object.freeze({
  fixed_assets: "assets",
  depreciation: "assets",
});

const BOOK_EXCLUDED_ITEMS = new Set([
  "fiscal_periods",
  "dimensions",
  "audit_trail",
  "tax",
  "vat_returns",
  "tax_codes",
  "depreciation",
  "period_close",
  "year_end",
  "statutory_filings",
]);

const AREAS = [
  { id: "ledger", label: "Ledger", icon: BookOpenCheck },
  { id: "sales", label: "Sales", icon: ReceiptText },
  { id: "purchases", label: "Purchases", icon: Banknote },
  { id: "banking", label: "Banking", icon: Landmark },
  { id: "assets", label: "Assets", icon: Building2 },
];

const CORE_DESK = [
  { id: "trial_balance", label: "Trial Balance" },
  { id: "general_ledger", label: "General Ledger" },
  { id: "customer_invoices", label: "Customer Invoices" },
  { id: "vendor_bills", label: "Vendor Bills" },
  { id: "bank_reconciliation", label: "Bank Reconciliation" },
  { id: "journals", label: "Journals" },
];

function clean(value) {
  return String(value || "").trim();
}

function money(value, currency = "THB") {
  const amount = Number(value || 0);
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 2 }).format(amount);
  } catch {
    return currency + " " + amount.toFixed(2);
  }
}

function unavailable(item) {
  return ["planned", "blocked", "disabled", "unavailable"].includes(clean(item?.status).toLowerCase());
}

function capabilityText(item) {
  return [item?.id, item?.name, item?.description, item?.route]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function searchText(group, item) {
  return [group?.id, group?.name, group?.description, capabilityText(item)]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function isBooksItem(group, item) {
  return Boolean(BOOK_AREA_BY_GROUP[group?.id]) && !BOOK_EXCLUDED_ITEMS.has(item?.id);
}

function resolveArea(item) {
  return BOOK_AREA_BY_ITEM[item?.id] || BOOK_AREA_BY_GROUP[item?.groupId] || "ledger";
}

export default function FinanceBooksDesk({ organizationId }) {
  const [query, setQuery] = useState("");
  const [activeArea, setActiveArea] = useState("ledger");
  const [recentIds, setRecentIds] = useState([]);
  const [supplierInvoiceInbox, setSupplierInvoiceInbox] = useState([]);
  const [supplierInvoiceLoading, setSupplierInvoiceLoading] = useState(false);
  const [supplierInvoiceBusyId, setSupplierInvoiceBusyId] = useState("");
  const groups = useMemo(() => getWorkspaceGroups("finance"), []);

  const items = useMemo(() => groups.flatMap((group) => (group.items || [])
    .filter((item) => isBooksItem(group, item))
    .map((item) => ({
      ...item,
      groupId: group.id,
      groupName: group.name,
      searchText: searchText(group, item),
      disabled: unavailable(item),
    }))), [groups]);

  const categorizedItems = useMemo(() => items.map((item) => ({ ...item, area: resolveArea(item) })), [items]);

  const coreItems = useMemo(() => CORE_DESK.map((slot) => {
    const item = categorizedItems.find((candidate) => candidate.id === slot.id && !candidate.disabled);
    return item ? { ...item, deskLabel: slot.label } : null;
  }).filter(Boolean), [categorizedItems]);

  useEffect(() => {
    if (!organizationId) return;
    try {
      const value = JSON.parse(window.localStorage.getItem(`avantiqo:finance:books:recent:${organizationId}`) || "[]");
      setRecentIds(Array.isArray(value) ? value.slice(0, 5) : []);
    } catch {
      setRecentIds([]);
    }
  }, [organizationId]);

  useEffect(() => {
    if (!organizationId) {
      setSupplierInvoiceInbox([]);
      return;
    }
    let active = true;
    setSupplierInvoiceLoading(true);
    fetch(`/api/finance/supplier-invoice-submissions?organizationId=${encodeURIComponent(organizationId)}`, { cache: "no-store" })
      .then(async (response) => {
        const payload = await response.json().catch(() => ({}));
        if (!response.ok || !payload?.success) {
          if ([401,403].includes(response.status)) return [];
          throw new Error(payload?.error || "Unable to load supplier invoice submissions");
        }
        return payload.submissions || [];
      })
      .then((rows) => { if (active) setSupplierInvoiceInbox(rows); })
      .catch(() => { if (active) setSupplierInvoiceInbox([]); })
      .finally(() => { if (active) setSupplierInvoiceLoading(false); });
    return () => { active = false; };
  }, [organizationId]);

  async function reviewSupplierInvoice(submissionId, action) {
    if (!organizationId || !submissionId) return;
    let reviewNote = "";
    if (action === "REJECT") {
      reviewNote = window.prompt("Why is this supplier invoice being rejected?") || "";
      if (!reviewNote.trim()) return;
    }
    setSupplierInvoiceBusyId(submissionId);
    try {
      const response = await fetch("/api/finance/supplier-invoice-submissions", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ organizationId, submissionId, action, reviewNote }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload?.success) throw new Error(payload?.error || "Unable to review supplier invoice");
      setSupplierInvoiceInbox((current) => current.map((row) => row.id === submissionId ? { ...row, ...payload.submission } : row));
    } catch (error) {
      window.alert(error?.message || "Unable to review supplier invoice");
    } finally {
      setSupplierInvoiceBusyId("");
    }
  }

  const remember = (id) => {
    if (!organizationId || !id) return;
    setRecentIds((current) => {
      const next = [id, ...current.filter((value) => value !== id)].slice(0, 5);
      try {
        window.localStorage.setItem(`avantiqo:finance:books:recent:${organizationId}`, JSON.stringify(next));
      } catch {}
      return next;
    });
  };

  const recentItems = useMemo(() => recentIds.map((id) => categorizedItems.find((item) => item.id === id)).filter(Boolean), [recentIds, categorizedItems]);
  const needle = query.trim().toLowerCase();
  const visibleItems = useMemo(() => categorizedItems.filter((item) => needle ? item.searchText.includes(needle) : item.area === activeArea), [categorizedItems, activeArea, needle]);
  const areaCounts = useMemo(() => Object.fromEntries(AREAS.map((area) => [area.id, categorizedItems.filter((item) => item.area === area.id).length])), [categorizedItems]);

  const hrefFor = (item) => resolveWorkspaceRoute({ organizationId, workspaceId: "finance", moduleId: item.id, route: item.route });

  return (
    <div className="mx-auto max-w-[1720px] text-[#2A2723]">
      <section className="rounded-[24px] border border-black/[0.07] bg-[#FBF8F3] p-4 md:p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.16em] text-[#8A633C]"><BookOpenCheck size={11} /> Accounting records</div>
            <h1 className="mt-1.5 text-[22px] font-semibold tracking-[-0.03em]">Books</h1>
            <p className="mt-1 max-w-3xl text-[10px] leading-5 text-[#756F67]">Work directly in the accounting truth. Core books stay one click away; specialist records remain organized by accounting purpose.</p>
          </div>
          <label className="flex h-9 w-full items-center gap-2 rounded-xl border border-black/[0.08] bg-white px-3 lg:w-[340px]"><Search size={12} className="text-[#A29D95]" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Find an account, journal, invoice, bank or tax record…" className="min-w-0 flex-1 bg-transparent text-[10px] text-[#403C37] outline-none placeholder:text-[#B2ADA5]" /></label>
        </div>

        <div className="mt-5 border-t border-black/[0.06] pt-4">
          <div className="flex items-center justify-between gap-3">
            <div><div className="text-[11px] font-semibold text-[#4B4640]">Core desk</div><div className="mt-0.5 text-[11px] text-[#99938A]">The books accountants reach for most often.</div></div>
            <span className="text-[11px] text-[#A09990]">{categorizedItems.length} book capabilities</span>
          </div>
          <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
            {coreItems.map((item) => (
              <Link key={item.id} href={hrefFor(item)} onClick={() => remember(item.id)} className="group rounded-xl border border-black/[0.07] bg-white px-3 py-3 transition hover:border-[#D6A66A]/45 hover:bg-[#FFFCF7]">
                <div className="flex items-start justify-between gap-2"><WalletCards size={12} className="text-[#9A7045]" /><ArrowRight size={10} className="text-[#B5AFA7] transition group-hover:translate-x-0.5 group-hover:text-[#9A7045]" /></div>
                <div className="mt-2 text-[10px] font-semibold text-[#47423D]">{item.deskLabel}</div>
                <div className="mt-0.5 truncate text-[11px] text-[#9A948B]">{item.groupName}</div>
              </Link>
            ))}
          </div>
        </div>

        {recentItems.length ? (
          <div className="mt-4 flex flex-wrap items-center gap-1.5 border-t border-black/[0.055] pt-3">
            <span className="mr-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-[#9B948B]">Recent</span>
            {recentItems.map((item) => <Link key={item.id} href={hrefFor(item)} onClick={() => remember(item.id)} className="rounded-lg border border-black/[0.065] bg-white px-2.5 py-1.5 text-[11px] font-medium text-[#625D56] transition hover:border-[#D6A66A]/40 hover:text-[#7A5838]">{item.name}</Link>)}
          </div>
        ) : null}

        {!query && activeArea === "payables" ? (
          <div className="mt-5 rounded-2xl border border-[#D6A66A]/20 bg-[#FFF9F1] p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="text-[9px] font-semibold uppercase tracking-[0.14em] text-[#8A633C]">Supplier invoice inbox</div>
                <div className="mt-1 text-[13px] font-semibold text-[#403B35]">External invoices waiting for Accounts Payable review</div>
                <div className="mt-1 text-[10px] leading-5 text-[#777067]">Reviewing supplier evidence does not post accounting. Accept only moves the submission into AP processing; canonical vendor invoice creation remains a separate Finance action.</div>
              </div>
              <div className="rounded-full border border-[#D6A66A]/20 bg-white px-3 py-1.5 text-[9px] font-semibold text-[#76502E]">{supplierInvoiceInbox.filter((row) => ["SUBMITTED","UNDER_REVIEW"].includes(String(row.status || "").toUpperCase())).length} pending</div>
            </div>

            <div className="mt-4 space-y-2">
              {supplierInvoiceInbox.map((row) => {
                const status = String(row.status || "").toUpperCase();
                const busy = supplierInvoiceBusyId === row.id;
                return <div key={row.id} className="rounded-xl border border-black/[0.065] bg-white p-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2"><span className="text-[10px] font-semibold text-[#46413B]">{row.supplier?.business_name || row.supplier?.display_name || row.supplier?.email || "Supplier"}</span><span className="rounded-full border border-black/[0.07] px-2 py-0.5 text-[7px] font-semibold text-[#777067]">{status}</span></div>
                      <div className="mt-1 text-[10px] text-[#777067]">Invoice {row.invoice_number} · {row.invoice_date}{row.purchase_order?.po_number ? " · " + row.purchase_order.po_number : ""}</div>
                      {row.supplier_note ? <div className="mt-1 text-[9px] text-[#918A81]">{row.supplier_note}</div> : null}
                      {row.document?.file_url ? <a href={row.document.file_url} target="_blank" rel="noreferrer" className="mt-2 inline-flex text-[9px] font-semibold text-[#8A633C]">{row.document.file_name || "Open supplier invoice"} ↗</a> : null}
                      {row.review_note ? <div className="mt-2 text-[9px] text-[#76502E]">Review note · {row.review_note}</div> : null}
                    </div>
                    <div className="text-right">
                      <div className="text-[11px] font-semibold text-[#3E3933]">{money(row.total_amount,row.currency_code || "THB")}</div>
                      {status === "ACCEPTED" ? <div className="mt-1 text-[8px] font-semibold text-emerald-700">Ready for canonical AP creation</div> : null}
                      {status === "CONVERTED" ? <div className="mt-1 text-[8px] font-semibold text-emerald-700">Canonical Vendor Bill created</div> : null}
                      {status === "REJECTED" ? <div className="mt-1 text-[8px] font-semibold text-red-700">Returned to supplier</div> : null}
                    </div>
                  </div>
                  {["SUBMITTED","UNDER_REVIEW"].includes(status) ? <div className="mt-3 flex flex-wrap gap-2">
                    {status === "SUBMITTED" ? <button type="button" onClick={() => reviewSupplierInvoice(row.id,"START_REVIEW")} disabled={busy} className="rounded-lg border border-black/[0.08] px-3 py-2 text-[8px] font-semibold text-[#625D56] disabled:opacity-40">Start review</button> : null}
                    <button type="button" onClick={() => reviewSupplierInvoice(row.id,"ACCEPT")} disabled={busy} className="rounded-lg bg-[#2D2924] px-3 py-2 text-[8px] font-semibold text-white disabled:opacity-40">Accept into AP</button>
                    <button type="button" onClick={() => reviewSupplierInvoice(row.id,"REJECT")} disabled={busy} className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[8px] font-semibold text-red-700 disabled:opacity-40">Reject</button>
                  </div> : null}
                  {status === "ACCEPTED" ? <div className="mt-3"><Link href={`/workspace/${organizationId}/finance/vendor-bills?supplierSubmissionId=${encodeURIComponent(row.id)}`} className="inline-flex rounded-lg bg-[#2D2924] px-3 py-2 text-[8px] font-semibold text-white">Create canonical Vendor Bill →</Link></div> : null}
                </div>;
              })}
              {!supplierInvoiceLoading && !supplierInvoiceInbox.length ? <div className="rounded-xl border border-dashed border-black/[0.08] bg-white/70 px-4 py-6 text-center text-[10px] text-[#918A81]">No supplier-submitted invoices are waiting in this organization.</div> : null}
              {supplierInvoiceLoading ? <div className="px-2 py-3 text-[10px] text-[#918A81]">Loading supplier invoice inbox…</div> : null}
            </div>
          </div>
        ) : null}

        <div className="mt-5 grid gap-4 lg:grid-cols-[180px_minmax(0,1fr)]">
          <aside className="rounded-2xl border border-black/[0.065] bg-white p-2">
            {AREAS.map((area) => {
              const Icon = area.icon;
              const selected = !needle && activeArea === area.id;
              return <button key={area.id} type="button" onClick={() => { setQuery(""); setActiveArea(area.id); }} className={`flex w-full items-center justify-between rounded-xl px-2.5 py-2 text-left transition ${selected ? "bg-[#A37849]/[0.09] text-[#6F5032]" : "text-[#68625B] hover:bg-[#FAF8F4]"}`}><span className="flex items-center gap-2 text-[11px] font-semibold"><Icon size={11} />{area.label}</span><span className="text-[11px] tabular-nums text-[#A49E95]">{areaCounts[area.id] || 0}</span></button>;
            })}
          </aside>

          <section className="overflow-hidden rounded-2xl border border-black/[0.065] bg-white">
            <div className="flex items-center justify-between gap-3 border-b border-black/[0.055] px-4 py-3">
              <div><div className="text-[10px] font-semibold text-[#45413C]">{needle ? "Search results" : AREAS.find((area) => area.id === activeArea)?.label}</div><div className="mt-0.5 text-[11px] text-[#99938A]">{visibleItems.length} capability{visibleItems.length === 1 ? "" : "ies"}</div></div>
              {needle ? <button type="button" onClick={() => setQuery("")} className="text-[11px] font-medium text-[#8A633C]">Clear search</button> : null}
            </div>
            <div className="divide-y divide-black/[0.05]">
              {visibleItems.map((item) => {
                const row = <><div className="min-w-0"><div className="truncate text-[10px] font-medium text-[#47423D]">{item.name}</div><div className="mt-0.5 line-clamp-1 text-[11px] text-[#99938A]">{item.description || item.groupName}</div></div><div className="flex shrink-0 items-center gap-3"><span className="hidden text-[11px] text-[#AAA39A] md:block">{item.groupName}</span>{item.disabled ? <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[#A39D95]">{clean(item.status) || "Unavailable"}</span> : <ArrowRight size={10} className="text-[#B3ADA5]" />}</div></>;
                return item.disabled ? <div key={item.id} className="flex items-center justify-between gap-4 px-4 py-3 opacity-45">{row}</div> : <Link key={item.id} href={hrefFor(item)} onClick={() => remember(item.id)} className="group flex items-center justify-between gap-4 px-4 py-3 transition hover:bg-[#FCFAF6]">{row}</Link>;
              })}
              {!visibleItems.length ? <div className="px-4 py-8 text-center text-[11px] text-[#918B83]">No book capabilities match this view.</div> : null}
            </div>
          </section>
        </div>
      </section>
    </div>
  );
}
