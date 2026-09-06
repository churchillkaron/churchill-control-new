"use client";

export const dynamic = "force-dynamic";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import {
  ArrowLeft,
  BadgeCheck,
  CalendarClock,
  CheckCircle2,
  FileCheck2,
  Plus,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  UserRoundCheck,
  XCircle,
} from "lucide-react";
import { useOrganizationRuntime } from "@/lib/hooks/useOrganizationRuntime";

function text(value) { return String(value ?? "").trim(); }
function dateLabel(value) {
  if (!value) return "No expiry";
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(date);
}
function activeHolding(row) {
  if (row?.status !== "active") return false;
  const today = new Date().toISOString().slice(0, 10);
  if (row.valid_from && row.valid_from > today) return false;
  if (row.valid_until && row.valid_until < today) return false;
  return true;
}

export default function PeopleQualificationsPage() {
  const params = useParams();
  const { organization, loading: organizationLoading } = useOrganizationRuntime();
  const organizationId = params?.organizationId || organization?.id || "";
  const [catalog, setCatalog] = useState([]);
  const [staff, setStaff] = useState([]);
  const [holdings, setHoldings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [qualificationForm, setQualificationForm] = useState({ name: "", description: "" });
  const [grantForm, setGrantForm] = useState({ staffId: "", qualificationId: "", validFrom: "", validUntil: "", evidenceReference: "" });

  const inputClass = "mt-2 w-full rounded-xl border border-black/[0.09] bg-white px-3.5 py-3 text-[11px] text-[#2B2926] outline-none transition focus:border-[#D6A66A]/65";

  const load = useCallback(async () => {
    if (!organizationId) return;
    setLoading(true); setError("");
    try {
      const response = await fetch(`/api/people/workforce/qualifications?organizationId=${encodeURIComponent(organizationId)}&status=all`, { cache: "no-store" });
      const json = await response.json().catch(() => ({}));
      if (!response.ok || !json.success) throw new Error(json.error || "Qualifications could not be loaded.");
      setCatalog(json.catalog || []);
      setStaff(json.staff || []);
      setHoldings(json.holdings || []);
    } catch (loadError) {
      setError(loadError.message || "Qualifications could not be loaded.");
    } finally { setLoading(false); }
  }, [organizationId]);

  useEffect(() => { load(); }, [load]);

  const activeCatalog = useMemo(() => catalog.filter((row) => row.status === "active"), [catalog]);
  const currentHoldings = useMemo(() => holdings.filter(activeHolding), [holdings]);
  const qualifiedStaff = useMemo(() => new Set(currentHoldings.map((row) => row.staff_id)).size, [currentHoldings]);
  const expiringSoon = useMemo(() => {
    const today = new Date();
    const threshold = new Date(today.getTime() + 45 * 86400000).toISOString().slice(0, 10);
    const todayKey = today.toISOString().slice(0, 10);
    return currentHoldings.filter((row) => row.valid_until && row.valid_until >= todayKey && row.valid_until <= threshold);
  }, [currentHoldings]);

  async function post(body) {
    const response = await fetch("/api/people/workforce/qualifications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ organizationId, ...body }),
    });
    const json = await response.json().catch(() => ({}));
    if (!response.ok || !json.success) throw new Error(json.error || "Qualification change failed.");
    return json;
  }

  async function createQualification(event) {
    event.preventDefault();
    if (!text(qualificationForm.name)) { setError("Qualification name is required."); return; }
    setSaving(true); setError(""); setNotice("");
    try {
      const json = await post({ action: "create-qualification", name: text(qualificationForm.name), description: text(qualificationForm.description) || null });
      setQualificationForm({ name: "", description: "" });
      setNotice(`${json.qualification?.name || "Qualification"} is now available to service protocols.`);
      await load();
    } catch (saveError) { setError(saveError.message || "Qualification could not be created."); }
    finally { setSaving(false); }
  }

  async function grantQualification(event) {
    event.preventDefault();
    if (!grantForm.staffId || !grantForm.qualificationId || !text(grantForm.evidenceReference)) {
      setError("Choose the person and qualification, then record the evidence reference.");
      return;
    }
    setSaving(true); setError(""); setNotice("");
    try {
      await post({
        action: "grant",
        staffId: grantForm.staffId,
        qualificationId: grantForm.qualificationId,
        validFrom: grantForm.validFrom || null,
        validUntil: grantForm.validUntil || null,
        evidenceReference: text(grantForm.evidenceReference),
      });
      setGrantForm({ staffId: "", qualificationId: "", validFrom: "", validUntil: "", evidenceReference: "" });
      setNotice("Qualification evidence verified and attached to the staff member.");
      await load();
    } catch (saveError) { setError(saveError.message || "Qualification could not be assigned."); }
    finally { setSaving(false); }
  }

  async function revoke(row) {
    setSaving(true); setError(""); setNotice("");
    try {
      await post({ action: "revoke", holdingId: row.id });
      setNotice(`${row.qualification_name || "Qualification"} revoked for ${row.staff_name || "staff"}.`);
      await load();
    } catch (saveError) { setError(saveError.message || "Qualification could not be revoked."); }
    finally { setSaving(false); }
  }

  async function setQualificationStatus(row, status) {
    setSaving(true); setError(""); setNotice("");
    try {
      await post({ action: "set-qualification-status", qualificationId: row.id, status });
      setNotice(`${row.name} is now ${status}.`);
      await load();
    } catch (saveError) { setError(saveError.message || "Qualification status could not be changed."); }
    finally { setSaving(false); }
  }

  if (organizationLoading) return <div className="min-h-[420px] bg-[#F7F6F3] p-8 text-sm text-[#77736C]">Preparing People qualifications…</div>;

  return (
    <main className="min-h-[calc(100vh-61px)] bg-[#F7F6F3] px-4 py-5 text-[#201E1B] md:px-7 lg:px-9 lg:py-7">
      <div className="mx-auto max-w-[1580px]">
        <header className="flex flex-wrap items-end justify-between gap-4 border-b border-black/[0.07] pb-5">
          <div>
            <Link href={`/workspace/${encodeURIComponent(organizationId)}/people`} className="inline-flex items-center gap-1.5 text-[9px] text-[#8D867E]"><ArrowLeft size={10} /> People</Link>
            <div className="mt-3 text-[9px] font-medium uppercase tracking-[0.16em] text-[#9A744B]">People · Qualification authority</div>
            <h1 className="mt-1 text-[28px] font-medium tracking-[-0.04em]">Qualifications & service eligibility</h1>
            <p className="mt-1 max-w-3xl text-[11px] leading-5 text-[#777169]">Define the qualifications your business recognizes, verify who currently holds them, and let Operations consume that truth without duplicating it.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href={`/workspace/${encodeURIComponent(organizationId)}/operations/field-service/execution-templates`} className="rounded-xl border border-[#D6A66A]/30 bg-[#D6A66A]/[0.07] px-3.5 py-2.5 text-[9px] text-[#725434]">Treatment protocols</Link>
            <button type="button" onClick={load} className="inline-flex items-center gap-1.5 rounded-xl border border-black/[0.08] bg-white px-3.5 py-2.5 text-[9px]"><RefreshCw size={10} className={loading ? "animate-spin" : ""} />Refresh</button>
          </div>
        </header>

        {error ? <div className="mt-4 flex items-start gap-2 rounded-xl border border-[#B36B52]/20 bg-[#B36B52]/[0.05] px-4 py-3 text-[10px] text-[#8B4937]"><ShieldAlert size={12} className="mt-0.5 shrink-0" />{error}</div> : null}
        {notice ? <div className="mt-4 flex items-start gap-2 rounded-xl border border-[#748267]/18 bg-[#748267]/[0.05] px-4 py-3 text-[10px] text-[#607057]"><CheckCircle2 size={12} className="mt-0.5 shrink-0" />{notice}</div> : null}

        <section className="mt-5 grid gap-3 sm:grid-cols-3">
          {[
            ["Active qualifications", activeCatalog.length, "Available to service protocols", ShieldCheck],
            ["Qualified staff", qualifiedStaff, "People with current verified evidence", UserRoundCheck],
            ["Expiring in 45 days", expiringSoon.length, "Review before dispatch is blocked", CalendarClock],
          ].map(([label, value, detail, Icon]) => <div key={label} className="rounded-2xl border border-black/[0.07] bg-white p-4"><div className="flex items-center justify-between"><div className="text-[8px] uppercase tracking-[0.1em] text-[#948D84]">{label}</div><Icon size={13} className="text-[#A37849]" /></div><div className="mt-2 text-[24px] font-medium">{loading ? "…" : value}</div><div className="mt-1 text-[8px] text-[#9B948C]">{detail}</div></div>)}
        </section>

        <div className="mt-5 grid gap-5 xl:grid-cols-[430px_minmax(0,1fr)]">
          <div className="space-y-5">
            <form onSubmit={createQualification} className="rounded-2xl border border-black/[0.075] bg-white p-5">
              <div className="flex items-center gap-2 text-[12px] font-medium"><Plus size={13} />Define qualification</div>
              <p className="mt-1 text-[9px] leading-4 text-[#8A837A]">Examples: licensed pesticide applicator, fumigation authorization, termite treatment certification.</p>
              <label className="mt-4 block text-[9px] font-medium text-[#4E4943]">Qualification name<input value={qualificationForm.name} onChange={(event) => setQualificationForm((current) => ({ ...current, name: event.target.value }))} className={inputClass} placeholder="Licensed pesticide applicator" /></label>
              <label className="mt-3 block text-[9px] font-medium text-[#4E4943]">What does it authorize?<textarea value={qualificationForm.description} onChange={(event) => setQualificationForm((current) => ({ ...current, description: event.target.value }))} className={`${inputClass} min-h-20 resize-y`} placeholder="Required for technicians applying regulated treatment products…" /></label>
              <button disabled={saving} className="mt-4 w-full rounded-xl bg-[#2E2A25] px-4 py-3 text-[9px] font-medium text-white disabled:opacity-40">Create qualification</button>
            </form>

            <form onSubmit={grantQualification} className="rounded-2xl border border-black/[0.075] bg-white p-5">
              <div className="flex items-center gap-2 text-[12px] font-medium"><BadgeCheck size={13} />Verify staff qualification</div>
              <p className="mt-1 text-[9px] leading-4 text-[#8A837A]">A qualification becomes dispatch authority only after evidence is recorded here.</p>
              <label className="mt-4 block text-[9px] font-medium text-[#4E4943]">Staff member<select value={grantForm.staffId} onChange={(event) => setGrantForm((current) => ({ ...current, staffId: event.target.value }))} className={inputClass}><option value="">Choose staff member</option>{staff.map((row) => <option key={row.id} value={row.id}>{[row.name || row.email, row.position || row.role, row.department].filter(Boolean).join(" · ")}</option>)}</select></label>
              <label className="mt-3 block text-[9px] font-medium text-[#4E4943]">Qualification<select value={grantForm.qualificationId} onChange={(event) => setGrantForm((current) => ({ ...current, qualificationId: event.target.value }))} className={inputClass}><option value="">Choose qualification</option>{activeCatalog.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}</select></label>
              <div className="mt-3 grid gap-3 sm:grid-cols-2"><label className="block text-[9px] font-medium text-[#4E4943]">Valid from<input type="date" value={grantForm.validFrom} onChange={(event) => setGrantForm((current) => ({ ...current, validFrom: event.target.value }))} className={inputClass} /></label><label className="block text-[9px] font-medium text-[#4E4943]">Valid until<input type="date" value={grantForm.validUntil} onChange={(event) => setGrantForm((current) => ({ ...current, validUntil: event.target.value }))} className={inputClass} /></label></div>
              <label className="mt-3 block text-[9px] font-medium text-[#4E4943]">Evidence reference *<input value={grantForm.evidenceReference} onChange={(event) => setGrantForm((current) => ({ ...current, evidenceReference: event.target.value }))} className={inputClass} placeholder="Certificate no., document ID or verified record" /></label>
              <button disabled={saving || !activeCatalog.length || !staff.length} className="mt-4 w-full rounded-xl bg-[#2E2A25] px-4 py-3 text-[9px] font-medium text-white disabled:opacity-40">Verify qualification</button>
            </form>
          </div>

          <section className="overflow-hidden rounded-2xl border border-black/[0.075] bg-white">
            <div className="border-b border-black/[0.06] px-5 py-4"><div className="text-[9px] uppercase tracking-[0.13em] text-[#9A744B]">Qualification register</div><h2 className="mt-1 text-[18px] font-medium">Who is allowed to do what?</h2></div>
            <div className="divide-y divide-black/[0.06]">
              {!loading && !catalog.length ? <div className="p-8 text-center text-[10px] text-[#8A837A]"><FileCheck2 className="mx-auto mb-2" size={18} />No qualifications defined yet. Create the first one only when a service genuinely requires it.</div> : null}
              {catalog.map((qualification) => {
                const qualificationHoldings = holdings.filter((row) => row.qualification_id === qualification.id);
                const current = qualificationHoldings.filter(activeHolding);
                return <div key={qualification.id} className="p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3"><div><div className="flex items-center gap-2"><div className="text-[12px] font-medium">{qualification.name}</div><span className={`rounded-full border px-2 py-1 text-[7px] uppercase tracking-[0.08em] ${qualification.status === "active" ? "border-[#748267]/20 bg-[#748267]/[0.06] text-[#607057]" : "border-black/[0.08] bg-black/[0.025] text-[#777169]"}`}>{qualification.status}</span></div><div className="mt-1 text-[8px] text-[#9A938A]">{qualification.code}</div>{qualification.description ? <div className="mt-2 max-w-2xl text-[9px] leading-4 text-[#736D66]">{qualification.description}</div> : null}</div><button disabled={saving} onClick={() => setQualificationStatus(qualification, qualification.status === "active" ? "inactive" : "active")} className="rounded-lg border border-black/[0.08] bg-[#FBFAF8] px-3 py-2 text-[8px] text-[#6F685F]">{qualification.status === "active" ? "Deactivate" : "Reactivate"}</button></div>
                  <div className="mt-4 grid gap-2 md:grid-cols-2">{current.map((row) => <div key={row.id} className="rounded-xl border border-black/[0.07] bg-[#FBFAF8] p-3"><div className="flex items-start justify-between gap-2"><div><div className="text-[10px] font-medium">{row.staff_name}</div><div className="mt-0.5 text-[8px] text-[#8D867E]">{row.staff_role || "Staff"}</div></div><button disabled={saving} onClick={() => revoke(row)} className="rounded-lg border border-[#B36B52]/15 bg-white p-1.5 text-[#98513D]" aria-label={`Revoke ${qualification.name} for ${row.staff_name}`}><XCircle size={11} /></button></div><div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[8px] text-[#8A837A]"><span>{dateLabel(row.valid_until)}</span><span>{row.evidence_reference}</span></div></div>)}{!current.length ? <div className="rounded-xl border border-dashed border-black/[0.09] p-3 text-[9px] text-[#969087]">No staff currently hold this qualification.</div> : null}</div>
                </div>;
              })}
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
