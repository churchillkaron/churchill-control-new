"use client";

import { useEffect, useMemo, useState } from "react";
import { Camera, CheckCircle2, Clock3, MapPin, Navigation, Play, RefreshCw, ShieldCheck } from "lucide-react";

function status(value) {
  return String(value || "").trim().toLowerCase();
}

function dateTime(value) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString();
}

function currentLocation() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("Location is not available on this device."));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => resolve({
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        accuracy: position.coords.accuracy,
        capturedAt: new Date(position.timestamp || Date.now()).toISOString(),
      }),
      () => reject(new Error("Location permission is required for assigned work actions.")),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 30000 },
    );
  });
}

function emptyCompletion() {
  return {
    fields: {},
    outcome: "completed",
    follow_up_notes: "",
    evidence: {
      before_photos: [],
      after_photos: [],
      customer_signature: "",
      technician_signature: "",
    },
  };
}

export default function StaffMyDayPage() {
  const [state, setState] = useState({ loading: true, working: "", uploading: "", data: null, error: "", message: "" });
  const [completionByJob, setCompletionByJob] = useState({});

  async function load() {
    setState((current) => ({ ...current, loading: true, error: "" }));
    try {
      const response = await fetch("/api/staff/my-day", { cache: "no-store" });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.success) throw new Error(payload.error || "Unable to load assigned work");
      setState((current) => ({ ...current, loading: false, data: payload, error: "" }));
      setCompletionByJob((current) => {
        const next = { ...current };
        for (const job of payload.jobs || []) {
          if (!next[job.id]) next[job.id] = job.completionSubmission || emptyCompletion();
        }
        return next;
      });
    } catch (error) {
      setState((current) => ({ ...current, loading: false, error: error?.message || "Unable to load assigned work" }));
    }
  }

  useEffect(() => { load(); }, []);

  const summary = state.data?.summary || { total: 0, completed: 0, inProgress: 0, remaining: 0 };
  const jobs = state.data?.jobs || [];
  const nextJobId = state.data?.next?.id || null;

  async function act(job, action) {
    const key = `${job.id}:${action}`;
    setState((current) => ({ ...current, working: key, error: "", message: "" }));
    try {
      const location = await currentLocation();
      const response = await fetch("/api/staff/my-day", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workOrderId: job.id,
          action,
          location,
          completion: action === "complete" ? (completionByJob[job.id] || emptyCompletion()) : null,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.success) throw new Error(payload.error || `Unable to ${action} assigned work`);
      setState((current) => ({ ...current, working: "", message: action === "complete" ? "Assigned work completed with evidence." : "Assigned work started." }));
      await load();
    } catch (error) {
      setState((current) => ({ ...current, working: "", error: error?.message || `Unable to ${action} assigned work` }));
    }
  }

  function patchCompletion(jobId, patch) {
    setCompletionByJob((current) => ({
      ...current,
      [jobId]: { ...(current[jobId] || emptyCompletion()), ...patch },
    }));
  }

  function patchField(jobId, key, value) {
    setCompletionByJob((current) => {
      const existing = current[jobId] || emptyCompletion();
      return { ...current, [jobId]: { ...existing, fields: { ...(existing.fields || {}), [key]: value } } };
    });
  }

  function patchEvidence(jobId, key, value) {
    setCompletionByJob((current) => {
      const existing = current[jobId] || emptyCompletion();
      return { ...current, [jobId]: { ...existing, evidence: { ...(existing.evidence || {}), [key]: value } } };
    });
  }

  async function uploadEvidence(job, key, file) {
    if (!file) return;
    const busyKey = `${job.id}:${key}`;
    setState((current) => ({ ...current, uploading: busyKey, error: "" }));
    try {
      const body = new FormData();
      body.append("workOrderId", job.id);
      body.append("evidenceType", key);
      body.append("file", file);
      const response = await fetch("/api/staff/my-day/evidence", { method: "POST", body });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.success) throw new Error(payload.error || "Evidence upload failed");
      const existing = completionByJob[job.id]?.evidence?.[key] || [];
      patchEvidence(job.id, key, [...existing, payload.evidence]);
      setState((current) => ({ ...current, uploading: "", message: "Evidence uploaded." }));
    } catch (error) {
      setState((current) => ({ ...current, uploading: "", error: error?.message || "Evidence upload failed" }));
    }
  }

  return (
    <main className="min-h-screen bg-[#F7F6F3] p-5 text-[#1B1A18] lg:p-10">
      <div className="mx-auto max-w-7xl space-y-6">
        <section className="rounded-[32px] border border-black/[0.075] bg-white p-6">
          <div className="flex flex-wrap items-start justify-between gap-5">
            <div>
              <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.2em] text-[#D6A66A]"><Navigation className="h-4 w-4" /> Personal execution queue</div>
              <h1 className="mt-3 text-3xl font-black">My Day</h1>
              <p className="mt-2 max-w-3xl text-sm text-[#8A847C]">Only work assigned to you for the active organization and business day appears here. Start and completion actions are GPS-bound and completion protocols are enforced server-side.</p>
            </div>
            <button onClick={load} disabled={state.loading} className="flex h-11 items-center gap-2 rounded-xl border border-black/[0.08] px-4 text-xs font-black uppercase tracking-[0.14em] text-[#67615A] disabled:opacity-40"><RefreshCw className="h-4 w-4" /> Refresh</button>
          </div>
          <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-4">
            <Metric label="Assigned" value={summary.total} />
            <Metric label="In progress" value={summary.inProgress} />
            <Metric label="Completed" value={summary.completed} />
            <Metric label="Remaining" value={summary.remaining} />
          </div>
          <div className={`mt-4 rounded-2xl border p-3 text-xs ${state.data?.shiftActive ? "border-emerald-400/20 bg-emerald-400/[0.06] text-emerald-100" : "border-amber-300/20 bg-amber-300/[0.06] text-amber-100"}`}>
            {state.data?.shiftActive ? "Shift is active — assigned-work actions are enabled." : "Start your shift before starting or completing assigned work."}
          </div>
        </section>

        {state.error ? <div className="rounded-2xl border border-red-400/20 bg-red-400/10 p-4 text-sm text-[#984C43]">{state.error}</div> : null}
        {state.message ? <div className="rounded-2xl border border-emerald-400/20 bg-emerald-400/10 p-4 text-sm text-[#5E6D58]">{state.message}</div> : null}

        {state.loading ? (
          <section className="rounded-[28px] border border-black/[0.075] bg-white p-8 text-sm text-[#948E86]">Loading today’s assigned work…</section>
        ) : jobs.length ? (
          <section className="space-y-4">
            {jobs.map((job) => {
              const protocol = job.executionProtocol || null;
              const completion = completionByJob[job.id] || emptyCompletion();
              const jobStatus = status(job.status);
              const completed = jobStatus === "completed";
              const inProgress = jobStatus === "in_progress";
              const evidence = protocol?.evidence_requirements || {};
              return (
                <article key={job.id} className={`rounded-[26px] border p-4 sm:rounded-[30px] sm:p-5 lg:p-6 ${job.id === nextJobId ? "border-[#D6A66A]/30 bg-[#D6A66A]/[0.045]" : "border-black/[0.075] bg-white"}`}>
                  <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        {job.id === nextJobId ? <span className="rounded-full bg-[#D6A66A] px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.12em] text-black">Next</span> : null}
                        <span className="rounded-full border border-black/[0.08] px-2.5 py-1 text-[9px] uppercase tracking-[0.12em] text-[#948E86]">{job.status}</span>
                        <span className="rounded-full border border-black/[0.08] px-2.5 py-1 text-[9px] uppercase tracking-[0.12em] text-[#948E86]">{job.priority || "normal"}</span>
                      </div>
                      <h2 className="mt-3 text-xl font-black tracking-[-0.02em] sm:text-2xl">{job.serviceName}</h2>
                      <div className="mt-1 text-sm text-[#79736B]">{job.customerName}</div>
                      {job.description ? <p className="mt-3 max-w-3xl text-sm leading-6 text-[#8A847C]">{job.description}</p> : null}
                    </div>
                    <div className="grid w-full gap-2 text-xs sm:grid-cols-2 lg:w-auto lg:min-w-64 lg:grid-cols-1">
                      <Info icon={Clock3} label="Scheduled" value={job.scheduledStart ? dateTime(job.scheduledStart) : "Not scheduled"} />
                      <Info icon={MapPin} label="Location" value={job.destination || job.locationName || "No destination recorded"} />
                    </div>
                  </div>

                  {protocol && !completed ? (
                    <div className="mt-5 rounded-2xl border border-black/[0.06] bg-[#FCFBF9] p-4">
                      <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.16em] text-[#D6A66A]"><ShieldCheck className="h-4 w-4" /> {protocol.name || protocol.code || "Completion protocol"}</div>
                      {(protocol.field_schema || []).length ? (
                        <div className="mt-4 grid gap-3 md:grid-cols-2">
                          {(protocol.field_schema || []).map((field) => (
                            <ProtocolField key={field.key} field={field} value={completion.fields?.[field.key]} onChange={(value) => patchField(job.id, field.key, value)} />
                          ))}
                        </div>
                      ) : null}

                      <div className="mt-4 grid gap-3 md:grid-cols-2">
                        <label className="text-xs text-[#817B73]"><span className="mb-2 block text-[9px] uppercase tracking-[0.12em] text-[#AAA49C]">Outcome</span><select value={completion.outcome || "completed"} onChange={(event) => patchCompletion(job.id, { outcome: event.target.value })} className="h-11 w-full rounded-xl border border-black/[0.09] bg-white px-3 text-[#1B1A18]"><option value="completed">Completed</option>{protocol.completion_rules?.allow_follow_up !== false ? <option value="follow_up">Follow up required</option> : null}</select></label>
                        <label className="text-xs text-[#817B73]"><span className="mb-2 block text-[9px] uppercase tracking-[0.12em] text-[#AAA49C]">Follow-up notes</span><input value={completion.follow_up_notes || ""} onChange={(event) => patchCompletion(job.id, { follow_up_notes: event.target.value })} className="h-11 w-full rounded-xl border border-black/[0.09] bg-white px-3 outline-none" placeholder="Optional notes" /></label>
                      </div>

                      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                        {evidence.before_photos ? <EvidenceUpload title="Before photos" count={(completion.evidence?.before_photos || []).length} busy={state.uploading === `${job.id}:before_photos`} onFile={(file) => uploadEvidence(job, "before_photos", file)} /> : null}
                        {evidence.after_photos ? <EvidenceUpload title="After photos" count={(completion.evidence?.after_photos || []).length} busy={state.uploading === `${job.id}:after_photos`} onFile={(file) => uploadEvidence(job, "after_photos", file)} /> : null}
                        {evidence.customer_signature ? <label className="rounded-xl border border-black/[0.065] p-3 text-xs"><span className="text-[9px] uppercase tracking-[0.12em] text-[#AAA49C]">Customer signature / name</span><input value={completion.evidence?.customer_signature || ""} onChange={(event) => patchEvidence(job.id, "customer_signature", event.target.value)} className="mt-2 h-11 w-full rounded-xl border border-black/[0.09] bg-white px-3 outline-none" /></label> : null}
                        {evidence.technician_signature ? <label className="rounded-xl border border-black/[0.065] p-3 text-xs"><span className="text-[9px] uppercase tracking-[0.12em] text-[#AAA49C]">Technician signature / name</span><input value={completion.evidence?.technician_signature || ""} onChange={(event) => patchEvidence(job.id, "technician_signature", event.target.value)} className="mt-2 h-11 w-full rounded-xl border border-black/[0.09] bg-white px-3 outline-none" /></label> : null}
                      </div>
                    </div>
                  ) : null}

                  <div className="mt-5 grid gap-2 border-t border-black/[0.065] pt-5 sm:flex sm:flex-wrap">
                    {!completed && !inProgress ? <button onClick={() => act(job, "start")} disabled={!state.data?.shiftActive || Boolean(state.working)} className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-[#D6A66A] px-5 text-[11px] font-black uppercase tracking-[0.12em] text-black disabled:opacity-35 sm:w-auto"><Play className="h-4 w-4" /> {state.working === `${job.id}:start` ? "Starting…" : `Start ${job.actionNoun || "job"}`}</button> : null}
                    {inProgress ? <button onClick={() => act(job, "complete")} disabled={!state.data?.shiftActive || Boolean(state.working) || Boolean(state.uploading)} className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-emerald-400 px-5 text-[11px] font-black uppercase tracking-[0.12em] text-black disabled:opacity-35 sm:w-auto"><CheckCircle2 className="h-4 w-4" /> {state.working === `${job.id}:complete` ? "Completing…" : "Complete with evidence"}</button> : null}
                    {completed ? <div className="flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl border border-emerald-400/20 bg-emerald-400/[0.07] px-5 text-[10px] font-black uppercase tracking-[0.12em] text-[#5E6D58] sm:w-auto"><CheckCircle2 className="h-4 w-4" /> Completed {job.completedAt ? dateTime(job.completedAt) : ""}</div> : null}
                  </div>
                </article>
              );
            })}
          </section>
        ) : (
          <section className="rounded-[28px] border border-dashed border-black/[0.08] p-12 text-center"><CheckCircle2 className="mx-auto h-9 w-9 text-[#B4AEA6]" /><h2 className="mt-4 text-lg font-black">No assigned work for today</h2><p className="mt-2 text-sm text-[#948E86]">New work assigned to you will appear here automatically.</p></section>
        )}
      </div>
    </main>
  );
}

function Metric({ label, value }) {
  return <div className="rounded-2xl border border-black/[0.06] bg-[#FCFBF9] p-4"><div className="text-[9px] uppercase tracking-[0.14em] text-[#AAA49C]">{label}</div><div className="mt-1 text-2xl font-black">{value || 0}</div></div>;
}

function Info({ icon: Icon, label, value }) {
  return <div className="rounded-xl border border-black/[0.06] bg-[#FCFBF9] p-3"><div className="flex items-center gap-1.5 text-[9px] uppercase tracking-[0.12em] text-[#AAA49C]"><Icon className="h-3.5 w-3.5" /> {label}</div><div className="mt-1 text-sm text-[#67615A]">{value}</div></div>;
}

function EvidenceUpload({ title, count, busy, onFile }) {
  return <label className="cursor-pointer rounded-xl border border-black/[0.065] p-3 text-xs"><span className="flex items-center gap-2 text-[9px] uppercase tracking-[0.12em] text-[#AAA49C]"><Camera className="h-3.5 w-3.5" /> {title}</span><div className="mt-2 text-[#67615A]">{busy ? "Uploading…" : count ? `${count} uploaded · add another` : "Choose image"}</div><input type="file" accept="image/*" capture="environment" className="hidden" disabled={busy} onChange={(event) => onFile(event.target.files?.[0])} /></label>;
}

function ProtocolField({ field, value, onChange }) {
  const type = String(field.type || "text").toLowerCase();
  const label = `${field.label || field.key}${field.required ? " *" : ""}`;
  if (type === "checkbox") return <label className="flex h-11 items-center gap-2 rounded-xl border border-black/[0.09] bg-white px-3 text-xs text-[#67615A]"><input type="checkbox" checked={value === true} onChange={(event) => onChange(event.target.checked)} /> {label}</label>;
  if (type === "select" && Array.isArray(field.options)) return <label className="text-xs text-[#817B73]"><span className="mb-2 block text-[9px] uppercase tracking-[0.12em] text-[#AAA49C]">{label}</span><select value={value ?? ""} onChange={(event) => onChange(event.target.value)} className="h-11 w-full rounded-xl border border-black/[0.09] bg-white px-3 text-[#1B1A18]"><option value="">Select</option>{field.options.map((option) => { const optionValue = typeof option === "object" ? option.value : option; const optionLabel = typeof option === "object" ? option.label : option; return <option key={String(optionValue)} value={optionValue}>{optionLabel}</option>; })}</select></label>;
  return <label className="text-xs text-[#817B73]"><span className="mb-2 block text-[9px] uppercase tracking-[0.12em] text-[#AAA49C]">{label}</span><input type={type === "number" ? "number" : type === "date" ? "date" : "text"} value={value ?? ""} onChange={(event) => onChange(type === "number" ? Number(event.target.value) : event.target.value)} className="h-11 w-full rounded-xl border border-black/[0.09] bg-white px-3 outline-none" /></label>;
}
