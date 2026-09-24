"use client";

import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, ExternalLink, LoaderCircle, MessageSquareText, RefreshCw } from "lucide-react";
import { useBusinessContext } from "@/app/providers/BusinessContextProvider";

const inputClass="h-10 w-full rounded-xl border border-black/[0.08] bg-white px-3 text-[10px] text-[#3D372F] outline-none focus:border-[#D6A66A]/70 focus:ring-2 focus:ring-[#D6A66A]/10";

export default function SMSSetupPage(){
  const business=useBusinessContext();
  const organizationId=business?.organization_id || business?.organization?.id || null;
  const [onboarding,setOnboarding]=useState(false);
  useEffect(()=>{ setOnboarding(new URLSearchParams(window.location.search).get("onboarding")==="1"); },[]);
  const backHref=onboarding?`/workspace/${encodeURIComponent(organizationId || "")}/administration/communications-setup?onboarding=1`:`/workspace/${encodeURIComponent(organizationId || "")}/administration/integrations`;
  const [snapshot,setSnapshot]=useState({connection:null,sender:null});
  const [form,setForm]=useState({accountSid:"",authToken:"",senderMode:"number",fromNumber:"",messagingServiceSid:""});
  const [loading,setLoading]=useState(true); const [working,setWorking]=useState(false); const [error,setError]=useState(""); const [notice,setNotice]=useState("");

  const load=useCallback(async()=>{
    if(!organizationId) return;
    try{ setLoading(true); setError(""); const response=await fetch(`/api/administration/integrations/sms?organizationId=${encodeURIComponent(organizationId)}`,{cache:"no-store"}); const body=await response.json().catch(()=>({})); if(!response.ok || body?.success===false) throw new Error(body?.error || "Unable to load SMS setup"); setSnapshot({connection:body.connection||null,sender:body.sender||null}); }
    catch(loadError){ setError(loadError?.message || "Unable to load SMS setup"); } finally{ setLoading(false); }
  },[organizationId]);
  useEffect(()=>{ if(business?.ready) load(); },[business?.ready,load]);

  async function connect(){
    if(!organizationId || working) return;
    try{ setWorking(true); setError(""); setNotice(""); const response=await fetch("/api/administration/integrations/sms",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({organizationId,action:"connect",accountSid:form.accountSid.trim(),authToken:form.authToken.trim(),fromNumber:form.senderMode==="number"?form.fromNumber.trim():"",messagingServiceSid:form.senderMode==="service"?form.messagingServiceSid.trim():""})}); const body=await response.json().catch(()=>({})); if(!response.ok || body?.success===false) throw new Error(body?.error || "SMS setup failed"); setForm((current)=>({...current,accountSid:"",authToken:"",fromNumber:"",messagingServiceSid:""})); setSnapshot({connection:body.connection||null,sender:body.sender||null}); setNotice("Twilio SMS verified, vaulted, and connected to Avantiqo Communications."); }
    catch(actionError){ setError(actionError?.message || "SMS setup failed"); } finally{ setWorking(false); }
  }
  async function disconnect(){
    if(!organizationId || working) return;
    try{ setWorking(true); setError(""); setNotice(""); const response=await fetch("/api/administration/integrations/sms",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({organizationId,action:"disconnect"})}); const body=await response.json().catch(()=>({})); if(!response.ok || body?.success===false) throw new Error(body?.error || "SMS disconnect failed"); setSnapshot({connection:body.connection||null,sender:body.sender||null}); setNotice("SMS disconnected from this organization."); }
    catch(actionError){ setError(actionError?.message || "SMS disconnect failed"); } finally{ setWorking(false); }
  }

  const connected=snapshot.connection?.status==="ACTIVE" && snapshot.connection?.webhookReady===true && snapshot.sender;
  const canConnect=form.accountSid.trim() && form.authToken.trim() && (form.senderMode==="number"?form.fromNumber.trim():form.messagingServiceSid.trim());
  if(loading || !business?.ready) return <div className="flex min-h-[460px] items-center justify-center bg-[#F7F6F3] text-[10px] text-[#817B73]"><LoaderCircle size={14} className="mr-2 animate-spin"/>Loading SMS setup…</div>;

  return (
    <main className="min-h-screen bg-[#F7F6F3] p-6 text-[#2D2822] lg:p-10">
      <div className="mx-auto max-w-3xl">
        <a href={backHref} className="text-[9px] font-semibold text-[#8A633C]">← {onboarding ? "Channels & connections" : "Integrations"}</a>
        <section className="mt-5 rounded-[24px] border border-black/[0.07] bg-white p-6 lg:p-8">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 text-[9px] font-semibold uppercase tracking-[0.16em] text-[#A37849]"><MessageSquareText size={11}/>Messaging</div>
              <h1 className="mt-2 text-[30px] font-semibold tracking-[-0.04em]">SMS</h1>
              <p className="mt-2 max-w-2xl text-[10px] leading-5 text-[#777169]">Connect this organization’s Twilio account. Avantiqo validates the sender, stores credentials in the server-side vault, and configures inbound SMS plus delivery callbacks automatically.</p>
            </div>
            <span className={`rounded-full px-2.5 py-1 text-[8px] font-semibold ${connected?"bg-emerald-50 text-emerald-700":"bg-[#F0E7DA] text-[#8A633C]"}`}>{connected?"Connected":"Optional"}</span>
          </div>
          {error?<div className="mt-4 rounded-xl border border-red-700/15 bg-red-50 px-4 py-3 text-[10px] text-red-800">{error}</div>:null}
          {notice?<div className="mt-4 rounded-xl border border-emerald-700/15 bg-emerald-50 px-4 py-3 text-[10px] text-emerald-800">{notice}</div>:null}

          {connected?(
            <div className="mt-5 rounded-2xl border border-emerald-700/15 bg-emerald-50 p-5">
              <div className="flex items-center gap-2 text-[10px] font-semibold text-emerald-800"><CheckCircle2 size={12}/>Twilio SMS operational</div>
              <div className="mt-2 text-[9px] text-emerald-800/70">{snapshot.sender?.fromNumber || snapshot.sender?.name || snapshot.sender?.messagingServiceSid}</div>
              <div className="mt-2 text-[9px] leading-4 text-emerald-800/70">Outbound text, inbound Unified Inbox conversations, and delivery-status callbacks are ready.</div>
              <div className="mt-4 flex gap-2"><button type="button" onClick={()=>load()} className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-emerald-800/10 bg-white px-3 text-[9px] font-semibold text-emerald-800"><RefreshCw size={9}/>Refresh</button><button type="button" onClick={disconnect} disabled={working} className="h-9 rounded-xl border border-red-700/10 bg-white px-3 text-[9px] font-semibold text-red-700 disabled:opacity-40">Disconnect</button></div>
            </div>
          ):(
            <div className="mt-5 rounded-2xl border border-[#C9AD89]/20 bg-[#FBF6EF] p-5">
              <a href="https://console.twilio.com/" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-[9px] font-semibold text-[#806444]">Open Twilio Console<ExternalLink size={9}/></a>
              <div className="mt-4 grid gap-3 sm:grid-cols-2"><label className="text-[9px] font-semibold text-[#6C6258]">Account SID<input value={form.accountSid} onChange={(e)=>setForm({...form,accountSid:e.target.value})} autoComplete="off" placeholder="AC…" className={`${inputClass} mt-2`}/></label><label className="text-[9px] font-semibold text-[#6C6258]">Auth Token<input type="password" value={form.authToken} onChange={(e)=>setForm({...form,authToken:e.target.value})} autoComplete="new-password" placeholder="Twilio Auth Token" className={`${inputClass} mt-2`}/></label></div>
              <div className="mt-4 flex gap-2">{[["number","Twilio phone number"],["service","Messaging Service"]].map(([value,label])=><button key={value} type="button" onClick={()=>setForm({...form,senderMode:value})} className={`h-9 rounded-xl border px-3 text-[9px] font-semibold ${form.senderMode===value?"border-[#C8A77E] bg-white text-[#5E4931]":"border-black/[0.07] bg-transparent text-[#81776C]"}`}>{label}</button>)}</div>
              {form.senderMode==="number"?<label className="mt-4 block text-[9px] font-semibold text-[#6C6258]">Twilio sending number<input value={form.fromNumber} onChange={(e)=>setForm({...form,fromNumber:e.target.value})} placeholder="+15551234567" className={`${inputClass} mt-2`}/></label>:<label className="mt-4 block text-[9px] font-semibold text-[#6C6258]">Messaging Service SID<input value={form.messagingServiceSid} onChange={(e)=>setForm({...form,messagingServiceSid:e.target.value})} placeholder="MG…" className={`${inputClass} mt-2`}/></label>}
              <p className="mt-3 text-[8px] leading-4 text-[#91887E]">Credentials are sent directly to the server, validated with Twilio, and stored in Avantiqo’s credential vault. They are not displayed again.</p>
              <button type="button" onClick={connect} disabled={working || !canConnect} className="mt-4 h-10 rounded-xl bg-[#25231F] px-4 text-[10px] font-semibold text-white disabled:opacity-35">{working?"Connecting…":"Connect SMS"}</button>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
