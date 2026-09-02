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
  if (id.includes("marketing") || id.includes("campaign") || id.includes("design") || id.includes("social") || id.includes("meta_ads")) return Sparkles;
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
        <div className="text-[11px] font-medium uppercase tracking-[0.24em] text-[#A37849]">Work Centers</div>
        <div className="flex w-full items-center rounded-xl border border-black/[0.08] bg-white px-3.5 py-2.5 text-[#8B8881] shadow-[0_1px_2px_rgba(0,0,0,0.02)] md:w-[360px]">
          <Search size={15} />
          <input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search this workspace…" className="ml-2.5 w-full bg-transparent text-[12px] text-[#2C2A27] outline-none placeholder:text-[#AAA69E]" />
        </div>
      </div>

      {favoriteItems.length > 0 && (
        <div className="rounded-[24px] border border-[#D6A66A]/25 bg-[#FBF7F1] p-5">
          <div className="mb-4 text-[10px] font-medium uppercase tracking-[0.2em] text-[#9A744B]">Favorites</div>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {favoriteItems.map(item => (
              <Link key={item.id} href={resolveWorkspaceRoute({ organizationId: fallbackOrganizationId, moduleId: item.id, workspaceId: workspace, route: item.route })} className="group flex items-center justify-between rounded-xl border border-black/[0.07] bg-white px-4 py-3 text-[12px] font-medium text-[#4D4943] transition hover:border-[#D6A66A]/45 hover:text-[#8D643C]">
                <span>{item.name}</span><ArrowRight size={15} />
              </Link>
            ))}
          </div>
        </div>
      )}

      {groups.length === 0 ? (
        <div className="rounded-2xl border border-black/[0.075] bg-white p-6 text-[12px] text-[#77736C]">No workspace modules configured.</div>
      ) : visibleGroups.length === 0 ? (
        <div className="rounded-2xl border border-black/[0.075] bg-white p-6 text-[12px] text-[#77736C]">No matching work centers.</div>
      ) : (
        <div className="grid gap-5 xl:grid-cols-2">
          {visibleGroups.map(group => {
            const disabledCount = group.items.filter(isDisabledItem).length;
            const activeCount = group.items.length - disabledCount;
            return (
              <section key={group.id} className="rounded-[26px] border border-black/[0.075] bg-white p-5 shadow-[0_10px_30px_rgba(31,27,20,0.045)]">
                <div className="mb-5 flex items-start justify-between gap-4">
                  <div>
                    <h3 className="text-[17px] font-semibold tracking-[-0.02em] text-[#24221F]">{group.name}</h3>
                    {group.description && <p className="mt-1.5 text-[12px] leading-5 text-[#77736C]">{group.description}</p>}
                  </div>
                  <div className="rounded-full border border-black/[0.07] bg-[#F7F6F3] px-3 py-1 text-[10px] font-medium text-[#8C8881]">{disabledCount ? `${activeCount} active · ${disabledCount} unavailable` : group.items.length}</div>
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  {group.items.map(item => {
                    const Icon = getIcon(item, group);
                    const disabled = isDisabledItem(item);
                    const content = (
                      <>
                        <div className="flex items-start justify-between gap-4">
                          <div className={`rounded-xl border p-2.5 ${disabled ? "border-black/[0.06] bg-[#F4F2EF] text-[#BBB7B0]" : "border-[#D6A66A]/22 bg-[#D6A66A]/[0.08] text-[#A37849]"}`}><Icon size={18} /></div>
                          {disabled ? <span className="rounded-full border border-black/[0.07] bg-[#F7F6F3] px-2.5 py-1 text-[9px] font-medium uppercase tracking-[0.12em] text-[#AAA69E]">{getStatusLabel(item)}</span> : <ArrowRight size={16} className="mt-2 text-[#B8B4AD] transition group-hover:translate-x-0.5 group-hover:text-[#A37849]" />}
                        </div>
                        <div className={`mt-4 text-[13px] font-semibold ${disabled ? "text-[#9D9992]" : "text-[#2A2825]"}`}>{item.name}</div>
                        <div className={`mt-1.5 text-[11px] leading-5 ${disabled ? "text-[#B4B0A8]" : "text-[#7E7A73]"}`}>{item.description || "Open this capability."}</div>
                      </>
                    );
                    if (disabled) return <div key={item.id} aria-disabled="true" className="cursor-not-allowed rounded-2xl border border-black/[0.055] bg-[#F7F6F3] p-4 opacity-80">{content}</div>;
                    return <Link key={item.id} href={resolveWorkspaceRoute({ organizationId: fallbackOrganizationId, moduleId: item.id, workspaceId: workspace, route: item.route })} className="group rounded-2xl border border-black/[0.07] bg-[#FBFAF8] p-4 transition hover:-translate-y-0.5 hover:border-[#D6A66A]/42 hover:bg-[#FBF7F1] hover:shadow-[0_8px_22px_rgba(31,27,20,0.05)]">{content}</Link>;
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
