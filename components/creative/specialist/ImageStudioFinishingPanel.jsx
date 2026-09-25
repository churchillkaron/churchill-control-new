"use client";

import { BadgeCheck, CircleDashed, ShieldAlert } from "lucide-react";

const LABELS={retouch:"Retouch",composite:"Composite",color_di:"Color / DI",master_finish:"Master finish"};
function human(value){return String(value||"").replaceAll("_"," ");}

export default function ImageStudioFinishingPanel({ chain }){
  if(!chain) return null;
  const required=(chain.stages||[]).filter((stage)=>stage.required);
  if(!required.length) return null;
  return <section className="mt-5">
    <div className="flex items-center justify-between">
      <div>
        <div className="text-[9px] font-semibold uppercase tracking-[0.22em] text-[#948D84]">Professional finishing</div>
        <div className="mt-1 text-[8px] text-[#AAA49C]">Retouch → composite → color / DI → master</div>
      </div>
      <div className={`flex items-center gap-1 text-[8px] font-semibold uppercase tracking-[0.1em] ${chain.passed?"text-[#607057]":"text-[#B36B52]"}`}>
        {chain.passed?<BadgeCheck className="h-3.5 w-3.5"/>:<ShieldAlert className="h-3.5 w-3.5"/>}
        {chain.passed?"Finished":"Open"}
      </div>
    </div>
    <div className="mt-3 space-y-1.5">
      {required.map((stage)=><div key={stage.id} className="flex items-center justify-between rounded-lg border border-[#E5E1DA] bg-[#FBFAF8] px-3 py-2">
        <div>
          <div className="text-[9px] font-medium text-[#625D56]">{LABELS[stage.id]||human(stage.id)}</div>
          <div className="mt-0.5 text-[7px] uppercase tracking-[0.1em] text-[#A09A92]">{human(stage.owner_role_id)}</div>
        </div>
        {stage.passed?<BadgeCheck className="h-3.5 w-3.5 text-[#607057]"/>:<CircleDashed className="h-3.5 w-3.5 text-[#B36B52]"/>}
      </div>)}
    </div>
  </section>;
}
