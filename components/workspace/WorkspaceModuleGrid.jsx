"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowRight, Banknote, BarChart3, Bot, BriefcaseBusiness, Building2,
  ChefHat, ClipboardList, FileText, FolderOpen, Landmark, LineChart,
  Package, ReceiptText, Search, Settings, ShieldCheck, Sparkles, Store,
  Users, Wrench,
} from "lucide-react";

import { useBusinessContext } from "@/app/providers/BusinessContextProvider";
import { getWorkspaceGroups } from "@/lib/platform/registry/erpRegistry";
import { serializeCapability } from "@/lib/platform/registry/serializeCapability";
import { resolveWorkspaceRoute } from "@/lib/platform/routing/resolveWorkspaceRoute";

const DISABLED_STATUSES = new Set([
  "planned", "blocked", "partial", "unproven", "disabled", "unavailable", "coming-soon", "coming_soon",
]);

function normalizeItemForWorkspace(item, workspace) {
  const finance = String(workspace || "").toLowerCase() === "finance";
  const normalized = finance ? serializeCapability(item) : item;

  if (!finance || !normalized) return normalized;

  if (normalized.id === "cost_centers") {
    return {
      ...normalized,
      name: "Cost Centres",
      description:
        "Define operating areas such as Kitchen, Bar and Administration for cost responsibility and reporting.",
    };
  }

  if (normalized.id === "dimensions") {
    return {
      ...normalized,
      name: "Custom Dimensions",
      description:
        "Define additional controlled reporting attributes such as Sales Channel, Shift, Campaign or Customer Segment.",
      document: "CustomDimension",
    };
  }

  return normalized;
}

function organizeFinanceGroups(groups, workspace) {
  if (String(workspace || "").toLowerCase() !== "finance") return groups;

  let costCentres = null;
  let customDimensions = null;

  const remainingGroups = groups
    .map((group) => ({
      ...group,
      items: (group.items || []).filter((item) => {
        if (item?.id === "cost_centers") {
          costCentres = item;
          return false;
        }
        if (item?.id === "dimensions") {
          customDimensions = item;
          return false;
        }
        return true;
      }),
    }))
    .filter((group) => group.items.length > 0);

  const dimensionItems = [costCentres, customDimensions].filter(Boolean);
  if (!dimensionItems.length) return remainingGroups;

  const accountingIndex = remainingGroups.findIndex(
    (group) => group.id === "accounting"
  );
  const insertAt = accountingIndex >= 0 ? accountingIndex + 1 : 0;

  remainingGroups.splice(insertAt, 0, {
    id: "accounting_dimensions",
    name: "Dimensions & Analysis",
    description:
      "Use Cost Centres for operating responsibility and Custom Dimensions for additional reporting analysis.",
    order: 15,
    items: dimensionItems,
  });

  return remainingGroups;
}

function getItemStatus(item) {
  if (item?.hidden === true) return "hidden";
  const status = String(item?.status || "").trim().toLowerCase();
  if (!status && item?.disabled === true) return "disabled";
  return status;
}

function isHiddenItem(item) {
  return getItemStatus(item) === "hidden";
}

function isDisabledItem(item) {
  return DISABLED_STATUSES.has(getItemStatus(item));
}

function getStatusLabel(item) {
  const status = getItemStatus(item);
  if (status === "coming-soon" || status === "coming_soon") return "Coming soon";
  if (status === "planned") return "Planned";
  if (status === "blocked") return "Blocked";
  if (status === "partial") return "Partial";
  if (status === "unproven") return "Unproven";
  if (status === "disabled" || status === "unavailable") return "Unavailable";
  return "";
}

function getIcon(item, group) {
  const id = `${item?.id || ""} ${group?.id || ""} ${item?.name || ""}`.toLowerCase();
  if (id.includes("finance") || id.includes("ledger") || id.includes("treasury") || id.includes("bank")) return Landmark;
  if (id.includes("payment") || id.includes("invoice") || id.includes("receipt") || id.includes("payable") || id.includes("receivable")) return ReceiptText;
  if (id.includes("cash") || id.includes("budget") || id.includes("cost")) return Banknote;
  if (id.includes("inventory") || id.includes("stock") || id.includes("supplier") || id.includes("purchase") || id.includes("warehouse")) return Package;
  if (id.includes("restaurant") || id.includes("pos") || id.includes("kitchen") || id.includes("menu") || id.includes("table")) return ChefHat;
  if (id.includes("hotel") || id.includes("front") || id.includes("room") || id.includes("guest")) return Store;
  if (id.includes("customer") || id.includes("contact") || id.includes("lead") || id.includes("loyalty")) return Users;
  if (id.includes("project") || id.includes("task") || id.includes("planning")) return ClipboardList;
  if (id.includes("marketing") || id.includes("campaign") || id.includes("design") || id.includes("social")) return Sparkles;
  if (id.includes("analytics") || id.includes("report") || id.includes("kpi") || id.includes("forecast")) return BarChart3;
  if (id.includes("ai") || id.includes("agent") || id.includes("automation")) return Bot;
  if (id.includes("document") || id.includes("file") || id.includes("ocr") || id.includes("contract")) return FolderOpen;
  if (id.includes("setting") || id.includes("admin") || id.includes("permission") || id.includes("role")) return Settings;
  if (id.includes("tax") || id.includes("audit") || id.includes("close") || id.includes("compliance")) return ShieldCheck;
  if (id.includes("maintenance") || id.includes("equipment") || id.includes("work")) return Wrench;
  if (id.includes("commercial") || id.includes("sales") || id.includes("quote") || id.includes("order")) return BriefcaseBusiness;
  if (id.includes("chart") || id.includes("statement")) return LineChart;
  if (id.includes("entity") || id.includes("organization")) return Building2;
  return FileText;
}

function flattenGroups(groups) {
  return groups.flatMap(group => (group.items || []).map(item => ({
    ...item,
    groupId: group.id,
    groupName: group.name,
    groupDescription: group.description,
  })));
}

export default function WorkspaceModuleGrid({ workspace, organizationId, title, description, items }) {
  const businessContext = useBusinessContext();
  const organization = businessContext?.organization || null;
  const fallbackOrganizationId = organizationId || businessContext?.organization_id || organization?.id || null;
  const registryGroups = getWorkspaceGroups(workspace);
  const rawGroups = items
    ? [{ id: "workspace", name: title || "Workspace", description: description || "Open a work center.", order: 10, items }]
    : registryGroups;

  const normalizedGroups = rawGroups
    .map(group => ({
      ...group,
      items: (group.items || [])
        .map(item => normalizeItemForWorkspace(item, workspace))
        .filter(item => item && !isHiddenItem(item)),
    }))
    .filter(group => group.items.length > 0);

  const groups = organizeFinanceGroups(normalizedGroups, workspace);

  const [query, setQuery] = useState("");
  const allItems = useMemo(() => flattenGroups(groups), [groups]);
  const normalizedQuery = query.trim().toLowerCase();
  const visibleGroups = useMemo(() => {
    if (!normalizedQuery) return groups;
    return groups
      .map(group => ({
        ...group,
        items: (group.items || []).filter(item => [
          group.name, group.description, item.name, item.description,
          getStatusLabel(item), ...(item.tags || []),
        ].filter(Boolean).join(" ").toLowerCase().includes(normalizedQuery)),
      }))
      .filter(group => group.items.length > 0);
  }, [groups, normalizedQuery]);
  const favoriteItems = allItems.filter(item => item.favorite && !isDisabledItem(item)).slice(0, 6);

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="text-xs uppercase tracking-[0.32em] text-[#D6A66A]/70">Work Centers</div>
        <div className="flex w-full items-center rounded-2xl border border-white/10 bg-white/[0.035] px-4 py-3 text-white/45 md:w-[360px]">
          <Search size={16} />
          <input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search this workspace…" className="ml-3 w-full bg-transparent text-sm text-white outline-none placeholder:text-white/35" />
        </div>
      </div>

      {favoriteItems.length > 0 && (
        <div className="rounded-[28px] border border-[#D6A66A]/20 bg-[#D6A66A]/[0.06] p-5">
          <div className="mb-4 text-xs uppercase tracking-[0.28em] text-[#D6A66A]">Favorites</div>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {favoriteItems.map(item => (
              <Link key={item.id} href={resolveWorkspaceRoute({ organizationId: fallbackOrganizationId, moduleId: item.id, workspaceId: workspace, route: item.route })} className="group flex items-center justify-between rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm font-medium text-white/70 transition hover:border-[#D6A66A]/40 hover:text-[#D6A66A]">
                <span>{item.name}</span><ArrowRight size={16} />
              </Link>
            ))}
          </div>
        </div>
      )}

      {groups.length === 0 ? (
        <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-6 text-sm text-white/45">No workspace modules configured.</div>
      ) : visibleGroups.length === 0 ? (
        <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-6 text-sm text-white/45">No matching work centers.</div>
      ) : (
        <div className="grid gap-5 xl:grid-cols-2">
          {visibleGroups.map(group => {
            const disabledCount = group.items.filter(isDisabledItem).length;
            const activeCount = group.items.length - disabledCount;
            return (
              <section key={group.id} className="rounded-[30px] border border-white/10 bg-white/[0.035] p-5 shadow-xl shadow-black/10">
                <div className="mb-5 flex items-start justify-between gap-4">
                  <div><h3 className="text-lg font-semibold text-white">{group.name}</h3>{group.description && <p className="mt-1 text-sm leading-6 text-white/42">{group.description}</p>}</div>
                  <div className="rounded-full border border-white/10 bg-black/25 px-3 py-1 text-xs text-white/35">{disabledCount ? `${activeCount} active · ${disabledCount} unavailable` : group.items.length}</div>
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  {group.items.map(item => {
                    const Icon = getIcon(item, group);
                    const disabled = isDisabledItem(item);
                    const content = (
                      <>
                        <div className="flex items-start justify-between gap-4">
                          <div className={`rounded-2xl border border-white/10 bg-black/30 p-2.5 ${disabled ? "text-white/25" : "text-[#D6A66A]"}`}><Icon size={19} /></div>
                          {disabled ? <span className="rounded-full border border-white/10 px-2.5 py-1 text-[10px] uppercase tracking-[0.18em] text-white/35">{getStatusLabel(item)}</span> : <ArrowRight size={17} className="mt-2 text-white/22" />}
                        </div>
                        <div className={`mt-4 text-sm font-semibold ${disabled ? "text-white/38" : "text-white"}`}>{item.name}</div>
                        <div className={`mt-1.5 text-xs leading-5 ${disabled ? "text-white/25" : "text-white/40"}`}>{item.description || "Open this capability."}</div>
                      </>
                    );
                    if (disabled) return <div key={item.id} aria-disabled="true" className="cursor-not-allowed rounded-2xl border border-white/[0.06] bg-black/10 p-4 opacity-75">{content}</div>;
                    return <Link key={item.id} href={resolveWorkspaceRoute({ organizationId: fallbackOrganizationId, moduleId: item.id, workspaceId: workspace, route: item.route })} className="group rounded-2xl border border-white/10 bg-black/20 p-4 transition hover:border-[#D6A66A]/40 hover:bg-[#D6A66A]/10">{content}</Link>;
                  })}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </section>
  );
}
