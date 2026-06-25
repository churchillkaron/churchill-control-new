"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { useWorkspaceRuntime } from "@/app/providers/WorkspaceRuntimeProvider";

function makeHref(organizationId, route) {
  if (!route) return "#";

  const clean =
    String(route).startsWith("/")
      ? String(route)
      : `/${route}`;

  return `/workspace/${organizationId}${clean}`;
}

function getActiveCapability(pathname) {
  const p =
    String(pathname || "").toLowerCase();

  if (p.includes("/finance")) return "Finance";
  if (
    p.includes("/payroll") ||
    p.includes("/hr") ||
    p.includes("/schedule")
  ) return "People";

  if (
    p.includes("/marketing") ||
    p.includes("/crm") ||
    p.includes("/customers")
  ) return "Growth";

  if (
    p.includes("/analytics") ||
    p.includes("/owner") ||
    p.includes("/monitoring")
  ) return "Intelligence";

  if (
    p.includes("/settings") ||
    p.includes("/projects") ||
    p.includes("/design") ||
    p.includes("/automation") ||
    p.includes("/governance")
  ) return "Platform";

  return "Operations";
}

function getMenuItems(nodes) {
  if (
    nodes.length === 1 &&
    Array.isArray(nodes[0]?.children) &&
    nodes[0].children.length > 0
  ) {
    return nodes[0].children;
  }

  return nodes;
}

export default function WorkspaceTopBar() {
  const {
    runtime,
    organization,
    navigation,
    ready,
  } = useWorkspaceRuntime();

  const pathname = usePathname();

  const [openCapability, setOpenCapability] =
    useState(null);

  const [hoveredNodeId, setHoveredNodeId] =
    useState(null);

  const organizationId =
    organization?.id ||
    runtime?.activeOrganization?.id;

  const companyName =
    organization?.name ||
    runtime?.activeOrganization?.name ||
    "Workspace";

  const userName =
    runtime?.access?.staff?.name ||
    runtime?.access?.staff?.email ||
    "User";

  const executive =
    navigation?.executive || [];

  const tree =
    navigation?.tree || [];

  const activeCapability =
    getActiveCapability(pathname);

  if (!ready) {
    return (
      <div className="px-6 py-3 text-sm text-white/50">
        Loading workspace...
      </div>
    );
  }

  return (
    <header className="relative z-50 border-b border-white/10 bg-black/85 backdrop-blur-2xl">

      <div className="flex items-center justify-between px-8 py-5">

        <div>
          <div className="text-3xl font-extralight tracking-[-0.04em] text-white">
            {companyName}
          </div>

          <div className="mt-2 text-[10px] uppercase tracking-[0.35em] text-[#D6A66A]/80">
            Powered by Avantiqo • Synthetic Intelligence OS
          </div>
        </div>

        <nav className="flex items-center gap-3">

          {executive.map((capability) => {
            const isActive =
              activeCapability === capability.name;

            const isOpen =
              openCapability === capability.name;

            const rootNodes =
              tree.filter(
                node =>
                  node.capability === capability.name
              );

            const menuItems =
              getMenuItems(rootNodes);

            const hoveredNode =
              menuItems.find(
                item => item.id === hoveredNodeId
              ) || menuItems[0];

            const children =
              hoveredNode?.children || [];

            return (
              <div
                key={capability.id}
                className="relative"
              >
                <button
                  onClick={() => {
                    setOpenCapability(
                      isOpen ? null : capability.name
                    );
                    setHoveredNodeId(null);
                  }}
                  className={
                    isActive || isOpen
                      ? "flex items-center gap-2 rounded-full border border-[#D6A66A]/50 bg-[#D6A66A]/10 px-5 py-2.5 text-xs uppercase tracking-[0.2em] text-[#D6A66A]"
                      : "flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-5 py-2.5 text-xs uppercase tracking-[0.2em] text-white/55 hover:text-white"
                  }
                >
                  {capability.name}
                  <ChevronDown size={14} />
                </button>

                {isOpen && (
                  <div className="absolute right-0 top-14 flex gap-3">

                    <div className="w-[320px] overflow-hidden rounded-[28px] border border-white/10 bg-[#050505]/95 shadow-2xl backdrop-blur-2xl">

                      <div className="border-b border-white/10 px-6 py-5">
                        <div className="text-xs uppercase tracking-[0.35em] text-[#D6A66A]">
                          {capability.name}
                        </div>

                        <div className="mt-2 text-sm text-white/45">
                          Select a workspace area
                        </div>
                      </div>

                      <div className="p-3">
                        {menuItems.length === 0 ? (
                          <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-4 text-sm text-white/40">
                            No active modules
                          </div>
                        ) : (
                          menuItems.map((item) => {
                            const href =
                              makeHref(
                                organizationId,
                                item.route
                              );

                            const hasChildren =
                              item.children?.length > 0;

                            return (
                              <Link
                                key={item.id}
                                href={href}
                                onMouseEnter={() =>
                                  setHoveredNodeId(item.id)
                                }
                                onClick={() => {
                                  if (!hasChildren) {
                                    setOpenCapability(null);
                                  }
                                }}
                                className="group mb-2 flex items-center justify-between rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-4 text-white/75 transition hover:border-[#D6A66A]/40 hover:bg-[#D6A66A]/10 hover:text-[#D6A66A]"
                              >
                                <span>
                                  {item.name}
                                </span>

                                {hasChildren && (
                                  <ChevronRight
                                    size={16}
                                    className="opacity-40 group-hover:opacity-100"
                                  />
                                )}
                              </Link>
                            );
                          })
                        )}
                      </div>

                    </div>

                    {children.length > 0 && (
                      <div className="w-[340px] overflow-hidden rounded-[28px] border border-white/10 bg-[#050505]/95 shadow-2xl backdrop-blur-2xl">

                        <div className="border-b border-white/10 px-6 py-5">
                          <div className="text-xs uppercase tracking-[0.35em] text-[#D6A66A]">
                            {hoveredNode?.name}
                          </div>

                          <div className="mt-2 text-sm text-white/45">
                            Open work center
                          </div>
                        </div>

                        <div className="p-3">
                          {children.map((child) => {
                            const href =
                              makeHref(
                                organizationId,
                                child.route
                              );

                            return (
                              <Link
                                key={child.id}
                                href={href}
                                onClick={() =>
                                  setOpenCapability(null)
                                }
                                className="group mb-2 flex items-center justify-between rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-4 text-white/75 transition hover:border-[#D6A66A]/40 hover:bg-[#D6A66A]/10 hover:text-[#D6A66A]"
                              >
                                <span>
                                  {child.name}
                                </span>

                                <ChevronRight
                                  size={16}
                                  className="opacity-40 group-hover:opacity-100"
                                />
                              </Link>
                            );
                          })}
                        </div>

                      </div>
                    )}

                  </div>
                )}
              </div>
            );
          })}

        </nav>

        <div className="text-right">
          <button className="text-sm font-light text-white/70 hover:text-[#D6A66A]">
            {userName}
          </button>
        </div>

      </div>

    </header>
  );
}
