"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  CheckCircle2,
  CirclePlus,
  Clock3,
  RefreshCw,
  ShieldCheck,
  TriangleAlert,
} from "lucide-react";

const PLATFORM_ORGANIZATION_ID = "9a148429-b6a0-4bc6-ac83-a35c64fb7045";

function clean(value) {
  return String(value ?? "").trim();
}

function relativeTime(value) {
  if (!value) return "No evidence";
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return "No evidence";
  const seconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
  if (seconds < 60) return "now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function humanStage(value) {
  const stage = clean(value).toLowerCase().replace(/_/g, " ");
  return stage ? stage.replace(/\b\w/g, (character) => character.toUpperCase()) : "Unknown";
}

async function requestPipeline() {
  const scope = encodeURIComponent(PLATFORM_ORGANIZATION_ID);
  const response = await fetch(`/api/platform/admin/commercial-pipeline?organizationId=${scope}`, {
    cache: "no-store",
    credentials: "same-origin",
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.success === false) {
    throw new Error(payload?.error || "Acquisition evidence is unavailable");
  }
  return payload;
}

async function createProspect({ source, sourceReference, evidenceReference, note }) {
  const scope = encodeURIComponent(PLATFORM_ORGANIZATION_ID);
  const response = await fetch(`/api/platform/admin/acquisition?organizationId=${scope}`, {
    method: "POST",
    cache: "no-store",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      source,
      sourceReference,
      evidenceType: "PLATFORM_PROSPECT_ORIGIN_RECORDED",
      evidenceReference,
      note,
    }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.success === false) {
    throw new Error(payload?.error || "Unable to create prospect");
  }
  return payload;
}

function dispatchPartnerMessage(message) {
  window.dispatchEvent(
    new CustomEvent("avantiqo:home-command", {
      detail: { message, source: "text" },
    }),
  );
  window.requestAnimationFrame(() => {
    document.querySelector('[data-avantiqo-home-intelligence="true"]')?.scrollIntoView({
      behavior: "smooth",
      block: "nearest",
    });
  });
}

export default function PlatformAcquisitionControlPanel() {
  const [pipeline, setPipeline] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [source, setSource] = useState("");
  const [sourceReference, setSourceReference] = useState("");
  const [evidenceReference, setEvidenceReference] = useState("");
  const [note, setNote] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const next = await requestPipeline();
      setPipeline(next);
      setError("");
    } catch (loadError) {
      setError(loadError?.message || "Acquisition evidence is unavailable");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const recent = useMemo(
    () => (Array.isArray(pipeline?.recentAcquisitions) ? pipeline.recentAcquisitions.slice(0, 6) : []),
    [pipeline],
  );

  const canCreate = clean(source) && clean(evidenceReference) && clean(note);

  const submit = useCallback(async (event) => {
    event.preventDefault();
    if (!canCreate || saving) return;
    setSaving(true);
    setError("");
    setNotice("");
    try {
      await createProspect({
        source: clean(source),
        sourceReference: clean(sourceReference),
        evidenceReference: clean(evidenceReference),
        note: clean(note),
      });
      setSource("");
      setSourceReference("");
      setEvidenceReference("");
      setNote("");
      setNotice("Prospect created with atomic origin evidence.");
      await load();
    } catch (saveError) {
      setError(saveError?.message || "Unable to create prospect");
    } finally {
      setSaving(false);
    }
  }, [canCreate, evidenceReference, load, note, saving, source, sourceReference]);

  const askPartner = useCallback(() => {
    dispatchPartnerMessage([
      "Help me review the Avantiqo canonical acquisition pipeline.",
      `Canonical records: ${pipeline?.summary?.canonicalAcquisitions || 0}.`,
      `First-value records: ${pipeline?.summary?.canonicalFirstValueAccounts || 0}.`,
      "Identify the highest-leverage next prospect action using only persisted evidence. Do not invent conversion rates, pipeline value, or historical attribution.",
    ].join(" "));
  }, [pipeline]);

  return (
    <section data-avantiqo-platform-acquisition-control="true" className="bg-[#F4F3EF] px-4 pb-6 md:px-5">
      <div className="mx-auto max-w-[1680px] overflow-hidden rounded-[22px] border border-black/[0.07] bg-white">
        <div className="flex flex-col gap-4 border-b border-black/[0.06] px-4 py-4 md:flex-row md:items-start md:justify-between">
          <div>
            <div className="flex items-center gap-2 text-[8px] font-semibold uppercase tracking-[0.14em] text-[#8D877E]">
              <CirclePlus size={12} />
              Acquisition control
            </div>
            <h2 className="mt-1.5 text-[17px] font-semibold tracking-[-0.025em] text-[#403C37]">
              Start with evidence, not a sales-stage guess.
            </h2>
            <p className="mt-1 max-w-3xl text-[9px] leading-4 text-[#918B83]">
              A new record starts only at PROSPECT. This action writes the prospect and its origin evidence atomically. It does not create a customer, subscription, revenue claim, or conversion claim.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={load}
              disabled={loading}
              className="inline-flex min-h-8 items-center gap-1.5 rounded-lg border border-black/[0.08] bg-white px-2.5 text-[8px] font-medium text-[#625D55] disabled:opacity-50"
            >
              <RefreshCw size={10} className={loading ? "animate-spin" : ""} />
              Refresh
            </button>
            <button
              type="button"
              onClick={askPartner}
              className="inline-flex min-h-8 items-center gap-1.5 rounded-lg border border-[#B98A57]/25 bg-[#FBF7F1] px-2.5 text-[8px] font-medium text-[#8A643C]"
            >
              Review with Partner
              <ArrowRight size={10} />
            </button>
          </div>
        </div>

        {error ? (
          <div className="flex items-start gap-2 border-b border-red-200 bg-red-50 px-4 py-3 text-[9px] text-red-800">
            <TriangleAlert size={12} className="mt-0.5 shrink-0" />
            {error}
          </div>
        ) : null}
        {notice ? (
          <div className="flex items-start gap-2 border-b border-emerald-200 bg-emerald-50 px-4 py-3 text-[9px] text-emerald-800">
            <CheckCircle2 size={12} className="mt-0.5 shrink-0" />
            {notice}
          </div>
        ) : null}

        <div className="grid grid-cols-1 lg:grid-cols-[minmax(360px,0.72fr)_minmax(0,1.28fr)]">
          <form onSubmit={submit} className="border-b border-black/[0.06] px-4 py-4 lg:border-b-0 lg:border-r">
            <div className="text-[8px] font-semibold uppercase tracking-[0.13em] text-[#8D877E]">New prospect</div>
            <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
              <label className="block">
                <span className="text-[8px] font-medium text-[#777168]">Source *</span>
                <input
                  value={source}
                  onChange={(event) => setSource(event.target.value)}
                  placeholder="Referral, website, outbound…"
                  className="mt-1 h-9 w-full rounded-lg border border-black/[0.08] bg-[#FBFAF8] px-2.5 text-[9px] text-[#48423C] outline-none focus:border-[#B98A57]/45"
                />
              </label>
              <label className="block">
                <span className="text-[8px] font-medium text-[#777168]">Source reference</span>
                <input
                  value={sourceReference}
                  onChange={(event) => setSourceReference(event.target.value)}
                  placeholder="Campaign, URL, referral name…"
                  className="mt-1 h-9 w-full rounded-lg border border-black/[0.08] bg-[#FBFAF8] px-2.5 text-[9px] text-[#48423C] outline-none focus:border-[#B98A57]/45"
                />
              </label>
              <label className="block sm:col-span-2 lg:col-span-1 xl:col-span-2">
                <span className="text-[8px] font-medium text-[#777168]">Evidence reference *</span>
                <input
                  value={evidenceReference}
                  onChange={(event) => setEvidenceReference(event.target.value)}
                  placeholder="Email/thread/call/meeting/form reference"
                  className="mt-1 h-9 w-full rounded-lg border border-black/[0.08] bg-[#FBFAF8] px-2.5 text-[9px] text-[#48423C] outline-none focus:border-[#B98A57]/45"
                />
              </label>
              <label className="block sm:col-span-2 lg:col-span-1 xl:col-span-2">
                <span className="text-[8px] font-medium text-[#777168]">What makes this a real prospect? *</span>
                <textarea
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                  rows={3}
                  placeholder="Record the observable commercial intent or owner evidence."
                  className="mt-1 w-full resize-none rounded-lg border border-black/[0.08] bg-[#FBFAF8] px-2.5 py-2 text-[9px] leading-4 text-[#48423C] outline-none focus:border-[#B98A57]/45"
                />
              </label>
            </div>
            <button
              type="submit"
              disabled={!canCreate || saving}
              className="mt-3 inline-flex min-h-9 items-center gap-2 rounded-lg border border-[#B98A57]/25 bg-[#FBF7F1] px-3 text-[9px] font-semibold text-[#8A643C] disabled:cursor-not-allowed disabled:opacity-40"
            >
              {saving ? <RefreshCw size={11} className="animate-spin" /> : <CirclePlus size={11} />}
              Start prospect
            </button>
            <div className="mt-2 flex items-start gap-2 text-[8px] leading-4 text-[#99938B]">
              <ShieldCheck size={11} className="mt-0.5 shrink-0 text-emerald-700" />
              Seller scope is server-owned Avantiqo Platform. The browser cannot choose another seller organization.
            </div>
          </form>

          <div className="px-4 py-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-[8px] font-semibold uppercase tracking-[0.13em] text-[#8D877E]">Canonical queue</div>
                <div className="mt-1 text-[13px] font-semibold text-[#48433D]">Newest governed acquisition records</div>
              </div>
              <span className="rounded-full bg-[#FBF7F1] px-2 py-1 text-[8px] font-medium text-[#8A643C]">
                {pipeline?.summary?.canonicalAcquisitions || 0} total
              </span>
            </div>

            <div className="mt-3 divide-y divide-black/[0.055]">
              {recent.length ? recent.map((record) => (
                <div key={record.id} className="grid gap-2 py-3 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-center sm:gap-4">
                  <div className="min-w-0">
                    <div className="truncate text-[9px] font-medium text-[#46413B]">
                      {clean(record.sourceReference) || clean(record.source) || `Acquisition ${record.id.slice(0, 8)}`}
                    </div>
                    <div className="mt-0.5 text-[8px] text-[#AAA39A]">
                      {clean(record.source) || "No source label"} · updated {relativeTime(record.stage_updated_at)}
                    </div>
                  </div>
                  <span className="w-fit rounded-full border border-[#B98A57]/20 bg-[#FBF7F1] px-2 py-1 text-[8px] font-semibold text-[#8A643C]">
                    {humanStage(record.stage)}
                  </span>
                  <div className="flex items-center gap-1 text-[8px] text-[#AAA39A]">
                    <Clock3 size={9} />
                    {relativeTime(record.created_at)}
                  </div>
                </div>
              )) : (
                <div className="py-5 text-[9px] leading-4 text-[#918B83]">
                  No canonical prospects yet. Existing customers and legacy leads are intentionally not backfilled by assumption.
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
