"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  Barcode,
  Camera,
  CheckCircle2,
  CircleDot,
  Flashlight,
  Keyboard,
  MapPin,
  QrCode,
  RefreshCw,
  ScanLine,
  ShieldCheck,
  Square,
} from "lucide-react";

function text(value) { return String(value ?? "").trim(); }
function normalized(value) { return text(value).toLowerCase().replace(/[\s-]+/g, "_"); }
function formatDateTime(value) {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return "No previous check";
  return date.toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}
function statusTone(value) {
  if (value === "overdue") return "border-[#B36B52]/25 bg-[#B36B52]/[0.07] text-[#8B4937]";
  if (value === "due_today") return "border-[#D6A66A]/35 bg-[#D6A66A]/[0.10] text-[#806143]";
  return "border-[#6F8B77]/25 bg-[#6F8B77]/[0.08] text-[#55705D]";
}
function dueLabel(value) {
  if (value === "overdue") return "Overdue";
  if (value === "due_today") return "Due today";
  if (value === "inactive") return "Inactive";
  if (value === "unset") return "No cadence";
  return "Upcoming";
}
function randomId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

const INITIAL_CHECK = {
  condition: "good",
  activityLevel: "none",
  pestName: "",
  count: "0",
  actionTaken: "inspected",
  notes: "",
};

export default function PestControlMonitoringScanner({ organizationId }) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const detectorRef = useRef(null);
  const frameRef = useRef(null);
  const scanningRef = useRef(false);

  const [lookup, setLookup] = useState("");
  const [point, setPoint] = useState(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [resolving, setResolving] = useState(false);
  const [saving, setSaving] = useState(false);
  const [cameraState, setCameraState] = useState("idle");
  const [cameraSupported, setCameraSupported] = useState(false);
  const [detectorSupported, setDetectorSupported] = useState(false);
  const [torchSupported, setTorchSupported] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const [check, setCheck] = useState(INITIAL_CHECK);

  const monitoringHref = `/workspace/${encodeURIComponent(organizationId)}/operations/field-service/monitoring-points`;
  const technicianHref = `/workspace/${encodeURIComponent(organizationId)}/operations/field-service/technician`;
  const siteIntelligenceHref = `/workspace/${encodeURIComponent(organizationId)}/operations/field-service/site-intelligence`;

  useEffect(() => {
    setCameraSupported(Boolean(typeof navigator !== "undefined" && navigator.mediaDevices?.getUserMedia));
    setDetectorSupported(Boolean(typeof window !== "undefined" && "BarcodeDetector" in window));
    return () => stopCamera();
  }, []);

  const stopCamera = useCallback(() => {
    scanningRef.current = false;
    if (frameRef.current) cancelAnimationFrame(frameRef.current);
    frameRef.current = null;
    const stream = streamRef.current;
    streamRef.current = null;
    if (stream) stream.getTracks().forEach((track) => track.stop());
    if (videoRef.current) videoRef.current.srcObject = null;
    detectorRef.current = null;
    setCameraState("idle");
    setTorchSupported(false);
    setTorchOn(false);
  }, []);

  const resolvePoint = useCallback(async (value) => {
    const candidate = text(value);
    if (!candidate || !organizationId) return;
    setResolving(true); setError(""); setMessage("");
    try {
      const response = await fetch(`/api/service-management/monitoring-points/resolve?organizationId=${encodeURIComponent(organizationId)}&lookup=${encodeURIComponent(candidate)}`, { cache: "no-store" });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || !body.success) throw new Error(body.error || "Monitoring point could not be resolved.");
      setPoint(body.point || null);
      setLookup(body.point?.barcode || body.point?.code || candidate);
      setCheck(INITIAL_CHECK);
      setMessage(`Resolved ${body.point?.code || "monitoring point"} at ${body.point?.customer_location_name || "site"}.`);
      stopCamera();
    } catch (lookupError) {
      setPoint(null);
      setError(lookupError.message || "Monitoring point could not be resolved.");
    } finally {
      setResolving(false);
    }
  }, [organizationId, stopCamera]);

  const scanFrame = useCallback(async () => {
    if (!scanningRef.current || !videoRef.current || !detectorRef.current) return;
    try {
      if (videoRef.current.readyState >= 2) {
        const detections = await detectorRef.current.detect(videoRef.current);
        const value = text(detections?.[0]?.rawValue);
        if (value) {
          scanningRef.current = false;
          await resolvePoint(value);
          return;
        }
      }
    } catch (scanError) {
      setError(scanError.message || "Camera scan failed. Enter the code manually.");
      stopCamera();
      return;
    }
    frameRef.current = requestAnimationFrame(scanFrame);
  }, [resolvePoint, stopCamera]);

  async function startCamera() {
    if (!cameraSupported) {
      setError("Camera access is not available in this browser. Use the code field or a Bluetooth/USB scanner.");
      return;
    }
    if (!detectorSupported) {
      setError("This browser does not provide native barcode detection. Use the same field with a typed, Bluetooth or USB scan.");
      return;
    }
    setError(""); setMessage(""); setCameraState("starting");
    try {
      const formats = ["qr_code", "code_128", "code_39", "ean_13", "ean_8", "upc_a", "upc_e"];
      detectorRef.current = new window.BarcodeDetector({ formats });
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      const track = stream.getVideoTracks()[0];
      const capabilities = track?.getCapabilities?.() || {};
      setTorchSupported(Boolean(capabilities.torch));
      scanningRef.current = true;
      setCameraState("scanning");
      frameRef.current = requestAnimationFrame(scanFrame);
    } catch (cameraError) {
      stopCamera();
      setError(cameraError.message || "Camera could not be started. Use manual or external-scanner input.");
    }
  }

  async function toggleTorch() {
    const track = streamRef.current?.getVideoTracks?.()[0];
    if (!track || !torchSupported) return;
    const next = !torchOn;
    try {
      await track.applyConstraints({ advanced: [{ torch: next }] });
      setTorchOn(next);
    } catch {
      setTorchSupported(false);
    }
  }

  async function recordCheck(event) {
    event.preventDefault();
    if (!point?.id) return;
    setSaving(true); setError(""); setMessage("");
    try {
      const response = await fetch("/api/service-management/monitoring-points", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          organizationId,
          action: "check",
          pointId: point.id,
          ...check,
          clientMutationId: randomId(),
        }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || !body.success) throw new Error(body.error || "Monitoring check could not be recorded.");
      setMessage(`Check recorded for ${point.code}. Ready for the next point.`);
      const resolvedResponse = await fetch(`/api/service-management/monitoring-points/resolve?organizationId=${encodeURIComponent(organizationId)}&lookup=${encodeURIComponent(point.barcode || point.code)}`, { cache: "no-store" });
      const resolvedBody = await resolvedResponse.json().catch(() => ({}));
      if (resolvedResponse.ok && resolvedBody.success) setPoint(resolvedBody.point || point);
      setCheck(INITIAL_CHECK);
    } catch (saveError) {
      setError(saveError.message || "Monitoring check could not be recorded.");
    } finally {
      setSaving(false);
    }
  }

  function nextPoint() {
    setPoint(null);
    setLookup("");
    setCheck(INITIAL_CHECK);
    setError("");
    setMessage("");
    window.setTimeout(() => document.getElementById("monitoring-scan-input")?.focus(), 20);
  }

  const lastCheck = point?.latest_check || null;
  const canCheck = normalized(point?.status) === "active";
  const activityAttention = ["high", "critical"].includes(normalized(lastCheck?.activity_level));
  const conditionAttention = ["damaged", "missing", "blocked", "contaminated", "replacement_required"].includes(normalized(lastCheck?.condition));

  return (
    <main className="min-h-[calc(100vh-61px)] bg-[#F7F6F3] px-3 py-4 text-[#191919] sm:px-5 lg:px-8 lg:py-7">
      <div className="mx-auto max-w-[1260px]">
        <header className="border-b border-black/[0.07] pb-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <Link href={technicianHref} className="inline-flex items-center gap-1.5 text-[9px] text-[#8D867E] hover:text-[#79593A]"><ArrowLeft size={10} /> Technician execution</Link>
              <div className="mt-3 text-[10px] font-medium uppercase tracking-[0.18em] text-[#9A744B]">Field monitoring</div>
              <h1 className="mt-1 text-[27px] font-medium tracking-[-0.04em] text-[#201E1B]">Scan, inspect, record</h1>
              <p className="mt-1 max-w-3xl text-[11px] leading-5 text-[#777169]">Resolve the exact bait station, trap, ILT or termite point before recording activity. Camera scan is progressive enhancement; the same field accepts typed codes and Bluetooth/USB scanner input.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link href={monitoringHref} className="rounded-lg border border-black/[0.08] bg-white px-3 py-2 text-[9px] text-[#625D56]">Monitoring control</Link>
              <Link href={siteIntelligenceHref} className="rounded-lg border border-black/[0.08] bg-white px-3 py-2 text-[9px] text-[#625D56]">Site intelligence</Link>
            </div>
          </div>
        </header>

        {(error || message) ? <div className={`mt-4 flex items-start gap-2 rounded-xl border px-4 py-3 text-[10px] ${error ? "border-[#B36B52]/20 bg-[#B36B52]/[0.05] text-[#8B4937]" : "border-[#6F8B77]/20 bg-[#6F8B77]/[0.06] text-[#55705D]"}`}>{error ? <AlertTriangle size={12} className="mt-0.5" /> : <CheckCircle2 size={12} className="mt-0.5" />}{error || message}</div> : null}

        <section className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
          <div className="rounded-2xl border border-black/[0.07] bg-white p-4 sm:p-5">
            <div className="flex items-center justify-between gap-3">
              <div><div className="text-[9px] font-medium uppercase tracking-[0.12em] text-[#8B6743]">1 · Identify point</div><div className="mt-1 text-[10px] text-[#8E877F]">Camera, handheld scanner or manual code</div></div>
              <ScanLine size={18} className="text-[#9B744B]" />
            </div>

            <form onSubmit={(event) => { event.preventDefault(); resolvePoint(lookup); }} className="mt-4">
              <div className="flex gap-2 rounded-xl border border-black/[0.09] bg-[#FAF9F7] p-2">
                <div className="flex flex-1 items-center gap-2 px-2"><Barcode size={14} className="text-[#8C8073]" /><input id="monitoring-scan-input" autoFocus autoCapitalize="off" autoCorrect="off" spellCheck={false} value={lookup} onChange={(event) => setLookup(event.target.value)} placeholder="Scan or enter point code / barcode" className="min-w-0 flex-1 bg-transparent py-2 text-[13px] font-medium tracking-[0.02em] text-[#2A2520] outline-none placeholder:text-[#AAA39B]" /></div>
                <button disabled={resolving || !text(lookup)} className="rounded-lg bg-[#28231E] px-4 text-[9px] font-medium text-white disabled:opacity-40">{resolving ? "Resolving…" : "Resolve"}</button>
              </div>
            </form>

            <div className="mt-3 grid grid-cols-2 gap-2">
              <button type="button" onClick={cameraState === "scanning" ? stopCamera : startCamera} className="inline-flex items-center justify-center gap-2 rounded-xl border border-black/[0.08] bg-[#F7F5F1] px-3 py-3 text-[9px] font-medium text-[#5D534A]">{cameraState === "scanning" ? <Square size={12} /> : <Camera size={12} />}{cameraState === "scanning" ? "Stop camera" : "Open camera"}</button>
              <div className="inline-flex items-center justify-center gap-2 rounded-xl border border-black/[0.08] bg-[#F7F5F1] px-3 py-3 text-[9px] text-[#776F67]"><Keyboard size={12} /> External scanner ready</div>
            </div>

            <div className="mt-3 overflow-hidden rounded-2xl border border-black/[0.08] bg-[#1E1B18]">
              <div className="relative aspect-[4/3] sm:aspect-video">
                <video ref={videoRef} playsInline muted className={`h-full w-full object-cover ${cameraState === "scanning" ? "opacity-100" : "opacity-0"}`} />
                {cameraState !== "scanning" ? <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-center text-[#D8D1C7]"><QrCode size={28} strokeWidth={1.2} /><div className="text-[10px]">Camera scan {detectorSupported ? "available" : "depends on browser support"}</div><div className="max-w-[260px] text-[8px] leading-4 text-[#9E968C]">Manual and Bluetooth/USB scan remains available on every supported device.</div></div> : <><div className="pointer-events-none absolute inset-[18%] rounded-2xl border border-white/60 shadow-[0_0_0_999px_rgba(0,0,0,0.28)]" /><div className="pointer-events-none absolute inset-x-0 top-1/2 h-px bg-white/70" />{torchSupported ? <button type="button" onClick={toggleTorch} className="absolute bottom-3 right-3 inline-flex h-9 w-9 items-center justify-center rounded-full bg-black/55 text-white" aria-label="Toggle camera light"><Flashlight size={14} /></button> : null}</>}
              </div>
            </div>

            <div className="mt-3 grid grid-cols-2 gap-2 text-[8px] text-[#8F887F]">
              <div className="rounded-lg bg-[#F5F3EF] px-3 py-2"><span className="font-medium text-[#665A50]">Camera</span> · {cameraSupported ? "available" : "unavailable"}</div>
              <div className="rounded-lg bg-[#F5F3EF] px-3 py-2"><span className="font-medium text-[#665A50]">Native detection</span> · {detectorSupported ? "available" : "fallback active"}</div>
            </div>
          </div>

          <div className="min-w-0">
            {!point ? <div className="flex min-h-[520px] flex-col items-center justify-center rounded-2xl border border-dashed border-black/[0.10] bg-white/70 px-6 text-center"><CircleDot size={24} className="text-[#A9845C]" /><div className="mt-3 text-[13px] font-medium text-[#3B352F]">Identify the physical monitoring point first</div><div className="mt-2 max-w-md text-[10px] leading-5 text-[#8D867E]">The check form only opens after Avantiqo resolves a unique governed equipment record. This prevents a technician from accidentally recording activity against the wrong site or station.</div></div> : <div className="space-y-4">
              <section className="rounded-2xl border border-black/[0.07] bg-white p-5">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div><div className="text-[9px] font-medium uppercase tracking-[0.12em] text-[#906B45]">Resolved monitoring point</div><div className="mt-1 flex items-baseline gap-2"><h2 className="text-[24px] font-medium tracking-[-0.04em] text-[#27231F]">{point.code}</h2><span className="text-[9px] text-[#918A82]">{point.point_type_label}</span></div><div className="mt-2 flex items-center gap-1.5 text-[10px] text-[#756E66]"><MapPin size={11} /> {point.customer_name} · {point.customer_location_name}</div><div className="mt-1 text-[9px] text-[#978F86]">{point.area || "Area not specified"}{point.placement ? ` · ${point.placement}` : ""}</div></div>
                  <span className={`rounded-full border px-2.5 py-1 text-[8px] font-medium uppercase tracking-[0.08em] ${statusTone(point.due_state)}`}>{dueLabel(point.due_state)}</span>
                </div>
                <div className="mt-4 grid gap-2 sm:grid-cols-4"><div className="rounded-xl bg-[#F7F5F1] p-3"><div className="text-[8px] uppercase tracking-[0.1em] text-[#999188]">Barcode</div><div className="mt-1 truncate text-[10px] font-medium text-[#514941]">{point.barcode || "Code only"}</div></div><div className="rounded-xl bg-[#F7F5F1] p-3"><div className="text-[8px] uppercase tracking-[0.1em] text-[#999188]">Cadence</div><div className="mt-1 text-[10px] font-medium text-[#514941]">Every {point.check_cadence_days} days</div></div><div className="rounded-xl bg-[#F7F5F1] p-3"><div className="text-[8px] uppercase tracking-[0.1em] text-[#999188]">Checks</div><div className="mt-1 text-[10px] font-medium text-[#514941]">{point.check_count || 0}</div></div><div className="rounded-xl bg-[#F7F5F1] p-3"><div className="text-[8px] uppercase tracking-[0.1em] text-[#999188]">Next due</div><div className="mt-1 text-[10px] font-medium text-[#514941]">{point.next_check_at ? new Date(point.next_check_at).toLocaleDateString([], { month: "short", day: "numeric" }) : "Not set"}</div></div></div>

                <div className={`mt-4 rounded-xl border px-4 py-3 ${activityAttention || conditionAttention ? "border-[#B36B52]/20 bg-[#B36B52]/[0.04]" : "border-[#6F8B77]/20 bg-[#6F8B77]/[0.05]"}`}><div className="flex items-center gap-2 text-[8px] font-medium uppercase tracking-[0.1em] text-[#7E756C]"><ShieldCheck size={11} /> Previous governed check</div>{lastCheck ? <div className="mt-2 grid gap-2 sm:grid-cols-3"><div><div className="text-[8px] text-[#978F86]">When</div><div className="mt-0.5 text-[10px] font-medium text-[#49423C]">{formatDateTime(lastCheck.checked_at)}</div></div><div><div className="text-[8px] text-[#978F86]">Condition</div><div className={`mt-0.5 text-[10px] font-medium ${conditionAttention ? "text-[#96513E]" : "text-[#5B6F61]"}`}>{text(lastCheck.condition).replaceAll("_", " ")}</div></div><div><div className="text-[8px] text-[#978F86]">Pest activity</div><div className={`mt-0.5 text-[10px] font-medium ${activityAttention ? "text-[#96513E]" : "text-[#5B6F61]"}`}>{text(lastCheck.activity_level).replaceAll("_", " ")}{lastCheck.pest_name ? ` · ${lastCheck.pest_name}` : ""}</div></div></div> : <div className="mt-2 text-[10px] text-[#8D867E]">No prior check. This will become the point’s first governed monitoring record.</div>}</div>
              </section>

              <form onSubmit={recordCheck} className="rounded-2xl border border-black/[0.07] bg-white p-5">
                <div className="flex items-center justify-between"><div><div className="text-[9px] font-medium uppercase tracking-[0.12em] text-[#8B6743]">2 · Record this check</div><div className="mt-1 text-[9px] text-[#938C84]">Fast field capture; append-only Operations activity evidence</div></div><CheckCircle2 size={16} className="text-[#718675]" /></div>
                {!canCheck ? <div className="mt-4 rounded-xl border border-[#B36B52]/20 bg-[#B36B52]/[0.05] px-4 py-3 text-[9px] text-[#8B4937]">This point is {point.status}. Reactivate it in Monitoring Control before recording another field check.</div> : null}
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <label className="text-[8px] font-medium uppercase tracking-[0.08em] text-[#8D857D]">Condition<select value={check.condition} onChange={(event) => setCheck((current) => ({ ...current, condition: event.target.value }))} className="mt-1.5 w-full rounded-lg border border-black/[0.09] bg-white px-3 py-2.5 text-[10px] font-normal normal-case tracking-normal text-[#4B443E]"><option value="good">Good</option><option value="damaged">Damaged</option><option value="missing">Missing</option><option value="blocked">Blocked</option><option value="contaminated">Contaminated</option><option value="replacement_required">Replacement required</option></select></label>
                  <label className="text-[8px] font-medium uppercase tracking-[0.08em] text-[#8D857D]">Activity<select value={check.activityLevel} onChange={(event) => setCheck((current) => ({ ...current, activityLevel: event.target.value }))} className="mt-1.5 w-full rounded-lg border border-black/[0.09] bg-white px-3 py-2.5 text-[10px] font-normal normal-case tracking-normal text-[#4B443E]"><option value="none">None</option><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option><option value="critical">Critical</option></select></label>
                  <label className="text-[8px] font-medium uppercase tracking-[0.08em] text-[#8D857D]">Pest observed<input value={check.pestName} onChange={(event) => setCheck((current) => ({ ...current, pestName: event.target.value }))} placeholder="Optional when no activity" className="mt-1.5 w-full rounded-lg border border-black/[0.09] px-3 py-2.5 text-[10px] font-normal normal-case tracking-normal outline-none" /></label>
                  <label className="text-[8px] font-medium uppercase tracking-[0.08em] text-[#8D857D]">Observed count<input type="number" min="0" max="100000" value={check.count} onChange={(event) => setCheck((current) => ({ ...current, count: event.target.value }))} className="mt-1.5 w-full rounded-lg border border-black/[0.09] px-3 py-2.5 text-[10px] font-normal normal-case tracking-normal outline-none" /></label>
                  <label className="text-[8px] font-medium uppercase tracking-[0.08em] text-[#8D857D] sm:col-span-2">Action taken<select value={check.actionTaken} onChange={(event) => setCheck((current) => ({ ...current, actionTaken: event.target.value }))} className="mt-1.5 w-full rounded-lg border border-black/[0.09] bg-white px-3 py-2.5 text-[10px] font-normal normal-case tracking-normal text-[#4B443E]"><option value="inspected">Inspected</option><option value="cleaned">Cleaned</option><option value="rebaited">Rebaited</option><option value="reset">Reset</option><option value="repaired">Repaired</option><option value="replaced">Replaced</option><option value="removed">Removed</option></select></label>
                  <label className="text-[8px] font-medium uppercase tracking-[0.08em] text-[#8D857D] sm:col-span-2">Technician note<textarea rows={3} value={check.notes} onChange={(event) => setCheck((current) => ({ ...current, notes: event.target.value }))} placeholder="Only what matters for the next technician or supervisor" className="mt-1.5 w-full resize-none rounded-lg border border-black/[0.09] px-3 py-2.5 text-[10px] font-normal normal-case tracking-normal outline-none" /></label>
                </div>
                <div className="mt-4 flex flex-col gap-2 sm:flex-row"><button disabled={!canCheck || saving} className="flex-1 rounded-xl bg-[#28231E] px-4 py-3 text-[10px] font-medium text-white disabled:opacity-40">{saving ? "Recording governed check…" : "Record check"}</button><button type="button" onClick={nextPoint} className="rounded-xl border border-black/[0.08] bg-white px-4 py-3 text-[9px] text-[#68615A]">Next point</button></div>
              </form>
            </div>}
          </div>
        </section>
      </div>
    </main>
  );
}
