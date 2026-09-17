"use client";

import { useEffect, useState } from "react";
import { AudioLines, BadgeCheck, Sparkles, Volume2 } from "lucide-react";

const CATEGORIES = ["SFX", "Foley", "Ambience", "Transition", "Impact", "Riser", "Sonic Brand"];

export default function MusicSfxStudioPanel({ organizationId, projectId = null, missionId = null }) {
  const [instruction, setInstruction] = useState("");
  const [duration, setDuration] = useState(5);
  const [category, setCategory] = useState("SFX");
  const [intensity, setIntensity] = useState("balanced");
  const [perspective, setPerspective] = useState("natural");
  const [plan, setPlan] = useState(null);
  const [session, setSession] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function request(payload) {
    const response = await fetch("/api/creative/music/sfx", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    const body = await response.json();
    if (!response.ok || body.success === false) throw new Error(body.error || "SFX Studio request failed");
    return body;
  }

  function reset() { setPlan(null); setSession(null); }

  async function review() {
    if (!instruction.trim()) return;
    setBusy(true); setError("");
    try { setPlan(await request({ action: "plan", organization_id: organizationId, instruction, duration_seconds: Number(duration), category, intensity, perspective })); }
    catch (cause) { setError(cause?.message || "Could not prepare SFX"); }
    finally { setBusy(false); }
  }

  async function generate() {
    if (plan?.ready_for_execution !== true || busy) return;
    setBusy(true); setError(""); setSession(null);
    try { setSession(await request({ action: "execute", organization_id: organizationId, creative_project_id: projectId, creative_mission_id: missionId, instruction, duration_seconds: Number(duration), category, intensity, perspective })); }
    catch (cause) { setError(cause?.message || "SFX generation failed"); }
    finally { setBusy(false); }
  }

  useEffect(() => {
    if (!session?.pending || !session?.usage_id || !organizationId) return undefined;
    let cancelled = false; let inFlight = false;
    const poll = async () => {
      if (inFlight) return; inFlight = true;
      try { const result = await request({ action: "status", organization_id: organizationId, usage_id: session.usage_id }); if (!cancelled) setSession((current) => ({ ...current, ...result })); }
      catch (cause) { if (!cancelled) setError(cause?.message || "SFX status failed"); }
      finally { inFlight = false; }
    };
    const timer = setInterval(poll, 3000);
    return () => { cancelled = true; clearInterval(timer); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.pending, session?.usage_id, organizationId]);

  const ready = plan?.ready_for_execution === true;
  return <section className="mx-auto max-w-6xl p-6">
    <div className="overflow-hidden rounded-3xl border border-[#d6a66a]/20 bg-gradient-to-b from-[#d6a66a]/[0.06] to-black/25">
      <div className="border-b border-white/7 p-6 sm:p-8">
        <div className="flex flex-wrap items-start justify-between gap-4"><div><div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.22em] text-[#d6a66a]"><Volume2 className="h-4 w-4" /> SFX & Foley</div><h2 className="mt-2 text-2xl font-medium text-white/88">Create sound for moments, movement and atmosphere</h2><p className="mt-2 max-w-2xl text-xs leading-5 text-white/36">Generate effects, foley-style sounds, ambience, transitions, impacts, risers and sonic-brand assets. Output remains private and publishing is always separate.</p></div><span className={`rounded-full border px-3 py-1.5 text-[9px] uppercase tracking-[0.13em] ${ready ? "border-emerald-300/18 bg-emerald-300/[0.05] text-emerald-100/65" : "border-amber-300/18 bg-amber-300/[0.05] text-amber-100/60"}`}>{ready ? "Ready" : plan ? "Certification required" : "Review first"}</span></div>
      </div>
      <div className="grid gap-6 p-6 sm:p-8 lg:grid-cols-[1.1fr_.9fr]">
        <div>
          <label className="block"><span className="text-[9px] uppercase tracking-[0.16em] text-white/28">Describe the sound</span><textarea rows={5} value={instruction} onChange={(event) => { setInstruction(event.target.value); reset(); }} placeholder="Heavy cinematic metal impact with a short low-frequency tail, no music" className="mt-1.5 w-full rounded-xl border border-white/8 bg-black/30 px-4 py-3 text-sm text-white/70 outline-none" /></label>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <label><span className="text-[9px] uppercase tracking-[0.16em] text-white/28">Category</span><select value={category} onChange={(event) => { setCategory(event.target.value); reset(); }} className="mt-1.5 w-full rounded-lg border border-white/8 bg-[#090909] px-3 py-2.5 text-xs text-white/70">{CATEGORIES.map((item) => <option key={item}>{item}</option>)}</select></label>
            <label><span className="text-[9px] uppercase tracking-[0.16em] text-white/28">Duration</span><input type="number" min="0.5" max="30" step="0.5" value={duration} onChange={(event) => { setDuration(event.target.value); reset(); }} className="mt-1.5 w-full rounded-lg border border-white/8 bg-black/30 px-3 py-2.5 text-xs text-white/70" /></label>
            <label><span className="text-[9px] uppercase tracking-[0.16em] text-white/28">Intensity</span><select value={intensity} onChange={(event) => { setIntensity(event.target.value); reset(); }} className="mt-1.5 w-full rounded-lg border border-white/8 bg-[#090909] px-3 py-2.5 text-xs text-white/70"><option>subtle</option><option>balanced</option><option>strong</option><option>extreme</option></select></label>
            <label><span className="text-[9px] uppercase tracking-[0.16em] text-white/28">Perspective</span><select value={perspective} onChange={(event) => { setPerspective(event.target.value); reset(); }} className="mt-1.5 w-full rounded-lg border border-white/8 bg-[#090909] px-3 py-2.5 text-xs text-white/70"><option>natural</option><option>close</option><option>distant</option><option>wide</option></select></label>
          </div>
          <div className="mt-5 flex gap-3"><button type="button" disabled={!instruction.trim() || busy} onClick={review} className="rounded-xl border border-white/10 bg-white/[0.035] px-4 py-2.5 text-xs text-white/60 disabled:opacity-30">Review sound</button><button type="button" disabled={!ready || busy || session?.pending} onClick={generate} className="inline-flex items-center gap-2 rounded-xl border border-[#d6a66a]/30 bg-[#d6a66a]/12 px-4 py-2.5 text-xs font-medium text-[#efd29f] disabled:opacity-30">{session?.pending ? <AudioLines className="h-4 w-4 animate-pulse" /> : <Sparkles className="h-4 w-4" />}{session?.pending ? "Generating…" : "Generate SFX"}</button></div>
          {error ? <div className="mt-4 rounded-xl border border-red-300/12 bg-red-400/[0.03] px-4 py-3 text-xs text-red-100/65">{error}</div> : null}
        </div>
        <aside className="rounded-2xl border border-white/8 bg-black/25 p-5">
          <div className="text-[9px] uppercase tracking-[0.18em] text-white/25">Sound job</div>
          {plan ? <div className="mt-3 rounded-xl border border-white/7 p-3"><div className="text-xs text-white/60">{plan.generation?.category || category} · {plan.duration_seconds}s</div><div className="mt-1 text-[9px] text-white/25">{plan.readiness?.product_model || "Avantiqo SFX"} · {plan.readiness?.quality_profile || "quality gate"}</div><div className="mt-2 text-[9px] text-white/30">{ready ? "Certified execution is available." : "The tool stays visible, but generation remains blocked until the owned SFX runtime is commercially active."}</div></div> : <div className="mt-3 text-xs leading-5 text-white/28">Describe a sound and review it before generation. Avantiqo will verify the current owned runtime before any provider job is submitted.</div>}
          {session ? <div className="mt-4 rounded-xl border border-white/7 p-3"><div className="flex items-center gap-2 text-xs text-white/55">{session.pending ? <AudioLines className="h-4 w-4 animate-pulse text-[#d6a66a]" /> : <BadgeCheck className="h-4 w-4 text-emerald-200/60" />}{session.pending ? "Generating sound" : session.failed ? "Generation failed" : "Sound complete"}</div>{session.playback_url ? <audio controls src={session.playback_url} className="mt-3 w-full" /> : null}</div> : null}
        </aside>
      </div>
    </div>
  </section>;
}
