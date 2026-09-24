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
      className="group rounded-[28px] border border-black/[0.08] bg-[#FBF8F3] p-5 transition-all hover:border-amber-400/40 hover:bg-amber-500/10 cursor-pointer"
    >
      <div className="mb-5 flex items-start justify-between">
        <div className="rounded-2xl border border-black/[0.08] bg-[#F7F6F3]/30 p-3">
          <Building2 className="h-5 w-5 text-amber-300" />
        </div>
        <ArrowUpRight className="h-5 w-5 text-[#A9A39C] transition group-hover:text-amber-300" />
      </div>
      <div className="text-lg font-light text-[#191919]">{module.name || moduleId}</div>
      <div className="mt-2 text-sm text-[#918B83]">{module.category || "Workspace module"}</div>
    </Link>
  );
}
