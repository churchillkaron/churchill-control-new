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
  ShieldCheck,
  WalletCards,
} from "lucide-react";

import { getWorkspaceGroups } from "@/lib/platform/registry/erpRegistry";
import { resolveWorkspaceRoute } from "@/lib/platform/routing/resolveWorkspaceRoute";

const REPORT_WORDS = [
  "report", "statement of cash flows", "financial statement", "analytics", "forecast", "budget", "insight", "kpi", "health", "dashboard",
];

const CONFIGURE_WORDS = [
  "setting", "configuration", "configure", "fiscal period", "dimension", "currency", "exchange rate", "posting rule", "payment term", "template", "work program", "tax setup", "vat setup",
];

const AREAS = [
  { id: "ledger", label: "Ledger", icon: BookOpenCheck, words: ["ledger", "journal", "trial balance", "chart of account", "account balance", "opening balance", "accounting entry", "recurring journal"] },
  { id: "receivables", label: "Receivables", icon: ReceiptText, words: ["receivable", "customer invoice", "customer payment", "customer credit", "customer statement", "collection", "dunning", "revenue recognition"] },
  { id: "payables", label: "Payables", icon: Banknote, words: ["payable", "vendor bill", "vendor invoice", "supplier invoice", "vendor payment", "supplier payment", "vendor statement", "supplier statement", "expense claim"] },
  { id: "banking", label: "Banking", icon: Landmark, words: ["bank", "reconciliation", "cash management", "treasury", "cash account", "payment run"] },
  { id: "assets", label: "Assets", icon: Building2, words: ["fixed asset", "asset register", "depreciation", "asset"] },
  { id: "tax", label: "Tax", icon: ShieldCheck, words: ["vat", "tax", "statutory", "withholding", "filing", "gst"] },
];

const CORE_DESK = [
  { label: "Trial Balance", words: ["trial balance"] },
  { label: "General Ledger", words: ["general ledger"] },
  { label: "Customer Invoices", words: ["customer invoice"] },
  { label: "Vendor Bills", words: ["vendor bill", "vendor invoice"] },
  { label: "Bank Reconciliation", words: ["bank reconciliation"] },
  { label: "Journals", words: ["journal"] },
];

function clean(value) {
  return String(value || "").trim();
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

function isBooksItem(item) {
  const haystack = capabilityText(item);
  return !REPORT_WORDS.some((word) => haystack.includes(word)) && !CONFIGURE_WORDS.some((word) => haystack.includes(word));
}

function resolveArea(item) {
  for (const area of AREAS) {
    if (area.words.some((word) => item.classificationText.includes(word))) return area.id;
  }
  return "ledger";
}

function firstMatch(items, words, used) {
  return items.find((item) => !used.has(item.id) && words.some((word) => item.classificationText.includes(word)) && !item.disabled) || null;
}

export default function FinanceBooksDesk({ organizationId }) {
  const [query, setQuery] = useState("");
  const [activeArea, setActiveArea] = useState("ledger");
  const [recentIds, setRecentIds] = useState([]);
  const groups = useMemo(() => getWorkspaceGroups("finance"), []);

  const items = useMemo(() => groups.flatMap((group) => (group.items || [])
    .filter((item) => isBooksItem(item))
    .map((item) => ({
      ...item,
      groupId: group.id,
      groupName: group.name,
      classificationText: capabilityText(item),
      searchText: searchText(group, item),
      disabled: unavailable(item),
    }))), [groups]);

  const categorizedItems = useMemo(() => items.map((item) => ({ ...item, area: resolveArea(item) })), [items]);

  const coreItems = useMemo(() => {
    const used = new Set();
    return CORE_DESK.map((slot) => {
      const item = firstMatch(categorizedItems, slot.words, used);
      if (item) used.add(item.id);
      return item ? { ...item, deskLabel: slot.label } : null;
    }).filter(Boolean);
  }, [categorizedItems]);

  useEffect(() => {
    if (!organizationId) return;
    try {
      const value = JSON.parse(window.localStorage.getItem(`avantiqo:finance:books:recent:${organizationId}`) || "[]");
      setRecentIds(Array.isArray(value) ? value.slice(0, 5) : []);
    } catch {
      setRecentIds([]);
    }
  }, [organizationId]);

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
            <div className="flex items-center gap-2 text-[9px] font-medium uppercase tracking-[0.16em] text-[#8A633C]"><BookOpenCheck size={11} /> Accounting records</div>
            <h1 className="mt-1.5 text-[22px] font-semibold tracking-[-0.03em]">Books</h1>
            <p className="mt-1 max-w-3xl text-[10px] leading-5 text-[#756F67]">Work directly in the accounting truth. Core books stay one click away; specialist records remain organized by accounting purpose.</p>
          </div>
          <label className="flex h-9 w-full items-center gap-2 rounded-xl border border-black/[0.08] bg-white px-3 lg:w-[340px]"><Search size={12} className="text-[#A29D95]" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Find an account, journal, invoice, bank or tax record…" className="min-w-0 flex-1 bg-transparent text-[10px] text-[#403C37] outline-none placeholder:text-[#B2ADA5]" /></label>
        </div>

        <div className="mt-5 border-t border-black/[0.06] pt-4">
          <div className="flex items-center justify-between gap-3">
            <div><div className="text-[9px] font-semibold text-[#4B4640]">Core desk</div><div className="mt-0.5 text-[8px] text-[#99938A]">The books accountants reach for most often.</div></div>
            <span className="text-[8px] text-[#A09990]">{categorizedItems.length} book capabilities</span>
          </div>
          <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
            {coreItems.map((item) => (
              <Link key={item.id} href={hrefFor(item)} onClick={() => remember(item.id)} className="group rounded-xl border border-black/[0.07] bg-white px-3 py-3 transition hover:border-[#D6A66A]/45 hover:bg-[#FFFCF7]">
                <div className="flex items-start justify-between gap-2"><WalletCards size={12} className="text-[#9A7045]" /><ArrowRight size={10} className="text-[#B5AFA7] transition group-hover:translate-x-0.5 group-hover:text-[#9A7045]" /></div>
                <div className="mt-2 text-[10px] font-semibold text-[#47423D]">{item.deskLabel}</div>
                <div className="mt-0.5 truncate text-[8px] text-[#9A948B]">{item.groupName}</div>
              </Link>
            ))}
          </div>
        </div>

        {recentItems.length ? (
          <div className="mt-4 flex flex-wrap items-center gap-1.5 border-t border-black/[0.055] pt-3">
            <span className="mr-1 text-[8px] font-semibold uppercase tracking-[0.08em] text-[#9B948B]">Recent</span>
            {recentItems.map((item) => <Link key={item.id} href={hrefFor(item)} onClick={() => remember(item.id)} className="rounded-lg border border-black/[0.065] bg-white px-2.5 py-1.5 text-[8px] font-medium text-[#625D56] transition hover:border-[#D6A66A]/40 hover:text-[#7A5838]">{item.name}</Link>)}
          </div>
        ) : null}

        <div className="mt-5 grid gap-4 lg:grid-cols-[180px_minmax(0,1fr)]">
          <aside className="rounded-2xl border border-black/[0.065] bg-white p-2">
            {AREAS.map((area) => {
              const Icon = area.icon;
              const selected = !needle && activeArea === area.id;
              return <button key={area.id} type="button" onClick={() => { setQuery(""); setActiveArea(area.id); }} className={`flex w-full items-center justify-between rounded-xl px-2.5 py-2 text-left transition ${selected ? "bg-[#A37849]/[0.09] text-[#6F5032]" : "text-[#68625B] hover:bg-[#FAF8F4]"}`}><span className="flex items-center gap-2 text-[9px] font-semibold"><Icon size={11} />{area.label}</span><span className="text-[8px] tabular-nums text-[#A49E95]">{areaCounts[area.id] || 0}</span></button>;
            })}
          </aside>

          <section className="overflow-hidden rounded-2xl border border-black/[0.065] bg-white">
            <div className="flex items-center justify-between gap-3 border-b border-black/[0.055] px-4 py-3">
              <div><div className="text-[10px] font-semibold text-[#45413C]">{needle ? "Search results" : AREAS.find((area) => area.id === activeArea)?.label}</div><div className="mt-0.5 text-[8px] text-[#99938A]">{visibleItems.length} capability{visibleItems.length === 1 ? "" : "ies"}</div></div>
              {needle ? <button type="button" onClick={() => setQuery("")} className="text-[8px] font-medium text-[#8A633C]">Clear search</button> : null}
            </div>
            <div className="divide-y divide-black/[0.05]">
              {visibleItems.map((item) => {
                const row = <><div className="min-w-0"><div className="truncate text-[10px] font-medium text-[#47423D]">{item.name}</div><div className="mt-0.5 line-clamp-1 text-[8px] text-[#99938A]">{item.description || item.groupName}</div></div><div className="flex shrink-0 items-center gap-3"><span className="hidden text-[8px] text-[#AAA39A] md:block">{item.groupName}</span>{item.disabled ? <span className="text-[7px] font-semibold uppercase tracking-[0.06em] text-[#A39D95]">{clean(item.status) || "Unavailable"}</span> : <ArrowRight size={10} className="text-[#B3ADA5]" />}</div></>;
                return item.disabled ? <div key={item.id} className="flex items-center justify-between gap-4 px-4 py-3 opacity-45">{row}</div> : <Link key={item.id} href={hrefFor(item)} onClick={() => remember(item.id)} className="group flex items-center justify-between gap-4 px-4 py-3 transition hover:bg-[#FCFAF6]">{row}</Link>;
              })}
              {!visibleItems.length ? <div className="px-4 py-8 text-center text-[9px] text-[#918B83]">No book capabilities match this view.</div> : null}
            </div>
          </section>
        </div>
      </section>
    </div>
  );
}
