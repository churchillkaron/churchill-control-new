"use client";

import { useCallback, useEffect, useState } from "react";
import { ExternalLink, LoaderCircle } from "lucide-react";
import { useBusinessContext } from "@/app/providers/BusinessContextProvider";

export default function MetaSetupPage() {
  const business = useBusinessContext();
  const organizationId = business?.organization_id || business?.organization?.id || null;
  const [pages,setPages]=useState([]);
  const [loading,setLoading]=useState(true);
  const [working,setWorking]=useState("");
  const [error,setError]=useState("");

  const load=useCallback(async()=>{
    if(!organizationId) return;
    try{
      setLoading(true); setError("");
      const response=await fetch(`/api/administration/integrations/meta/selection?organizationId=${encodeURIComponent(organizationId)}`,{cache:"no-store"});
      const body=await response.json().catch(()=>({}));
      if(!response.ok || body?.success===false) throw new Error(body?.error || "Unable to load Meta business Pages");
      setPages(Array.isArray(body.pages)?body.pages:[]);
    }catch(loadError){ setError(loadError?.message || "Unable to load Meta business Pages"); }
    finally{ setLoading(false); }
  },[organizationId]);

  useEffect(()=>{ if(business?.ready) load(); },[business?.ready,load]);

  async function choose(page){
    if(!organizationId || working) return;
    try{
      setWorking(page.id); setError("");
      const response=await fetch("/api/administration/integrations/meta/selection",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({organizationId,pageId:page.id})});
      const body=await response.json().catch(()=>({}));
      if(!response.ok || body?.success===false) throw new Error(body?.error || "Meta Page selection failed");
      window.location.href=body.returnPath || `/workspace/${encodeURIComponent(organizationId)}/administration/communications-setup?onboarding=1&meta=connected`;
    }catch(actionError){ setError(actionError?.message || "Meta Page selection failed"); setWorking(""); }
  }

  if(loading || !business?.ready){
    return <div className="flex min-h-[460px] items-center justify-center bg-[#F7F6F3] text-[10px] text-[#817B73]"><LoaderCircle size={14} className="mr-2 animate-spin" />Loading Meta business assets…</div>;
  }

  return (
    <main className="min-h-screen bg-[#F7F6F3] p-6 text-[#2D2822] lg:p-10">
      <div className="mx-auto max-w-4xl">
        <a href={`/workspace/${encodeURIComponent(organizationId)}/administration/communications-setup?onboarding=1`} className="text-[9px] font-semibold text-[#8A633C]">← Channels & connections</a>
        <section className="mt-5 rounded-[24px] border border-black/[0.07] bg-white p-6 lg:p-8">
          <div className="text-[9px] font-semibold uppercase tracking-[0.16em] text-[#A37849]">Meta · Facebook · Instagram · Messenger</div>
          <h1 className="mt-2 text-[30px] font-semibold tracking-[-0.04em]">Choose the business Page</h1>
          <p className="mt-2 max-w-2xl text-[10px] leading-5 text-[#777169]">Your Meta login can manage more than one business. Choose the Facebook Page that belongs to this organization. Avantiqo will automatically use its linked Instagram professional account for Instagram publishing and messaging when available.</p>

          {error ? <div className="mt-4 rounded-xl border border-red-700/15 bg-red-50 px-4 py-3 text-[10px] text-red-800">{error}</div> : null}

          <div className="mt-5 space-y-2.5">
            {pages.map((page)=>(
              <div key={page.id} className="flex flex-col gap-3 rounded-2xl border border-black/[0.07] bg-[#FCFBF8] p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <div className="text-[11px] font-semibold text-[#433B33]">{page.name}</div>
                  <div className="mt-1 text-[9px] text-[#8A837A]">Facebook Page</div>
                  {page.instagram_username ? <div className="mt-2 inline-flex rounded-full bg-[#F0E7DA] px-2 py-1 text-[8px] font-semibold text-[#806444]">Instagram · @{page.instagram_username}</div> : <div className="mt-2 text-[8px] text-[#A19A92]">No linked Instagram professional account</div>}
                </div>
                <button type="button" onClick={()=>choose(page)} disabled={Boolean(working)} className="inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-xl bg-[#25231F] px-3 text-[9px] font-semibold text-white disabled:opacity-40">{working===page.id?<><LoaderCircle size={9} className="animate-spin" />Connecting…</>:<>Use this Page<ExternalLink size={9} /></>}</button>
              </div>
            ))}
          </div>

          {!pages.length && !error ? <div className="mt-5 rounded-xl border border-amber-700/15 bg-amber-50 px-4 py-3 text-[10px] text-amber-900">No Facebook Page with Messenger access is available under this Meta authorization.</div> : null}
        </section>
      </div>
    </main>
  );
}
