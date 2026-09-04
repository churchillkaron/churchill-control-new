"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  Camera,
  CheckCircle2,
  Eye,
  FileCheck2,
  LocateFixed,
  MapPin,
  PenLine,
  RefreshCw,
  ShieldCheck,
  Upload,
} from "lucide-react";

const EXTERNAL_TYPES = new Set(["photo", "signature", "file"]);
const IMAGE_ACCEPT = "image/jpeg,image/png,image/webp";
const FILE_ACCEPT = `${IMAGE_ACCEPT},application/pdf`;

function text(value) {
  return String(value ?? "").trim();
}

function normalized(value) {
  return text(value).toLowerCase().replace(/[\s-]+/g, "_");
}

function requiredEvidence(protocol = {}) {
  const requirements = protocol.evidence_requirements || {};
  const fields = Array.isArray(protocol.field_schema) ? protocol.field_schema : [];
  const external = fields.filter((field) => field?.required && EXTERNAL_TYPES.has(normalized(field.type)));
  return {
    requirements,
    external,
    count: [
      requirements.before_photos,
      requirements.after_photos,
      requirements.customer_signature,
      requirements.technician_signature,
      requirements.location_confirmation,
      ...external,
    ].filter(Boolean).length,
  };
}

function EvidenceCard({ icon: Icon, title, detail, required, children }) {
  return (
    <section className={`rounded-2xl border p-4 ${required ? "border-[#C08A4A]/20 bg-[#C08A4A]/[0.035]" : "border-black/[0.07] bg-white"}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2.5">
          <div className="mt-0.5 flex h-7 w-7 items-center justify-center rounded-lg bg-[#F5F1EA] text-[#8A6846]"><Icon size={12} /></div>
          <div>
            <div className="text-[10px] font-medium text-[#3F3A34]">{title}</div>
            <div className="mt-0.5 text-[8px] leading-3 text-[#928B82]">{detail}</div>
          </div>
        </div>
        {required ? <span className="text-[7px] font-medium uppercase tracking-[0.07em] text-[#9A744B]">Required</span> : null}
      </div>
      <div className="mt-3">{children}</div>
    </section>
  );
}

function AssetList({ references = [], previews = {} }) {
  if (!references.length) return <div className="rounded-xl border border-dashed border-black/[0.09] px-3 py-4 text-center text-[8px] text-[#9A938A]">No proof captured yet.</div>;
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {references.map((reference, index) => (
        <div key={`${reference}-${index}`} className="flex min-w-0 items-center justify-between gap-2 rounded-xl border border-black/[0.07] bg-white px-3 py-2.5">
          <div className="min-w-0"><div className="text-[8px] font-medium text-[#5F5952]">Proof {index + 1}</div><div className="mt-0.5 truncate font-mono text-[7px] text-[#9A938A]">{reference}</div></div>
          {previews[reference] ? <a href={previews[reference]} target="_blank" rel="noreferrer" className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-black/[0.07] text-[#7A624A]" aria-label="Preview evidence"><Eye size={10} /></a> : null}
        </div>
      ))}
    </div>
  );
}

function UploadControl({ label, accept, capture, busy, onFiles }) {
  const inputRef = useRef(null);
  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        capture={capture}
        multiple
        className="hidden"
        onChange={(event) => {
          const files = Array.from(event.target.files || []);
          event.target.value = "";
          if (files.length) onFiles(files);
        }}
      />
      <button type="button" disabled={busy} onClick={() => inputRef.current?.click()} className="inline-flex items-center gap-1.5 rounded-lg border border-black/[0.08] bg-white px-3 py-2 text-[9px] font-medium text-[#625D56] disabled:opacity-40">
        {capture ? <Camera size={10} /> : <Upload size={10} />}{busy ? "Uploading…" : label}
      </button>
    </>
  );
}

function SignaturePad({ signer, setSigner, reference, preview, busy, onSave, label }) {
  const canvasRef = useRef(null);
  const drawing = useRef(false);
  const dirty = useRef(false);

  function point(event) {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  function start(event) {
    event.currentTarget.setPointerCapture?.(event.pointerId);
    drawing.current = true;
    dirty.current = true;
    const ctx = canvasRef.current.getContext("2d");
    const p = point(event);
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
  }

  function move(event) {
    if (!drawing.current) return;
    const ctx = canvasRef.current.getContext("2d");
    const p = point(event);
    ctx.lineWidth = 1.7;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#28231F";
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
  }

  function end() {
    drawing.current = false;
  }

  function clear() {
    const canvas = canvasRef.current;
    canvas.getContext("2d").clearRect(0, 0, canvas.width, canvas.height);
    dirty.current = false;
  }

  async function save() {
    if (!text(signer) || !dirty.current || busy) return;
    const canvas = canvasRef.current;
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png", 0.95));
    if (!blob) return;
    const file = new File([blob], `${label.toLowerCase().replace(/\s+/g, "-")}.png`, { type: "image/png" });
    await onSave(file);
  }

  return (
    <div className="space-y-2.5">
      <input value={signer} onChange={(event) => setSigner(event.target.value)} placeholder={`${label} name`} className="w-full rounded-xl border border-black/[0.09] bg-white px-3 py-2.5 text-[10px] outline-none focus:border-[#D6A66A]/60" />
      <div className="overflow-hidden rounded-xl border border-black/[0.09] bg-white">
        <canvas ref={canvasRef} width={640} height={180} className="h-[118px] w-full touch-none" onPointerDown={start} onPointerMove={move} onPointerUp={end} onPointerCancel={end} />
        <div className="flex items-center justify-between border-t border-black/[0.06] px-2.5 py-2">
          <button type="button" onClick={clear} className="text-[8px] text-[#8F877E]">Clear</button>
          <button type="button" onClick={save} disabled={!text(signer) || busy} className="rounded-lg bg-[#2C2925] px-3 py-1.5 text-[8px] font-medium text-white disabled:opacity-35">{busy ? "Saving…" : "Save signed proof"}</button>
        </div>
      </div>
      {reference ? <div className="flex items-center justify-between gap-2 rounded-xl border border-[#748267]/18 bg-[#748267]/[0.05] px-3 py-2.5 text-[8px] text-[#607057]"><span>Signed proof captured</span>{preview ? <a href={preview} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1"><Eye size={9} /> Preview</a> : null}</div> : null}
    </div>
  );
}

export default function PestControlCompletionEvidenceWorkspace({ organizationId, occurrenceId }) {
  const [state, setState] = useState({ loading: true, error: "", record: null });
  const [beforePhotos, setBeforePhotos] = useState([]);
  const [afterPhotos, setAfterPhotos] = useState([]);
  const [customerSigner, setCustomerSigner] = useState("");
  const [customerSignatureRef, setCustomerSignatureRef] = useState("");
  const [technicianSigner, setTechnicianSigner] = useState("");
  const [technicianSignatureRef, setTechnicianSignatureRef] = useState("");
  const [fieldEvidence, setFieldEvidence] = useState({});
  const [location, setLocation] = useState(null);
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState("");
  const [notice, setNotice] = useState("");
  const [evidenceId, setEvidenceId] = useState("");
  const [previews, setPreviews] = useState({});

  const previewReference = useCallback(async (reference) => {
    if (!reference || previews[reference]) return;
    try {
      const response = await fetch(`/api/service-management/evidence/assets?organizationId=${encodeURIComponent(organizationId)}&occurrenceId=${encodeURIComponent(occurrenceId)}&reference=${encodeURIComponent(reference)}`, { cache: "no-store", credentials: "include" });
      const json = await response.json().catch(() => ({}));
      if (response.ok && json.success && json.preview_url) setPreviews((current) => ({ ...current, [reference]: json.preview_url }));
    } catch {}
  }, [occurrenceId, organizationId, previews]);

  const load = useCallback(async () => {
    if (!organizationId || !occurrenceId) return;
    setState((current) => ({ ...current, loading: true, error: "" }));
    try {
      const response = await fetch(`/api/service-management/evidence?organizationId=${encodeURIComponent(organizationId)}&occurrenceId=${encodeURIComponent(occurrenceId)}`, { cache: "no-store", credentials: "include" });
      const json = await response.json().catch(() => ({}));
      if (!response.ok || !json.success) throw new Error(json.error || "Completion evidence could not be loaded.");
      setState({ loading: false, error: "", record: json });
      const current = json.current_evidence?.attributes?.service_completion_evidence || null;
      if (current) {
        const proofs = current.proofs || {};
        setEvidenceId(json.current_evidence.id || "");
        setBeforePhotos(proofs.before_photos || []);
        setAfterPhotos(proofs.after_photos || []);
        setCustomerSigner(proofs.customer_signature?.signer_name || "");
        setCustomerSignatureRef(proofs.customer_signature?.reference || "");
        setTechnicianSigner(proofs.technician_signature?.signer_name || "");
        setTechnicianSignatureRef(proofs.technician_signature?.reference || "");
        setFieldEvidence(Object.fromEntries(Object.entries(proofs.field_evidence || {}).map(([key, values]) => [key, values || []])));
        setLocation(proofs.location_confirmation?.latitude !== null && proofs.location_confirmation?.latitude !== undefined ? proofs.location_confirmation : null);
        setNotes(proofs.notes || "");
        const refs = [
          ...(proofs.before_photos || []),
          ...(proofs.after_photos || []),
          proofs.customer_signature?.reference,
          proofs.technician_signature?.reference,
          ...Object.values(proofs.field_evidence || {}).flat(),
        ].filter(Boolean);
        refs.forEach((reference) => previewReference(reference));
      }
    } catch (error) {
      setState((current) => ({ ...current, loading: false, error: error?.message || "Completion evidence could not be loaded." }));
    }
  }, [occurrenceId, organizationId, previewReference]);

  useEffect(() => { load(); }, [load]);

  const protocol = state.record?.protocol || null;
  const required = useMemo(() => requiredEvidence(protocol || {}), [protocol]);
  const currentEvidence = state.record?.current_evidence || null;
  const history = Array.isArray(state.record?.evidence_history) ? state.record.evidence_history : [];
  const technicianHref = `/workspace/${encodeURIComponent(organizationId)}/operations/field-service/technician`;

  async function uploadFiles(files, { kind, fieldKey = "general", append }) {
    if (!files?.length) return;
    setBusy(`${kind}:${fieldKey}`);
    setNotice("");
    try {
      const uploaded = [];
      for (const file of files) {
        const form = new FormData();
        form.append("organizationId", organizationId);
        form.append("occurrenceId", occurrenceId);
        form.append("kind", kind);
        form.append("fieldKey", fieldKey);
        form.append("file", file);
        const response = await fetch("/api/service-management/evidence/assets", { method: "POST", credentials: "include", body: form });
        const json = await response.json().catch(() => ({}));
        if (!response.ok || !json.success) throw new Error(json.error || "Evidence asset could not be uploaded.");
        uploaded.push(json.asset.reference);
        if (json.asset.preview_url) setPreviews((current) => ({ ...current, [json.asset.reference]: json.asset.preview_url }));
      }
      append(uploaded);
      setNotice(`${uploaded.length} governed proof asset${uploaded.length === 1 ? "" : "s"} captured.`);
    } catch (error) {
      setNotice(error?.message || "Evidence asset could not be uploaded.");
    } finally {
      setBusy("");
    }
  }

  function captureLocation() {
    setNotice("");
    if (!navigator.geolocation) return setNotice("This browser does not provide geolocation.");
    setBusy("location");
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocation({ latitude: position.coords.latitude, longitude: position.coords.longitude, accuracy_m: position.coords.accuracy, captured_at: new Date().toISOString() });
        setBusy("");
      },
      (error) => { setNotice(error?.message || "Location could not be captured."); setBusy(""); },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
    );
  }

  async function saveSignature(file, kind, setter) {
    await uploadFiles([file], { kind, fieldKey: "signature", append: (refs) => setter(refs[0] || "") });
  }

  async function saveEvidence() {
    if (!protocol || busy) return;
    setBusy("save");
    setNotice("");
    try {
      const response = await fetch("/api/service-management/evidence", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          organizationId,
          occurrenceId,
          submissionKey: crypto.randomUUID(),
          proofs: {
            before_photos: beforePhotos,
            after_photos: afterPhotos,
            customer_signature: { signer_name: text(customerSigner) || null, reference: text(customerSignatureRef) || null, attested_at: customerSigner && customerSignatureRef ? new Date().toISOString() : null },
            technician_signature: { signer_name: text(technicianSigner) || null, reference: text(technicianSignatureRef) || null, attested_at: technicianSigner && technicianSignatureRef ? new Date().toISOString() : null },
            location_confirmation: location,
          },
          fieldEvidence,
          notes,
        }),
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok || !json.success) throw new Error(json.error || "Completion evidence could not be recorded.");
      setEvidenceId(json.evidence_id || "");
      setNotice("Evidence package passed governed preflight and was recorded.");
      await load();
    } catch (error) {
      setNotice(error?.message || "Completion evidence could not be recorded.");
    } finally {
      setBusy("");
    }
  }

  if (!occurrenceId) return <main className="min-h-[420px] bg-[#F7F6F3] p-8 text-sm text-[#77736C]">Open Completion Evidence from a specific technician visit.</main>;

  return (
    <main className="min-h-[calc(100vh-61px)] bg-[#F7F6F3] px-4 py-5 text-[#191919] md:px-7 lg:px-9 lg:py-7">
      <div className="mx-auto max-w-[1500px]">
        <header className="flex flex-wrap items-end justify-between gap-4 border-b border-black/[0.07] pb-5">
          <div>
            <Link href={technicianHref} className="inline-flex items-center gap-1.5 text-[9px] text-[#8D867E] hover:text-[#79593A]"><ArrowLeft size={10} /> Technician execution</Link>
            <div className="mt-3 text-[10px] font-medium uppercase tracking-[0.18em] text-[#9A744B]">Governed service proof</div>
            <h1 className="mt-1 text-[27px] font-medium tracking-[-0.04em] text-[#201E1B]">Completion evidence</h1>
            <p className="mt-1 max-w-3xl text-[11px] leading-5 text-[#777169]">Capture required proof directly on site. Assets stay private, immutable and bound to this exact service occurrence.</p>
          </div>
          <button type="button" onClick={load} className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-black/[0.08] bg-white text-[#806143]" aria-label="Refresh completion evidence"><RefreshCw size={11} className={state.loading ? "animate-spin" : ""} /></button>
        </header>

        {state.error ? <div className="mt-4 flex items-start gap-2 rounded-xl border border-[#B36B52]/20 bg-[#B36B52]/[0.05] px-4 py-3 text-[10px] text-[#8B4937]"><AlertTriangle size={12} className="mt-0.5" />{state.error}</div> : null}

        {state.record ? <>
          <section className="mt-5 grid gap-3 md:grid-cols-4">
            {[['Customer',state.record.customer_name || 'Customer'],['Site',state.record.customer_location_name || 'Site not named'],['Service',state.record.service_name || 'Service'],['Protocol',protocol ? `${protocol.name || 'Protocol'} · v${protocol.version || 1}` : 'Missing']].map(([label,value]) => <div key={label} className="rounded-2xl border border-black/[0.07] bg-white p-4"><div className="text-[8px] uppercase tracking-[0.09em] text-[#989188]">{label}</div><div className="mt-1 text-[11px] font-medium text-[#413C36]">{value}</div></div>)}
          </section>

          <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px] xl:items-start">
            <section className="space-y-3">
              <EvidenceCard icon={Camera} title="Before photos" detail="Use the phone camera or select existing images before treatment starts." required={Boolean(required.requirements.before_photos)}>
                <div className="mb-2 flex flex-wrap gap-2"><UploadControl label="Take before photo" accept={IMAGE_ACCEPT} capture="environment" busy={busy.startsWith("before-photo")} onFiles={(files) => uploadFiles(files, { kind: "before-photo", fieldKey: "before", append: (refs) => setBeforePhotos((current) => [...current, ...refs]) })} /><UploadControl label="Choose images" accept={IMAGE_ACCEPT} busy={busy.startsWith("before-photo")} onFiles={(files) => uploadFiles(files, { kind: "before-photo", fieldKey: "before", append: (refs) => setBeforePhotos((current) => [...current, ...refs]) })} /></div>
                <AssetList references={beforePhotos} previews={previews} />
              </EvidenceCard>

              <EvidenceCard icon={Camera} title="After photos" detail="Capture the treated area, corrected condition or final service state." required={Boolean(required.requirements.after_photos)}>
                <div className="mb-2 flex flex-wrap gap-2"><UploadControl label="Take after photo" accept={IMAGE_ACCEPT} capture="environment" busy={busy.startsWith("after-photo")} onFiles={(files) => uploadFiles(files, { kind: "after-photo", fieldKey: "after", append: (refs) => setAfterPhotos((current) => [...current, ...refs]) })} /><UploadControl label="Choose images" accept={IMAGE_ACCEPT} busy={busy.startsWith("after-photo")} onFiles={(files) => uploadFiles(files, { kind: "after-photo", fieldKey: "after", append: (refs) => setAfterPhotos((current) => [...current, ...refs]) })} /></div>
                <AssetList references={afterPhotos} previews={previews} />
              </EvidenceCard>

              <div className="grid gap-3 md:grid-cols-2">
                <EvidenceCard icon={PenLine} title="Customer acknowledgement" detail="Customer signs directly on the device; the signature is stored as private proof." required={Boolean(required.requirements.customer_signature)}>
                  <SignaturePad label="Customer signer" signer={customerSigner} setSigner={setCustomerSigner} reference={customerSignatureRef} preview={previews[customerSignatureRef]} busy={busy.startsWith("customer-signature")} onSave={(file) => saveSignature(file, "customer-signature", setCustomerSignatureRef)} />
                </EvidenceCard>
                <EvidenceCard icon={PenLine} title="Technician acknowledgement" detail="Accountable technician signs the same governed evidence package." required={Boolean(required.requirements.technician_signature)}>
                  <SignaturePad label="Technician signer" signer={technicianSigner} setSigner={setTechnicianSigner} reference={technicianSignatureRef} preview={previews[technicianSignatureRef]} busy={busy.startsWith("technician-signature")} onSave={(file) => saveSignature(file, "technician-signature", setTechnicianSignatureRef)} />
                </EvidenceCard>
              </div>

              <EvidenceCard icon={LocateFixed} title="Location confirmation" detail="Capture browser geolocation at the evidence point. Accuracy and capture time are retained." required={Boolean(required.requirements.location_confirmation)}>
                <div className="flex flex-wrap items-center gap-2"><button type="button" onClick={captureLocation} disabled={busy === "location"} className="inline-flex items-center gap-1.5 rounded-lg border border-black/[0.08] bg-white px-3 py-2 text-[9px] font-medium text-[#625D56]"><MapPin size={10} />{busy === "location" ? "Capturing…" : "Capture current location"}</button>{location ? <span className="text-[8px] text-[#65705D]">{Number(location.latitude).toFixed(6)}, {Number(location.longitude).toFixed(6)} · ±{Math.round(Number(location.accuracy_m || 0))}m</span> : <span className="text-[8px] text-[#99928A]">No location captured</span>}</div>
              </EvidenceCard>

              {required.external.map((field) => {
                const type = normalized(field.type);
                const references = fieldEvidence[field.key] || [];
                const kind = type === "photo" ? "protocol-evidence" : type === "signature" ? "protocol-evidence" : "file";
                return <EvidenceCard key={field.key} icon={FileCheck2} title={field.label || field.key} detail={field.help_text || "Required proof defined by this treatment protocol."} required>
                  <div className="mb-2 flex flex-wrap gap-2"><UploadControl label={type === "photo" ? "Capture proof" : "Attach proof"} accept={type === "photo" ? IMAGE_ACCEPT : FILE_ACCEPT} capture={type === "photo" ? "environment" : undefined} busy={busy === `${kind}:${field.key}`} onFiles={(files) => uploadFiles(files, { kind, fieldKey: field.key, append: (refs) => setFieldEvidence((current) => ({ ...current, [field.key]: [...(current[field.key] || []), ...refs] })) })} /></div>
                  <AssetList references={references} previews={previews} />
                </EvidenceCard>;
              })}

              <section className="rounded-2xl border border-black/[0.07] bg-white p-4"><div className="text-[10px] font-medium text-[#3F3A34]">Evidence note</div><div className="mt-0.5 text-[8px] text-[#928B82]">Only add information needed to understand or audit the proof package.</div><textarea value={notes} onChange={(event) => setNotes(event.target.value)} className="mt-3 min-h-20 w-full resize-y rounded-xl border border-black/[0.09] bg-white px-3 py-2.5 text-[10px]" /></section>
            </section>

            <aside className="xl:sticky xl:top-5">
              <section className="rounded-2xl border border-black/[0.07] bg-white p-4">
                <div className="flex items-center gap-1.5 text-[9px] font-medium uppercase tracking-[0.12em] text-[#8A867F]"><ShieldCheck size={10} /> Proof control</div>
                <div className="mt-3 space-y-2 text-[9px]">
                  <div className="flex items-center justify-between rounded-xl bg-[#FBFAF8] px-3 py-3"><span className="text-[#6F6961]">Protocol snapshot</span><span className={protocol ? "text-[#607057]" : "text-[#98513D]"}>{protocol ? "Bound" : "Missing"}</span></div>
                  <div className="flex items-center justify-between rounded-xl bg-[#FBFAF8] px-3 py-3"><span className="text-[#6F6961]">Required proof types</span><span className="text-[#4A4540]">{required.count}</span></div>
                  <div className="flex items-center justify-between rounded-xl bg-[#FBFAF8] px-3 py-3"><span className="text-[#6F6961]">Current package</span><span className={currentEvidence ? "text-[#607057]" : "text-[#98513D]"}>{currentEvidence ? normalized(currentEvidence.status) || "recorded" : "None"}</span></div>
                  <div className="flex items-center justify-between rounded-xl bg-[#FBFAF8] px-3 py-3"><span className="text-[#6F6961]">Evidence revisions</span><span className="text-[#4A4540]">{history.length}</span></div>
                </div>
                {evidenceId ? <div className="mt-3 rounded-xl border border-[#748267]/18 bg-[#748267]/[0.05] p-3 text-[8px] leading-4 text-[#607057]"><div className="flex items-center gap-1.5 font-medium"><CheckCircle2 size={10} /> Authoritative Evidence ID</div><div className="mt-1 break-all font-mono text-[7px]">{evidenceId}</div></div> : null}
                {notice ? <div className={`mt-3 rounded-xl border p-3 text-[8px] leading-4 ${notice.toLowerCase().includes("missing") || notice.toLowerCase().includes("could not") || notice.toLowerCase().includes("unsupported") ? "border-[#B36B52]/20 bg-[#B36B52]/[0.05] text-[#8B4937]" : "border-[#748267]/18 bg-[#748267]/[0.05] text-[#607057]"}`}>{notice}</div> : null}
                <button type="button" onClick={saveEvidence} disabled={!protocol || Boolean(busy)} className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-[#2C2925] px-4 py-3.5 text-[10px] font-medium text-white disabled:opacity-35"><FileCheck2 size={12} />{busy === "save" ? "Recording…" : currentEvidence ? "Record new evidence revision" : "Record completion evidence"}</button>
                <Link href={technicianHref} className="mt-2 flex w-full items-center justify-center rounded-xl border border-black/[0.08] bg-white px-4 py-3 text-[9px] font-medium text-[#625D56]">Return to technician completion</Link>
                <div className="mt-3 text-[7px] leading-3 text-[#9A938A]">Photos and signatures are private Storage objects. Evidence records remain immutable; a new revision supersedes the previous active package instead of overwriting it.</div>
              </section>
            </aside>
          </div>
        </> : null}
      </div>
    </main>
  );
}
