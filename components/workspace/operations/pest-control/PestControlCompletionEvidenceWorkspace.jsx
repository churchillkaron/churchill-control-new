"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  Camera,
  CheckCircle2,
  FileCheck2,
  LocateFixed,
  MapPin,
  PenLine,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";

const EXTERNAL_TYPES = new Set(["photo", "signature", "file"]);

function text(value) {
  return String(value ?? "").trim();
}

function normalized(value) {
  return text(value).toLowerCase().replace(/[\s-]+/g, "_");
}

function splitReferences(value) {
  return String(value || "")
    .split("\n")
    .map((row) => row.trim())
    .filter(Boolean);
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

export default function PestControlCompletionEvidenceWorkspace({ organizationId, occurrenceId }) {
  const [state, setState] = useState({ loading: true, error: "", record: null });
  const [beforePhotos, setBeforePhotos] = useState("");
  const [afterPhotos, setAfterPhotos] = useState("");
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

  const load = useCallback(async () => {
    if (!organizationId || !occurrenceId) return;
    setState((current) => ({ ...current, loading: true, error: "" }));
    try {
      const response = await fetch(`/api/service-management/evidence?organizationId=${encodeURIComponent(organizationId)}&occurrenceId=${encodeURIComponent(occurrenceId)}`, {
        cache: "no-store",
        credentials: "include",
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok || !json.success) throw new Error(json.error || "Completion evidence could not be loaded.");
      setState({ loading: false, error: "", record: json });
      const current = json.current_evidence?.attributes?.service_completion_evidence || null;
      if (current) {
        const proofs = current.proofs || {};
        setEvidenceId(json.current_evidence.id || "");
        setBeforePhotos((proofs.before_photos || []).join("\n"));
        setAfterPhotos((proofs.after_photos || []).join("\n"));
        setCustomerSigner(proofs.customer_signature?.signer_name || "");
        setCustomerSignatureRef(proofs.customer_signature?.reference || "");
        setTechnicianSigner(proofs.technician_signature?.signer_name || "");
        setTechnicianSignatureRef(proofs.technician_signature?.reference || "");
        setFieldEvidence(Object.fromEntries(Object.entries(proofs.field_evidence || {}).map(([key, values]) => [key, (values || []).join("\n")])));
        setLocation(proofs.location_confirmation?.latitude !== null && proofs.location_confirmation?.latitude !== undefined ? proofs.location_confirmation : null);
        setNotes(proofs.notes || "");
      }
    } catch (error) {
      setState((current) => ({ ...current, loading: false, error: error?.message || "Completion evidence could not be loaded." }));
    }
  }, [occurrenceId, organizationId]);

  useEffect(() => { load(); }, [load]);

  const protocol = state.record?.protocol || null;
  const required = useMemo(() => requiredEvidence(protocol || {}), [protocol]);
  const currentEvidence = state.record?.current_evidence || null;
  const history = Array.isArray(state.record?.evidence_history) ? state.record.evidence_history : [];
  const technicianHref = `/workspace/${encodeURIComponent(organizationId)}/operations/field-service/technician`;

  function captureLocation() {
    setNotice("");
    if (!navigator.geolocation) {
      setNotice("This browser does not provide geolocation.");
      return;
    }
    setBusy("location");
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocation({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy_m: position.coords.accuracy,
          captured_at: new Date().toISOString(),
        });
        setBusy("");
      },
      (error) => {
        setNotice(error?.message || "Location could not be captured.");
        setBusy("");
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
    );
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
            before_photos: splitReferences(beforePhotos),
            after_photos: splitReferences(afterPhotos),
            customer_signature: {
              signer_name: text(customerSigner) || null,
              reference: text(customerSignatureRef) || null,
              attested_at: customerSigner && customerSignatureRef ? new Date().toISOString() : null,
            },
            technician_signature: {
              signer_name: text(technicianSigner) || null,
              reference: text(technicianSignatureRef) || null,
              attested_at: technicianSigner && technicianSignatureRef ? new Date().toISOString() : null,
            },
            location_confirmation: location,
          },
          fieldEvidence: Object.fromEntries(Object.entries(fieldEvidence).map(([key, value]) => [key, splitReferences(value)])),
          notes,
        }),
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok || !json.success) throw new Error(json.error || "Completion evidence could not be recorded.");
      setEvidenceId(json.evidence_id || "");
      setNotice(`Evidence package recorded. ID: ${json.evidence_id}`);
      await load();
    } catch (error) {
      setNotice(error?.message || "Completion evidence could not be recorded.");
    } finally {
      setBusy("");
    }
  }

  if (!occurrenceId) {
    return <main className="min-h-[420px] bg-[#F7F6F3] p-8 text-sm text-[#77736C]">Open Completion Evidence from a specific technician visit.</main>;
  }

  return (
    <main className="min-h-[calc(100vh-61px)] bg-[#F7F6F3] px-4 py-5 text-[#191919] md:px-7 lg:px-9 lg:py-7">
      <div className="mx-auto max-w-[1500px]">
        <header className="flex flex-wrap items-end justify-between gap-4 border-b border-black/[0.07] pb-5">
          <div>
            <Link href={technicianHref} className="inline-flex items-center gap-1.5 text-[9px] text-[#8D867E] hover:text-[#79593A]"><ArrowLeft size={10} /> Technician execution</Link>
            <div className="mt-3 text-[10px] font-medium uppercase tracking-[0.18em] text-[#9A744B]">Governed service proof</div>
            <h1 className="mt-1 text-[27px] font-medium tracking-[-0.04em] text-[#201E1B]">Completion evidence</h1>
            <p className="mt-1 max-w-3xl text-[11px] leading-5 text-[#777169]">Capture the proof required by the exact snapshotted treatment protocol. Completion stays locked until this package is complete.</p>
          </div>
          <button type="button" onClick={load} className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-black/[0.08] bg-white text-[#806143]" aria-label="Refresh completion evidence"><RefreshCw size={11} className={state.loading ? "animate-spin" : ""} /></button>
        </header>

        {state.error ? <div className="mt-4 flex items-start gap-2 rounded-xl border border-[#B36B52]/20 bg-[#B36B52]/[0.05] px-4 py-3 text-[10px] text-[#8B4937]"><AlertTriangle size={12} className="mt-0.5" />{state.error}</div> : null}

        {state.record ? (
          <>
            <section className="mt-5 grid gap-3 md:grid-cols-4">
              <div className="rounded-2xl border border-black/[0.07] bg-white p-4"><div className="text-[8px] uppercase tracking-[0.09em] text-[#989188]">Customer</div><div className="mt-1 text-[11px] font-medium text-[#413C36]">{state.record.customer_name || "Customer"}</div></div>
              <div className="rounded-2xl border border-black/[0.07] bg-white p-4"><div className="text-[8px] uppercase tracking-[0.09em] text-[#989188]">Site</div><div className="mt-1 text-[11px] font-medium text-[#413C36]">{state.record.customer_location_name || "Site not named"}</div></div>
              <div className="rounded-2xl border border-black/[0.07] bg-white p-4"><div className="text-[8px] uppercase tracking-[0.09em] text-[#989188]">Service</div><div className="mt-1 text-[11px] font-medium text-[#413C36]">{state.record.service_name || "Service"}</div></div>
              <div className="rounded-2xl border border-black/[0.07] bg-white p-4"><div className="text-[8px] uppercase tracking-[0.09em] text-[#989188]">Protocol</div><div className="mt-1 text-[11px] font-medium text-[#413C36]">{protocol ? `${protocol.name || "Protocol"} · v${protocol.version || 1}` : "Missing"}</div></div>
            </section>

            <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px] xl:items-start">
              <section className="space-y-3">
                <EvidenceCard icon={Camera} title="Before photos" detail="References to photos captured before treatment starts." required={Boolean(required.requirements.before_photos)}>
                  <textarea value={beforePhotos} onChange={(event) => setBeforePhotos(event.target.value)} placeholder="One governed media reference per line" className="min-h-20 w-full resize-y rounded-xl border border-black/[0.09] bg-white px-3 py-2.5 text-[10px] outline-none focus:border-[#D6A66A]/60" />
                </EvidenceCard>

                <EvidenceCard icon={Camera} title="After photos" detail="References to photos proving the completed treatment or corrected condition." required={Boolean(required.requirements.after_photos)}>
                  <textarea value={afterPhotos} onChange={(event) => setAfterPhotos(event.target.value)} placeholder="One governed media reference per line" className="min-h-20 w-full resize-y rounded-xl border border-black/[0.09] bg-white px-3 py-2.5 text-[10px] outline-none focus:border-[#D6A66A]/60" />
                </EvidenceCard>

                <div className="grid gap-3 md:grid-cols-2">
                  <EvidenceCard icon={PenLine} title="Customer acknowledgement" detail="Store the signer identity and reference to the governed signature artifact." required={Boolean(required.requirements.customer_signature)}>
                    <div className="space-y-2"><input value={customerSigner} onChange={(event) => setCustomerSigner(event.target.value)} placeholder="Customer signer name" className="w-full rounded-xl border border-black/[0.09] bg-white px-3 py-2.5 text-[10px]" /><input value={customerSignatureRef} onChange={(event) => setCustomerSignatureRef(event.target.value)} placeholder="Signature artifact reference" className="w-full rounded-xl border border-black/[0.09] bg-white px-3 py-2.5 text-[10px]" /></div>
                  </EvidenceCard>
                  <EvidenceCard icon={PenLine} title="Technician acknowledgement" detail="Store the accountable technician signer and signature artifact reference." required={Boolean(required.requirements.technician_signature)}>
                    <div className="space-y-2"><input value={technicianSigner} onChange={(event) => setTechnicianSigner(event.target.value)} placeholder="Technician signer name" className="w-full rounded-xl border border-black/[0.09] bg-white px-3 py-2.5 text-[10px]" /><input value={technicianSignatureRef} onChange={(event) => setTechnicianSignatureRef(event.target.value)} placeholder="Signature artifact reference" className="w-full rounded-xl border border-black/[0.09] bg-white px-3 py-2.5 text-[10px]" /></div>
                  </EvidenceCard>
                </div>

                <EvidenceCard icon={LocateFixed} title="Location confirmation" detail="Capture browser geolocation at the evidence point. Accuracy is retained with the coordinates." required={Boolean(required.requirements.location_confirmation)}>
                  <div className="flex flex-wrap items-center gap-2"><button type="button" onClick={captureLocation} disabled={busy === "location"} className="inline-flex items-center gap-1.5 rounded-lg border border-black/[0.08] bg-white px-3 py-2 text-[9px] font-medium text-[#625D56]"><MapPin size={10} />{busy === "location" ? "Capturing…" : "Capture current location"}</button>{location ? <span className="text-[8px] text-[#65705D]">{Number(location.latitude).toFixed(6)}, {Number(location.longitude).toFixed(6)} · ±{Math.round(Number(location.accuracy_m || 0))}m</span> : <span className="text-[8px] text-[#99928A]">No location captured</span>}</div>
                </EvidenceCard>

                {required.external.map((field) => (
                  <EvidenceCard key={field.key} icon={FileCheck2} title={field.label || field.key} detail={field.help_text || "Required external proof defined by this treatment protocol."} required>
                    <textarea value={fieldEvidence[field.key] || ""} onChange={(event) => setFieldEvidence((current) => ({ ...current, [field.key]: event.target.value }))} placeholder="One governed evidence reference per line" className="min-h-20 w-full resize-y rounded-xl border border-black/[0.09] bg-white px-3 py-2.5 text-[10px] outline-none focus:border-[#D6A66A]/60" />
                  </EvidenceCard>
                ))}

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
                  {notice ? <div className={`mt-3 rounded-xl border p-3 text-[8px] leading-4 ${notice.toLowerCase().includes("missing") || notice.toLowerCase().includes("could not") || notice.toLowerCase().includes("does not") ? "border-[#B36B52]/20 bg-[#B36B52]/[0.05] text-[#8B4937]" : "border-[#748267]/18 bg-[#748267]/[0.05] text-[#607057]"}`}>{notice}</div> : null}

                  <button type="button" onClick={saveEvidence} disabled={!protocol || busy === "save"} className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-[#2C2925] px-4 py-3.5 text-[10px] font-medium text-white disabled:opacity-35"><FileCheck2 size={12} />{busy === "save" ? "Recording…" : currentEvidence ? "Record new evidence revision" : "Record completion evidence"}</button>
                  <Link href={technicianHref} className="mt-2 flex w-full items-center justify-center rounded-xl border border-black/[0.08] bg-white px-4 py-3 text-[9px] font-medium text-[#625D56]">Return to technician completion</Link>
                  <div className="mt-3 text-[7px] leading-3 text-[#9A938A]">New evidence never overwrites the old package. Avantiqo records a new immutable evidence record and supersedes the prior active revision.</div>
                </section>
              </aside>
            </div>
          </>
        ) : null}
      </div>
    </main>
  );
}
