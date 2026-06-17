"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useOrganizationRuntime } from "@/app/providers/WorkspaceRuntimeProvider";
import { Bell } from "lucide-react";

export default function PlatformHeader() {
  const pathname = usePathname();
  const { activeOrganization, navigation } = useOrganizationRuntime();

  const orgName = activeOrganization?.name || "Workspace";
  const userRole = "OWNER"; // replace with dynamic runtime user role if available

  // Determine active module from URL
  const activeModuleId = pathname?.split("/")[4];

  return (
    <header className="sticky top-0 z-40 flex flex-col gap-2 border-b border-white/10 bg-black/80 px-6 py-2 backdrop-blur-lg">
      {/* Top row: Org name, status, user */}
      <div className="flex items-center justify-between h-12">
        <div className="flex flex-col">
          <span className="text-[11px] tracking-[0.35em] text-violet-400">
            AVANTIQO ENTERPRISE
          </span>
          <h1 className="text-lg font-semibold text-white leading-none">
            {orgName}
          </h1>
        </div>

        <div className="flex items-center gap-4">
          <div className="hidden md:flex items-center gap-2 rounded-2xl border border-emerald-500/20 bg-emerald-500/10 px-3 py-1 text-sm text-emerald-300">
            <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
            Enterprise Runtime Active
          </div>

          <button className="flex h-10 w-10 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.03] text-white/70 transition hover:bg-white/[0.08] hover:text-white">
            <Bell className="h-5 w-5" />
          </button>

          <div className="flex h-10 min-w-[100px] items-center justify-center rounded-2xl border border-white/10 bg-white/[0.03] px-3 text-sm text-white/70">
            {userRole}
          </div>
        </div>
      </div>

      {/* Module navigation pills */}
      <nav className="flex flex-wrap gap-2 overflow-x-auto py-1">
        {(navigation || []).map((module) => (
          <Link
            key={module.id}
            href={module.route || "#"}
            className={`whitespace-nowrap rounded-full border px-4 py-1 text-sm font-medium transition ${
              activeModuleId === module.id
                ? "border-emerald-400 bg-emerald-500/20 text-emerald-200"
                : "border-white/10 bg-white/[0.03] text-white/50 hover:border-emerald-400 hover:bg-white/[0.06] hover:text-white/80"
            }`}
          >
            {module.name}
          </Link>
        ))}
      </nav>
    </header>
  );
}
