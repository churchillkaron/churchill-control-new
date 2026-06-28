"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  Banknote,
  BarChart3,
  Bot,
  BriefcaseBusiness,
  Building2,
  ChefHat,
  ClipboardList,
  FileText,
  FolderOpen,
  Landmark,
  LineChart,
  Package,
  ReceiptText,
  Search,
  Settings,
  ShieldCheck,
  Sparkles,
  Store,
  Users,
  Wrench,
} from "lucide-react";

import { useWorkspaceRuntime } from "@/app/providers/WorkspaceRuntimeProvider";
import {
  getWorkspaceGroups,
  getWorkspaceMeta,
} from "@/lib/platform/registry/erpRegistry";

import {
  resolveWorkspaceRoute,
} from "@/lib/platform/routing/resolveWorkspaceRoute";

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
  return groups.flatMap((group) =>
    (group.items || []).map((item) => ({
      ...item,
      groupId: group.id,
      groupName: group.name,
      groupDescription: group.description,
    }))
  );
}

export default function WorkspaceModuleGrid({
  workspace,
  organizationId,
  title,
  description,
  items,
}) {
  const {
    organization,
    runtime,
  } = useWorkspaceRuntime();

  const fallbackOrganizationId =
    organizationId ||
    organization?.id ||
    runtime?.activeOrganization?.id;

  const workspaceMeta =
    getWorkspaceMeta(workspace);

  const registryGroups =
    getWorkspaceGroups(workspace);

  const groups =
    items
      ? [
          {
            id: "workspace",
            name: title || "Workspace",
            description:
              description || "Open a work center.",
            order: 10,
            items,
          },
        ]
      : registryGroups;

  const [query, setQuery] = useState("");

  const allItems = useMemo(
    () => flattenGroups(groups),
    [groups]
  );

  const normalizedQuery =
    query.trim().toLowerCase();

  const visibleGroups = useMemo(() => {
    if (!normalizedQuery) return groups;

    return groups
      .map((group) => ({
        ...group,
        items: (group.items || []).filter((item) =>
          [
            group.name,
            group.description,
            item.name,
            item.description,
            ...(item.tags || []),
          ]
            .filter(Boolean)
            .join(" ")
            .toLowerCase()
            .includes(normalizedQuery)
        ),
      }))
      .filter((group) => group.items.length > 0);
  }, [groups, normalizedQuery]);

  const favoriteItems =
    allItems.filter((item) => item.favorite).slice(0, 6);

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="text-xs uppercase tracking-[0.32em] text-[#D6A66A]/70">
            Work Centers
          </div>


        </div>

        <div className="flex w-full items-center rounded-2xl border border-white/10 bg-white/[0.035] px-4 py-3 text-white/45 md:w-[360px]">
          <Search size={16} />
          <input
            value={query}
            onChange={(event) =>
              setQuery(event.target.value)
            }
            placeholder="Search this workspace..."
            className="ml-3 w-full bg-transparent text-sm text-white outline-none placeholder:text-white/35"
          />
        </div>
      </div>

      {favoriteItems.length > 0 && (
        <div className="rounded-[28px] border border-[#D6A66A]/20 bg-[#D6A66A]/[0.06] p-5">
          <div className="mb-4 text-xs uppercase tracking-[0.28em] text-[#D6A66A]">
            Favorites
          </div>

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {favoriteItems.map((item) => (
              <Link
                key={item.id}
                href={resolveWorkspaceRoute({
                  organizationId: fallbackOrganizationId,
                  moduleId: item.id,
                  route: item.route,
                })}
                className="group flex items-center justify-between rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm font-medium text-white/70 transition hover:border-[#D6A66A]/40 hover:text-[#D6A66A]"
              >
                <span>{item.name}</span>
                <ArrowRight
                  size={16}
                  className="text-white/25 transition group-hover:translate-x-1 group-hover:text-[#D6A66A]"
                />
              </Link>
            ))}
          </div>
        </div>
      )}

      {groups.length === 0 ? (
        <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-6 text-sm text-white/45">
          No workspace modules configured.
        </div>
      ) : visibleGroups.length === 0 ? (
        <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-6 text-sm text-white/45">
          No matching work centers.
        </div>
      ) : (
        <div className="grid gap-5 xl:grid-cols-2">
          {visibleGroups.map((group) => (
            <section
              key={group.id}
              className="rounded-[30px] border border-white/10 bg-white/[0.035] p-5 shadow-xl shadow-black/10"
            >
              <div className="mb-5 flex items-start justify-between gap-4">
                <div>
                  <h3 className="text-lg font-semibold tracking-[-0.025em] text-white">
                    {group.name}
                  </h3>

                  {group.description && (
                    <p className="mt-1 max-w-2xl text-sm leading-6 text-white/42">
                      {group.description}
                    </p>
                  )}
                </div>

                <div className="rounded-full border border-white/10 bg-black/25 px-3 py-1 text-xs text-white/35">
                  {(group.items || []).length}
                </div>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                {(group.items || []).map((item) => {
                  const Icon = getIcon(item, group);

                  return (
                    <Link
                      key={item.id}
                      href={resolveWorkspaceRoute({
                        organizationId: fallbackOrganizationId,
                        moduleId: item.id,
                        route: item.route,
                      })}
                      className="group rounded-2xl border border-white/10 bg-black/20 p-4 transition hover:border-[#D6A66A]/40 hover:bg-[#D6A66A]/10"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="rounded-2xl border border-white/10 bg-black/30 p-2.5 text-[#D6A66A]">
                          <Icon size={19} />
                        </div>

                        <ArrowRight
                          size={17}
                          className="mt-2 text-white/22 transition group-hover:translate-x-1 group-hover:text-[#D6A66A]"
                        />
                      </div>

                      <div className="mt-4 text-sm font-semibold text-white">
                        {item.name}
                      </div>

                      <div className="mt-1.5 text-xs leading-5 text-white/40">
                        {item.description ||
                          "Open this capability."}
                      </div>
                    </Link>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}
    </section>
  );
}
