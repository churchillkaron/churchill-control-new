"use client";

import { useCallback, useEffect, useState } from "react";
import { Bot, CheckCircle2, ExternalLink, LoaderCircle, RefreshCw } from "lucide-react";
import { useBusinessContext } from "@/app/providers/BusinessContextProvider";

export default function TelegramSetupPage() {
  const business = useBusinessContext();
  const organizationId = business?.organization_id || business?.organization?.id || null;
  const [onboarding,setOnboarding]=useState(false);
  useEffect(()=>{ setOnboarding(new URLSearchParams(window.location.search).get("onboarding")==="1"); },[]);
  const backHref=onboarding?`/workspace/${encodeURIComponent(organizationId || "")}/administration/communications-setup?onboarding=1`:`/workspace/${encodeURIComponent(organizationId || "")}/administration/integrations`;
  const [snapshot,setSnapshot]=useState({connection:null,bot:null});
  const [token,setToken]=useState("");
  const [loading,setLoading]=useState(true);
  const [working,setWorking]=useState(false);
  const [error,setError]=useState("");
  const [notice,setNotice]=useState("");

  const load=useCallback(async()=>{
    if(!organizationId) return;
    try{
      setLoading(true); setError("");
      const response=await fetch(`/api/administration/integrations/telegram?organizationId=${encodeURIComponent(organizationId)}`,{cache:"no-store"});
      const body=await response.json().catch(()=>({}));
      if(!response.ok || body?.success===false) throw new Error(body?.error || "Unable to load Telegram setup");
      setSnapshot({connection:body.connection || null,bot:body.bot || null});
    }catch(loadError){ setError(loadError?.message || "Unable to load Telegram setup"); }
    finally{ setLoading(false); }
  },[organizationId]);
  useEffect(()=>{ if(business?.ready) load(); },[business?.ready,load]);

  async function save(){
    if(!organizationId || !token.trim() || working) return;
    try{
      setWorking(true); setError(""); setNotice("");
      const response=await fetch("/api/administration/integrations/telegram",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({organizationId,action:"connect",botToken:token.trim()})});
      const body=await response.json().catch(()=>({}));
      if(!response.ok || body?.success===false) throw new Error(body?.error || "Telegram setup failed");
      setToken("");
      setSnapshot({connection:body.connection || null,bot:body.bot || null});
      setNotice("Telegram bot verified, vaulted and connected to Avantiqo Communications.");
    }catch(actionError){ setError(actionError?.message || "Telegram setup failed"); }
    finally{ setWorking(false); }
  }

  async function disconnect(){
    if(!organizationId || working) return;
    try{
      setWorking(true); setError(""); setNotice("");
      const response=await fetch("/api/administration/integrations/telegram",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({organizationId,action:"disconnect"})});
      const body=await response.json().catch(()=>({}));
      if(!response.ok || body?.success===false) throw new Error(body?.error || "Telegram disconnect failed");
      setSnapshot({connection:body.connection || null,bot:body.bot || null});
      setNotice("Telegram disconnected from this organization.");
    }catch(actionError){ setError(actionError?.message || "Telegram disconnect failed"); }
    finally{ setWorking(false); }
  }

  const connected=snapshot.connection?.status === "ACTIVE" && snapshot.connection?.webhookReady === true && snapshot.bot;
  if(loading || !business?.ready) return <div className="flex min-h-[460px] items-center justify-center bg-[#F7F6F3] text-[10px] text-[#817B73]"><LoaderCircle size={14} className="mr-2 animate-spin" />Loading Telegram setup…</div>;

  return (
    <main className="min-h-screen bg-[#F7F6F3] p-6 text-[#2D2822] lg:p-10">
      <div className="mx-auto max-w-3xl">
        <a href={backHref} className="text-[9px] font-semibold text-[#8A633C]">← {onboarding ? "Channels & connections" : "Integrations"}</a>
        <section className="mt-5 rounded-[24px] border border-black/[0.07] bg-white p-6 lg:p-8">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 text-[9px] font-semibold uppercase tracking-[0.16em] text-[#A37849]"><Bot size={11}/>Messaging</div>
              <h1 className="mt-2 text-[30px] font-semibold tracking-[-0.04em]">Telegram</h1>
              <p className="mt-2 max-w-2xl text-[10px] leading-5 text-[#777169]">Connect a Telegram bot owned by this organization. Create the bot with BotFather, paste its token once, and Avantiqo handles validation, secure vault storage and webhook configuration automatically.</p>
            </div>
            <span className={`rounded-full px-2.5 py-1 text-[8px] font-semibold ${connected ? "bg-emerald-50 text-emerald-700" : "bg-[#F0E7DA] text-[#8A633C]"}`}>{connected ? "Connected" : "Optional"}</span>
          </div>

          {error ? <div className="mt-4 rounded-xl border border-red-700/15 bg-red-50 px-4 py-3 text-[10px] text-red-800">{error}</div> : null}
          {notice ? <div className="mt-4 rounded-xl border border-emerald-700/15 bg-emerald-50 px-4 py-3 text-[10px] text-emerald-800">{notice}</div> : null}

          {connected ? (
            <div className="mt-5 rounded-2xl border border-emerald-700/15 bg-emerald-50 p-5">
              <div className="flex items-center gap-2 text-[10px] font-semibold text-emerald-800"><CheckCircle2 size={12}/>{snapshot.bot?.name || "Telegram bot"}</div>
              {snapshot.bot?.username ? <div className="mt-1 text-[9px] text-emerald-800/70">@{snapshot.bot.username}</div> : null}
              <div className="mt-2 text-[9px] leading-4 text-emerald-800/70">Text messages are ready for inbound Unified Inbox conversations and outbound replies.</div>
              <div className="mt-4 flex flex-wrap gap-2">
                <button type="button" onClick={()=>load()} disabled={working} className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-emerald-800/10 bg-white px-3 text-[9px] font-semibold text-emerald-800"><RefreshCw size={9}/>Refresh</button>
                <button type="button" onClick={disconnect} disabled={working} className="h-9 rounded-xl border border-red-700/10 bg-white px-3 text-[9px] font-semibold text-red-700 disabled:opacity-40">Disconnect</button>
              </div>
            </div>
          ) : (
            <div className="mt-5 rounded-2xl border border-[#C9AD89]/20 bg-[#FBF6EF] p-5">
              <a href="https://t.me/BotFather" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-[9px] font-semibold text-[#806444]">Open BotFather in Telegram<ExternalLink size={9}/></a>
              <label className="mt-4 block text-[9px] font-semibold text-[#6C6258]">Bot token</label>
              <input type="password" value={token} onChange={(event)=>setToken(event.target.value)} autoComplete="new-password" placeholder="123456789:AA…" className="mt-2 h-10 w-full rounded-xl border border-black/[0.08] bg-white px-3 text-[10px] outline-none focus:border-[#D6A66A]/70" />
              <p className="mt-2 text-[8px] leading-4 text-[#91887E]">Avantiqo validates the bot directly with Telegram and stores the token in the server-side credential vault. The token is not displayed again.</p>
              <button type="button" onClick={save} disabled={working || !token.trim()} className="mt-4 h-10 rounded-xl bg-[#25231F] px-4 text-[10px] font-semibold text-white disabled:opacity-35">{working ? "Connecting…" : "Connect Telegram"}</button>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
