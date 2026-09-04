"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  Bug,
  ChevronRight,
  Gauge,
  History,
  MapPin,
  RefreshCw,
  Search,
  Target,
} from "lucide-react";

function text(value) { return String(value ?? "").trim(); }
function dateValue(value) { const date = value ? new Date(value) : null; return date && !Number.isNaN(date.getTime()) ? date : null; }
function formatDate(value) { const date = dateValue(value); return date ? date.toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" }) : "No history"; }
function tone(state) {
  if (state === "high") return "border-[#B36B52]/25 bg-[#B36B52]/[0.07] text-[#8B4937]";
  if (state === "watch") return "border-[#D6A66A]/35 bg-[#D6A66A]/[0.10] text-[#806143]";
  return "border-[#6F8B77]/25 bg-[#6F8B77]/[0.08] text-[#55705D]";
}
function trendLabel(value) {
  if (value === "increasing") return "Rising";
  if (value === "decreasing") return "Improving";
  if (value === "new") return "New";
  return "Steady";
}

function Metric({ label, value, detail, attention = false }) {
  return (
    <div className="rounded-2xl border border-black/[0.07] bg-white px-4 py-3.5">
      <div className="text-[8px] font-medium uppercase tracking-[0.12em] text-[#918A82]">{label}</div>
      <div className={`mt-2 text-[22px] font-medium tracking-[-0.03em] ${attention && Number(value) > 0 ? "text-[#98513D]" : "text-[#27231F]"}`}>{value}</div>
      <div className="mt-1 text-[8px] leading-4 text-[#9A948C]">{detail}</div>
    </div>
  );
}

function PressureBadge({ state }) {
  const label = state === "high" ? "High pressure" : state === "watch" ? "Watch" : "Low pressure";
  return <span className={`rounded-full border px-2.5 py-1 text-[8px] font-medium uppercase tracking-[0.08em] ${tone(state)}`}>{label}</span>;
}

function SiteCard({ site, selected, onSelect }) {
  return (
    <button type="button" onClick={onSelect} className={`w-full rounded-2xl border bg-white p-4 text-left transition ${selected ? "border-[#C7A071] shadow-[0_8px_30px_rgba(59,49,38,0.08)]" : "border-black/[0.07] hover:border-[#C7A071]/60"}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-[11px] font-medium text-[#26221E]">{site.customer_name}</div>
          <div className="mt-1 flex items-center gap-1.5 text-[9px] text-[#857E76]"><MapPin size={10} /> <span className="truncate">{site.customer_location_name}</span></div>
        </div>
        <PressureBadge state={site.pressure_state} />
      </div>
      <div className="mt-4 grid grid-cols-3 gap-2 border-t border-black/[0.06] pt-3">
        <div><div className="text-[15px] font-medium text-[#302A25]">{site.activity_index}</div><div className="text-[7px] uppercase tracking-[0.1em] text-[#9A948C]">Activity</div></div>
        <div><div className="text-[15px] font-medium text-[#302A25]">{site.repeat_pest_count}</div><div className="text-[7px] uppercase tracking-[0.1em] text-[#9A948C]">Repeat pests</div></div>
        <div><div className="text-[15px] font-medium text-[#302A25]">{site.observed_device_count}</div><div className="text-[7px] uppercase tracking-[0.1em] text-[#9A948C]">Devices</div></div>
      </div>
      <div className="mt-3 flex items-center justify-between text-[8px] text-[#9A948C]"><span>Last service {formatDate(site.last_service_at)}</span><ChevronRight size={11} /></div>
    </button>
  );
}

export default function PestControlSiteIntelligence({ organizationId }) {
  const [state, setState] = useState({ loading: true, error: "", metrics: {}, sites: [], authority: null, window: null });
  const [query, setQuery] = useState("");
  const [view, setView] = useState("attention");
  const [selectedKey, setSelectedKey] = useState("");

  const load = useCallback(async () => {
    if (!organizationId) return;
    setState((current) => ({ ...current, loading: true, error: "" }));
    try {
      const response = await fetch(`/api/service-management/site-intelligence?organizationId=${encodeURIComponent(organizationId)}&lookbackDays=365`, { cache: "no-store" });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || !body.success) throw new Error(body.error || "Unable to load pest site intelligence.");
      setState({ loading: false, error: "", metrics: body.metrics || {}, sites: body.sites || [], authority: body.authority || null, window: body.window || null });
      setSelectedKey((current) => current || body.sites?.[0]?.site_key || "");
    } catch (error) {
      setState((current) => ({ ...current, loading: false, error: error.message || "Unable to load pest site intelligence." }));
    }
  }, [organizationId]);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    const needle = text(query).toLowerCase();
    return state.sites.filter((site) => {
      if (view === "attention" && !site.needs_attention) return false;
      if (view === "repeat" && site.repeat_pest_count < 1) return false;
      if (!needle) return true;
      return [site.customer_name, site.customer_location_name, ...(site.pests || []).map((row) => row.pest_name), ...(site.devices || []).map((row) => row.device)]
        .some((value) => text(value).toLowerCase().includes(needle));
    });
  }, [query, state.sites, view]);

  const selected = useMemo(() => state.sites.find((site) => site.site_key === selectedKey) || filtered[0] || state.sites[0] || null, [filtered, selectedKey, state.sites]);
  const treatmentHref = `/workspace/${encodeURIComponent(organizationId)}/operations/field-service/treatments`;
  const fieldServiceHref = `/workspace/${encodeURIComponent(organizationId)}/operations/field-service`;

  return (
    <main className="min-h-[calc(100vh-61px)] bg-[#F7F6F3] px-4 py-5 text-[#191919] md:px-7 lg:px-9 lg:py-7">
      <div className="mx-auto max-w-[1580px]">
        <header className="flex flex-col gap-5 border-b border-black/[0.07] pb-5 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <Link href={fieldServiceHref} className="inline-flex items-center gap-1.5 text-[9px] text-[#8D867E] hover:text-[#79593A]"><ArrowLeft size={10} /> Pest Control</Link>
            <div className="mt-3 text-[10px] font-medium uppercase tracking-[0.18em] text-[#9A744B]">Property intelligence</div>
            <h1 className="mt-1 text-[27px] font-medium tracking-[-0.04em] text-[#201E1B]">Site pressure & device history</h1>
            <p className="mt-1 max-w-4xl text-[11px] leading-5 text-[#777169]">Turn governed visit history into a technician brief: recurring pests, repeat areas, observed devices and treatment patterns at each customer site—without creating a second customer, asset or inventory source of truth.</p>
          </div>
          <div className="flex items-center gap-2"><Link href={treatmentHref} className="rounded-lg border border-black/[0.08] bg-white px-3 py-2 text-[9px] text-[#625D56]">Treatment register</Link><button type="button" onClick={load} className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-black/[0.08] bg-white text-[#806143]" aria-label="Refresh site intelligence"><RefreshCw size={11} className={state.loading ? "animate-spin" : ""} /></button></div>
        </header>

        {state.error ? <div className="mt-4 flex items-start gap-2 rounded-xl border border-[#B36B52]/20 bg-[#B36B52]/[0.05] px-4 py-3 text-[10px] text-[#8B4937]"><AlertTriangle size={12} className="mt-0.5" />{state.error}</div> : null}

        <section className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
          <Metric label="Sites" value={state.loading ? "…" : state.metrics.sites || 0} detail="Sites with service history" />
          <Metric label="Attention" value={state.loading ? "…" : state.metrics.attention_sites || 0} detail="Pressure worth reviewing" attention />
          <Metric label="Repeat pressure" value={state.loading ? "…" : state.metrics.repeat_pressure_sites || 0} detail="Pests across multiple visits" attention />
          <Metric label="Severe findings" value={state.loading ? "…" : state.metrics.high_severity_findings || 0} detail="Severity 4–5 in history" attention />
          <Metric label="Observed devices" value={state.loading ? "…" : state.metrics.observed_devices || 0} detail="Device labels used on visits" />
          <Metric label="Treatment visits" value={state.loading ? "…" : state.metrics.treatment_visits || 0} detail="Visits with treatment records" />
        </section>

        <section className="mt-4 grid gap-4 xl:grid-cols-[390px_minmax(0,1fr)]">
          <aside className="rounded-2xl border border-black/[0.07] bg-[#EEECE7]/65 p-3">
            <div className="rounded-xl border border-black/[0.06] bg-white p-2.5">
              <div className="flex items-center gap-2 rounded-lg border border-black/[0.07] bg-[#FAF9F7] px-3 py-2"><Search size={11} className="text-[#9B9389]" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Customer, site, pest or device" className="w-full bg-transparent text-[9px] text-[#4B4640] outline-none placeholder:text-[#AAA39B]" /></div>
              <div className="mt-2 flex rounded-lg bg-[#F3F1ED] p-1">{[["attention", "Attention"], ["repeat", "Repeat"], ["all", "All sites"]].map(([value, label]) => <button key={value} type="button" onClick={() => setView(value)} className={`flex-1 rounded-md px-2 py-1.5 text-[8px] font-medium ${view === value ? "bg-white text-[#5D4935] shadow-sm" : "text-[#8C857D]"}`}>{label}</button>)}</div>
            </div>
            <div className="mt-3 max-h-[720px] space-y-2 overflow-y-auto pr-0.5">{filtered.map((site) => <SiteCard key={site.site_key} site={site} selected={selected?.site_key === site.site_key} onSelect={() => setSelectedKey(site.site_key)} />)}{!state.loading && !filtered.length ? <div className="rounded-xl border border-dashed border-black/[0.09] bg-white/60 px-4 py-8 text-center text-[9px] leading-5 text-[#938D85]">No sites match this view.</div> : null}</div>
          </aside>

          <div className="min-w-0">
            {!selected ? <div className="rounded-2xl border border-dashed border-black/[0.09] bg-white p-10 text-center text-[10px] text-[#8D877F]">No governed pest-control history is available yet.</div> : <>
              <section className="rounded-2xl border border-black/[0.07] bg-white p-5">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div><div className="text-[9px] font-medium uppercase tracking-[0.12em] text-[#94714E]">Selected site</div><h2 className="mt-1 text-[20px] font-medium tracking-[-0.03em] text-[#27231F]">{selected.customer_name}</h2><div className="mt-1 flex items-center gap-1.5 text-[10px] text-[#837C74]"><MapPin size={11} />{selected.customer_location_name}</div></div>
                  <div className="flex items-center gap-2"><PressureBadge state={selected.pressure_state} /><div className="rounded-full border border-black/[0.07] bg-[#F8F7F4] px-2.5 py-1 text-[8px] text-[#766F67]">Activity index {selected.activity_index}/100</div></div>
                </div>
                <div className="mt-5 grid gap-3 md:grid-cols-4"><div className="rounded-xl bg-[#F7F5F1] p-3"><Bug size={13} className="text-[#987249]" /><div className="mt-2 text-[18px] font-medium">{selected.finding_count}</div><div className="text-[8px] text-[#918A82]">Pest findings</div></div><div className="rounded-xl bg-[#F7F5F1] p-3"><Target size={13} className="text-[#987249]" /><div className="mt-2 text-[18px] font-medium">{selected.repeat_pest_count}</div><div className="text-[8px] text-[#918A82]">Repeat pest types</div></div><div className="rounded-xl bg-[#F7F5F1] p-3"><Gauge size={13} className="text-[#987249]" /><div className="mt-2 text-[18px] font-medium">{selected.application_count}</div><div className="text-[8px] text-[#918A82]">Applications</div></div><div className="rounded-xl bg-[#F7F5F1] p-3"><History size={13} className="text-[#987249]" /><div className="mt-2 text-[18px] font-medium">{selected.visit_count}</div><div className="text-[8px] text-[#918A82]">Visits in window</div></div></div>
                <div className="mt-4 rounded-xl border border-[#D6A66A]/20 bg-[#D6A66A]/[0.06] px-4 py-3"><div className="flex items-center gap-2 text-[8px] font-medium uppercase tracking-[0.1em] text-[#876542]"><Activity size={11} /> Next-visit intelligence</div><div className="mt-1.5 text-[10px] leading-5 text-[#5F574E]">{selected.next_visit_brief}</div></div>
              </section>

              <div className="mt-4 grid gap-4 lg:grid-cols-2">
                <section className="rounded-2xl border border-black/[0.07] bg-white p-4"><div className="flex items-center justify-between"><div><div className="text-[9px] font-medium uppercase tracking-[0.12em] text-[#8B837A]">Pest pressure</div><div className="mt-1 text-[8px] text-[#9B948C]">Frequency, severity and 90-day direction</div></div><Bug size={13} className="text-[#A57A4E]" /></div><div className="mt-3 space-y-2">{(selected.pests || []).slice(0, 8).map((pest) => <div key={pest.pest_name} className="rounded-xl border border-black/[0.06] bg-[#FAF9F7] p-3"><div className="flex items-start justify-between gap-3"><div><div className="text-[10px] font-medium text-[#36312C]">{pest.pest_name}</div><div className="mt-1 text-[8px] text-[#918A82]">{pest.visit_count} visit{pest.visit_count === 1 ? "" : "s"} · max severity {pest.max_severity || "—"} · last {formatDate(pest.last_seen_at)}</div></div><span className="rounded-full border border-black/[0.07] bg-white px-2 py-1 text-[7px] uppercase tracking-[0.08em] text-[#756E66]">{trendLabel(pest.trend)}</span></div>{pest.areas?.length ? <div className="mt-2 text-[8px] leading-4 text-[#777169]">Areas: {pest.areas.join(" · ")}</div> : null}</div>)}{!selected.pests?.length ? <div className="py-6 text-center text-[9px] text-[#938D85]">No active pest findings in this history window.</div> : null}</div></section>

                <section className="rounded-2xl border border-black/[0.07] bg-white p-4"><div className="flex items-center justify-between"><div><div className="text-[9px] font-medium uppercase tracking-[0.12em] text-[#8B837A]">Observed devices</div><div className="mt-1 text-[8px] text-[#9B948C]">Labels captured during governed treatment work</div></div><Target size={13} className="text-[#A57A4E]" /></div><div className="mt-3 space-y-2">{(selected.devices || []).slice(0, 8).map((device) => <div key={device.device} className="rounded-xl border border-black/[0.06] bg-[#FAF9F7] p-3"><div className="flex items-start justify-between gap-3"><div><div className="text-[10px] font-medium text-[#36312C]">{device.device}</div><div className="mt-1 text-[8px] text-[#918A82]">Seen on {device.visit_count} visit{device.visit_count === 1 ? "" : "s"} · {device.application_count} application{device.application_count === 1 ? "" : "s"}</div></div><div className="text-[7px] text-[#9A948C]">{formatDate(device.last_seen_at)}</div></div>{device.last_area ? <div className="mt-2 text-[8px] text-[#777169]">Last area: {device.last_area}</div> : null}{device.target_pests?.length ? <div className="mt-1 text-[8px] text-[#777169]">Targets: {device.target_pests.join(", ")}</div> : null}{device.materials?.length ? <div className="mt-1 text-[8px] text-[#777169]">Materials: {device.materials.join(", ")}</div> : null}</div>)}{!selected.devices?.length ? <div className="py-6 text-center text-[9px] text-[#938D85]">No device labels have been captured on treatment applications yet.</div> : null}</div></section>
              </div>

              <section className="mt-4 rounded-2xl border border-black/[0.07] bg-white p-4"><div className="flex items-center justify-between"><div><div className="text-[9px] font-medium uppercase tracking-[0.12em] text-[#8B837A]">Visit history</div><div className="mt-1 text-[8px] text-[#9B948C]">The evidence trail behind the pressure summary</div></div><History size={13} className="text-[#A57A4E]" /></div><div className="mt-3 divide-y divide-black/[0.06]">{(selected.history || []).slice(0, 12).map((visit) => <div key={visit.occurrence_id} className="grid gap-2 py-3 md:grid-cols-[120px_minmax(0,1fr)_auto] md:items-center"><div className="text-[8px] text-[#8D867E]">{formatDate(visit.occurrence_at)}</div><div><div className="text-[9px] font-medium text-[#403A34]">{visit.service_name}</div><div className="mt-1 text-[8px] text-[#918A82]">{visit.finding_count} findings · {visit.application_count} applications{visit.pests?.length ? ` · ${visit.pests.join(", ")}` : ""}</div></div><Link href={`/workspace/${encodeURIComponent(organizationId)}/operations/field-service/treatment/${encodeURIComponent(visit.occurrence_id)}`} className="text-[8px] font-medium text-[#8A6844] hover:text-[#60472F]">Open visit →</Link></div>)}</div></section>
            </>}
          </div>
        </section>

        <div className="mt-4 rounded-xl border border-black/[0.06] bg-white/60 px-4 py-3 text-[8px] leading-4 text-[#8B857D]">{state.authority?.note || "Site intelligence is derived from governed service history."} Device names here are observational references captured by technicians; they do not replace an authoritative asset register.</div>
      </div>
    </main>
  );
}
