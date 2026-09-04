"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, ArrowLeft, Barcode, Camera, CheckCircle2, MapPin, ScanLine, Square } from "lucide-react";

function text(value) { return String(value ?? "").trim(); }
function randomId() { return typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`; }

const INITIAL = { condition: "good", activityLevel: "none", pestName: "", count: "0", actionTaken: "inspected", notes: "" };

export default function PestControlVisitMonitoringScanner({ organizationId, occurrenceId, initialLookup = "" }) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const detectorRef = useRef(null);
  const frameRef = useRef(null);
  const [lookup, setLookup] = useState(initialLookup);
  const [point, setPoint] = useState(null);
  const [form, setForm] = useState(INITIAL);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [camera, setCamera] = useState("idle");
  const roundHref = `/workspace/${encodeURIComponent(organizationId)}/operations/field-service/monitoring-round/${encodeURIComponent(occurrenceId)}`;

  const stopCamera = useCallback(() => {
    if (frameRef.current) cancelAnimationFrame(frameRef.current);
    frameRef.current = null;
    streamRef.current?.getTracks?.().forEach((track) => track.stop());
    streamRef.current = null;
    detectorRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setCamera("idle");
  }, []);

  const resolvePoint = useCallback(async (value) => {
    const candidate = text(value);
    if (!candidate) return;
    setBusy("resolve"); setError(""); setMessage("");
    try {
      const response = await fetch(`/api/service-management/monitoring-points/resolve?organizationId=${encodeURIComponent(organizationId)}&lookup=${encodeURIComponent(candidate)}`, { cache: "no-store" });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || !body.success) throw new Error(body.error || "Monitoring point could not be resolved.");
      const resolvedPoint = body.point;
      const roundResponse = await fetch(`/api/service-management/monitoring-round?organizationId=${encodeURIComponent(organizationId)}&occurrenceId=${encodeURIComponent(occurrenceId)}`, { cache: "no-store" });
      const roundBody = await roundResponse.json().catch(() => ({}));
      if (!roundResponse.ok || !roundBody.success) throw new Error(roundBody.error || "Visit monitoring round could not be loaded.");
      const visitPoint = (roundBody.round?.points || []).find((row) => row.id === resolvedPoint.id);
      if (!visitPoint) throw new Error("This monitoring point belongs to a different customer site than the active visit.");
      setPoint({ ...resolvedPoint, ...visitPoint });
      setLookup(resolvedPoint.barcode || resolvedPoint.code || candidate);
      setForm(INITIAL);
      setMessage(`Resolved ${resolvedPoint.code} for this service visit.`);
      stopCamera();
    } catch (e) { setPoint(null); setError(e.message || "Monitoring point could not be resolved."); }
    finally { setBusy(""); }
  }, [occurrenceId, organizationId, stopCamera]);

  useEffect(() => { if (initialLookup) resolvePoint(initialLookup); return () => stopCamera(); }, [initialLookup, resolvePoint, stopCamera]);

  async function startCamera() {
    if (typeof window === "undefined" || !("BarcodeDetector" in window) || !navigator.mediaDevices?.getUserMedia) {
      setError("Camera barcode detection is not available here. Use the same field with a typed code or Bluetooth/USB scanner.");
      return;
    }
    setError(""); setCamera("starting");
    try {
      detectorRef.current = new window.BarcodeDetector({ formats: ["qr_code", "code_128", "code_39", "ean_13", "ean_8", "upc_a", "upc_e"] });
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false });
      streamRef.current = stream;
      videoRef.current.srcObject = stream;
      await videoRef.current.play();
      setCamera("scanning");
      const tick = async () => {
        if (!detectorRef.current || !videoRef.current) return;
        const found = await detectorRef.current.detect(videoRef.current).catch(() => []);
        const value = text(found?.[0]?.rawValue);
        if (value) return resolvePoint(value);
        frameRef.current = requestAnimationFrame(tick);
      };
      frameRef.current = requestAnimationFrame(tick);
    } catch (e) { stopCamera(); setError(e.message || "Camera could not be started."); }
  }

  async function record(event) {
    event.preventDefault();
    if (!point?.id) return;
    setBusy("save"); setError(""); setMessage("");
    try {
      const response = await fetch("/api/service-management/monitoring-round/check", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ organizationId, occurrenceId, pointId: point.id, ...form, clientMutationId: randomId() }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || !body.success) throw new Error(body.error || "Monitoring check could not be recorded.");
      setMessage(`${point.code} checked and bound to this service visit.`);
      setForm(INITIAL);
      setPoint((current) => current ? { ...current, checked_in_visit: true } : current);
    } catch (e) { setError(e.message || "Monitoring check could not be recorded."); }
    finally { setBusy(""); }
  }

  return <main className="min-h-[calc(100vh-61px)] bg-[#F7F6F3] px-4 py-5 text-[#191919] md:px-7 lg:px-9 lg:py-7"><div className="mx-auto max-w-[1180px]">
    <header className="border-b border-black/[0.07] pb-5"><Link href={roundHref} className="inline-flex items-center gap-1.5 text-[9px] text-[#8D867E]"><ArrowLeft size={10}/> Visit monitoring round</Link><div className="mt-3 text-[10px] font-medium uppercase tracking-[0.18em] text-[#9A744B]">Visit-bound scan</div><h1 className="mt-1 text-[27px] font-medium tracking-[-0.04em] text-[#201E1B]">Identify and check point</h1><p className="mt-1 text-[11px] leading-5 text-[#777169]">Every check is validated against the active service visit before it becomes governed activity evidence.</p></header>
    {(error || message) ? <div className={`mt-4 flex items-start gap-2 rounded-xl border px-4 py-3 text-[10px] ${error ? "border-[#B36B52]/20 bg-[#B36B52]/[0.05] text-[#8B4937]" : "border-[#6F8B77]/20 bg-[#6F8B77]/[0.06] text-[#55705D]"}`}>{error ? <AlertTriangle size={12}/> : <CheckCircle2 size={12}/>} {error || message}</div> : null}
    <section className="mt-4 grid gap-4 lg:grid-cols-2"><div className="rounded-2xl border border-black/[0.07] bg-white p-5"><div className="flex items-center gap-2 text-[9px] font-medium uppercase tracking-[0.12em] text-[#8B6743]"><ScanLine size={12}/> 1 · Identify</div><form onSubmit={(e) => { e.preventDefault(); resolvePoint(lookup); }} className="mt-3 flex gap-2"><input autoFocus value={lookup} onChange={(e) => setLookup(e.target.value)} placeholder="Scan or enter code / barcode" className="min-w-0 flex-1 rounded-xl border border-black/[0.09] bg-[#FAF9F7] px-3 py-3 text-[12px] outline-none"/><button disabled={!text(lookup) || busy === "resolve"} className="rounded-xl bg-[#28231E] px-4 text-[9px] text-white disabled:opacity-40">Resolve</button></form><button type="button" onClick={camera === "scanning" ? stopCamera : startCamera} className="mt-2 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-black/[0.08] bg-[#F7F5F1] px-3 py-3 text-[9px] text-[#5D534A]">{camera === "scanning" ? <Square size={11}/> : <Camera size={11}/>} {camera === "scanning" ? "Stop camera" : "Open camera"}</button><div className="mt-3 overflow-hidden rounded-xl bg-[#1E1B18]"><video ref={videoRef} playsInline muted className={`aspect-video w-full object-cover ${camera === "scanning" ? "opacity-100" : "opacity-0"}`}/></div></div>
    <div className="rounded-2xl border border-black/[0.07] bg-white p-5">{!point ? <div className="flex min-h-72 flex-col items-center justify-center text-center text-[9px] text-[#938C83]"><Barcode size={24} className="mb-2"/>Resolve a point to open the visit check.</div> : <><div className="text-[9px] font-medium uppercase tracking-[0.12em] text-[#8B6743]">2 · Inspect</div><div className="mt-2 rounded-xl bg-[#FBFAF8] p-4"><div className="text-[17px] font-medium text-[#2B2723]">{point.code}</div><div className="mt-1 flex items-center gap-1.5 text-[9px] text-[#847D75]"><MapPin size={9}/>{point.customer_location_name}{point.area ? ` · ${point.area}` : ""}</div></div><form onSubmit={record} className="mt-3 grid gap-2 sm:grid-cols-2"><select value={form.condition} onChange={(e) => setForm((f) => ({...f,condition:e.target.value}))} className="rounded-lg border border-black/[0.09] px-3 py-2.5 text-[10px]"><option value="good">Good condition</option><option value="damaged">Damaged</option><option value="missing">Missing</option><option value="blocked">Blocked</option><option value="contaminated">Contaminated</option><option value="replacement_required">Replacement required</option></select><select value={form.activityLevel} onChange={(e) => setForm((f) => ({...f,activityLevel:e.target.value}))} className="rounded-lg border border-black/[0.09] px-3 py-2.5 text-[10px]"><option value="none">No activity</option><option value="low">Low activity</option><option value="medium">Medium activity</option><option value="high">High activity</option><option value="critical">Critical activity</option></select><input value={form.pestName} onChange={(e) => setForm((f) => ({...f,pestName:e.target.value}))} placeholder="Pest observed" className="rounded-lg border border-black/[0.09] px-3 py-2.5 text-[10px]"/><input type="number" min="0" value={form.count} onChange={(e) => setForm((f) => ({...f,count:e.target.value}))} placeholder="Count" className="rounded-lg border border-black/[0.09] px-3 py-2.5 text-[10px]"/><select value={form.actionTaken} onChange={(e) => setForm((f) => ({...f,actionTaken:e.target.value}))} className="rounded-lg border border-black/[0.09] px-3 py-2.5 text-[10px]"><option value="inspected">Inspected</option><option value="cleaned">Cleaned</option><option value="rebaited">Rebaited</option><option value="reset">Reset</option><option value="repaired">Repaired</option><option value="replaced">Replaced</option><option value="removed">Removed</option></select><textarea value={form.notes} onChange={(e) => setForm((f) => ({...f,notes:e.target.value}))} placeholder="Only notes needed for the next decision" className="min-h-20 rounded-lg border border-black/[0.09] px-3 py-2.5 text-[10px]"/><button disabled={busy === "save"} className="sm:col-span-2 rounded-xl bg-[#2A251F] px-4 py-3 text-[10px] font-medium text-white disabled:opacity-40">{busy === "save" ? "Recording…" : "Record visit check"}</button></form></>}</div></section>
  </div></main>;
}
