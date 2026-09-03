"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  ArrowRight,
  BookOpenCheck,
  FileText,
  Search,
  Settings2,
} from "lucide-react";

import { getWorkspaceGroups } from "@/lib/platform/registry/erpRegistry";
import { resolveWorkspaceRoute } from "@/lib/platform/routing/resolveWorkspaceRoute";
import { resolveFinanceCapabilitySection } from "@/lib/finance/ui/FinanceInformationArchitecture";

const AREA_COPY = {
  books: {
    eyebrow: "Accounting records",
    title: "Books",
    description: "The ledgers, receivables, payables, bank records, journals, assets and tax records that make up the accounting books.",
    icon: BookOpenCheck,
  },
  reports: {
    eyebrow: "Accounting output",
    title: "Reports",
    description: "Financial statements, management reporting, analytics, budgets and forecasts built from the accounting truth underneath.",
    icon: FileText,
  },
  configure: {
    eyebrow: "Finance setup",
    title: "Configure",
    description: "Accounting policies, periods, dimensions, currencies, posting rules, permissions and controlled integrations. Routine accounting stays out of this area.",
    icon: Settings2,
  },
};

function clean(value) {
  return String(value || "").trim();
}

function unavailable(item) {
  return ["planned", "blocked", "disabled", "unavailable"].includes(clean(item?.status).toLowerCase());
}

function searchText(group, item) {
  return [group?.id, group?.name, group?.description, item?.id, item?.name, item?.description, item?.route]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

export default function FinanceAreaHub({ organizationId, area = "books" }) {
  const [query, setQuery] = useState("");
  const copy = AREA_COPY[area] || AREA_COPY.books;
  const Icon = copy.icon;
  const groups = useMemo(() => getWorkspaceGroups("finance"), []);

  const visibleGroups = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return groups
      .map((group) => ({
        ...group,
        items: (group.items || []).filter((item) => {
          if (resolveFinanceCapabilitySection(item.id) !== area) return false;
          return !needle || searchText(group, item).includes(needle);
        }),
      }))
      .filter((group) => group.items.length > 0);
  }, [groups, area, query]);

  const count = visibleGroups.reduce((total, group) => total + group.items.length, 0);

  return (
    <div className="mx-auto max-w-[1720px] text-[#2A2723]">
      <section className="rounded-[24px] border border-black/[0.07] bg-[#FBF8F3] p-4 md:p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="flex items-center gap-2 text-[9px] font-medium uppercase tracking-[0.16em] text-[#8A633C]"><Icon size={11} /> {copy.eyebrow}</div>
            <h1 className="mt-1.5 text-[22px] font-semibold tracking-[-0.03em] text-[#2A2723]">{copy.title}</h1>
            <p className="mt-1 max-w-3xl text-[10px] leading-5 text-[#756F67]">{copy.description}</p>
          </div>
          <label className="flex h-9 w-full items-center gap-2 rounded-xl border border-black/[0.08] bg-white px-3 lg:w-[330px]"><Search size={12} className="text-[#A29D95]" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={`Find in ${copy.title.toLowerCase()}…`} className="min-w-0 flex-1 bg-transparent text-[10px] text-[#403C37] outline-none placeholder:text-[#B2ADA5]" /></label>
        </div>

        <div className="mt-4 text-[8px] text-[#99938A]">{count} accounting capabilit{count === 1 ? "y" : "ies"}</div>

        <div className="mt-3 grid gap-3 xl:grid-cols-3">
          {visibleGroups.map((group) => (
            <section key={group.id} className="overflow-hidden rounded-2xl border border-black/[0.07] bg-white">
              <div className="border-b border-black/[0.055] px-4 py-3">
                <div className="text-[10px] font-semibold text-[#45413C]">{group.name}</div>
                {group.description ? <div className="mt-0.5 line-clamp-2 text-[8px] leading-4 text-[#99938A]">{group.description}</div> : null}
              </div>
              <div className="divide-y divide-black/[0.05]">
                {(group.items || []).map((item) => {
                  const disabled = unavailable(item);
                  const href = resolveWorkspaceRoute({ organizationId, workspaceId: "finance", moduleId: item.id, route: item.route });
                  const row = <><div className="min-w-0"><div className="truncate text-[10px] font-medium text-[#4A4640]">{item.name}</div><div className="mt-0.5 line-clamp-1 text-[8px] text-[#99938A]">{item.description || "Finance capability"}</div></div>{disabled ? <span className="shrink-0 text-[7px] font-semibold uppercase tracking-[0.06em] text-[#A39D95]">{clean(item.status) || "Unavailable"}</span> : <ArrowRight size={10} className="shrink-0 text-[#B3ADA5]" />}</>;
                  return disabled ? <div key={item.id} className="flex items-center justify-between gap-3 px-4 py-3 opacity-50">{row}</div> : <Link key={item.id} href={href} className="group flex items-center justify-between gap-3 px-4 py-3 transition hover:bg-[#FCFAF6] hover:text-[#76583A]">{row}</Link>;
                })}
              </div>
            </section>
          ))}
        </div>

        {!visibleGroups.length ? <div className="mt-3 rounded-2xl border border-black/[0.07] bg-white p-8 text-center text-[9px] text-[#918B83]">No Finance capabilities match this view.</div> : null}
      </section>
    </div>
  );
}
