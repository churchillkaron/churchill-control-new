"use client";

import Link from "next/link";
import { ArrowUpRight, Building2 } from "lucide-react";

export default function ModuleCard({ organizationId, module, isPlatform }) {
  const moduleId = module?.id || module?.module_id;
  if (!moduleId) return null;
  const href = isPlatform
    ? `/workspace/platform/${organizationId}/modules/${moduleId}`
    : `/workspace/${organizationId}/${moduleId}`;
  return (
    <Link
      href={href}
      className="group rounded-[28px] border border-white/10 bg-white/[0.035] p-5 transition-all hover:border-violet-400/40 hover:bg-violet-500/10 cursor-pointer"
    >
      <div className="mb-5 flex items-start justify-between">
        <div className="rounded-2xl border border-white/10 bg-black/30 p-3">
          <Building2 className="h-5 w-5 text-violet-300" />
        </div>
        <ArrowUpRight className="h-5 w-5 text-white/25 transition group-hover:text-violet-300" />
      </div>
      <div className="text-lg font-light text-white">{module.name || moduleId}</div>
      <div className="mt-2 text-sm text-white/35">{module.category || "Workspace module"}</div>
    </Link>
  );
}
