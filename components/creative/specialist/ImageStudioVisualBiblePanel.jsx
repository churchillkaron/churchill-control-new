"use client";

import { BadgeCheck, Circle, ShieldAlert } from "lucide-react";

function human(value){ return String(value || "").replaceAll("_"," ").toLowerCase(); }

export default function ImageStudioVisualBiblePanel({ bible }) {
  if (!bible) return null;
  const entities = Array.isArray(bible.entities) ? bible.entities : [];
  const missing = Array.isArray(bible.missing_required_classes) ? bible.missing_required_classes : [];
  return <section className="mt-5">
    <div className="flex items-center justify-between">
      <div>
        <div className="text-[9px] font-semibold uppercase tracking-[0.22em] text-[#948D84]">Visual bible</div>
        <div className="mt-1 text-[8px] text-[#AAA49C]">Persistent authority shared with Video Studio</div>
      </div>
      <div className={`flex items-center gap-1 text-[8px] font-semibold uppercase tracking-[0.1em] ${bible.ready ? "text-[#607057]" : "text-[#B36B52]"}`}>
        {bible.ready ? <BadgeCheck className="h-3.5 w-3.5"/> : <ShieldAlert className="h-3.5 w-3.5"/>}
        {bible.ready ? "Locked" : "Incomplete"}
      </div>
    </div>

    <div className="mt-3 space-y-1.5">
      {entities.slice(0,12).map((entity)=><div key={`${entity.class}:${entity.identity_key}`} className="rounded-lg border border-[#E5E1DA] bg-[#FBFAF8] px-3 py-2">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="truncate text-[9px] font-medium text-[#625D56]">{entity.label}</div>
            <div className="mt-0.5 text-[7px] font-semibold uppercase tracking-[0.1em] text-[#A09A92]">{human(entity.class)}</div>
          </div>
          {entity.locked ? <BadgeCheck className="h-3.5 w-3.5 shrink-0 text-[#607057]"/> : <Circle className="h-3 w-3 shrink-0 text-[#AAA49C]"/>}
        </div>
      </div>)}
      {!entities.length ? <div className="rounded-lg border border-dashed border-[#D8D3CB] px-3 py-4 text-center text-[8px] leading-4 text-[#918B83]">No recurring visual authorities established yet.</div> : null}
    </div>

    {missing.length ? <div className="mt-2 rounded-lg border border-[#B36B52]/20 bg-[#B36B52]/[0.05] px-3 py-2 text-[8px] leading-4 text-[#8B4937]">Missing authority: {missing.map(human).join(" · ")}</div> : null}
    {entities.length > 12 ? <div className="mt-2 text-[8px] text-[#A09A92]">+ {entities.length - 12} more governed entities</div> : null}
  </section>;
}
