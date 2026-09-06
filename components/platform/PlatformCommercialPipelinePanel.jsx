"use client";

import { useCallback, useEffect, useState } from "react";
import {
  ArrowRight,
  CheckCircle2,
  Clock3,
  GitBranch,
  RefreshCw,
  ShieldAlert,
  Target,
  TriangleAlert,
} from "lucide-react";

const PLATFORM_ORGANIZATION_ID = "9a148429-b6a0-4bc6-ac83-a35c64fb7045";

function clean(value) {
  return String(value ?? "").trim();
}

function numeric(value) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatInteger(value) {
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(numeric(value));
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
  if (days < 14) return `${days}d ago`;
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(new Date(timestamp));
}

async function requestPipeline() {
  const scope = encodeURIComponent(PLATFORM_ORGANIZATION_ID);
  const response = await fetch(`/api/platform/admin/commercial-pipeline?organizationId=${scope}`, {
    cache: "no-store",
    credentials: "same-origin",
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.success === false) {
    throw new Error(payload?.error || "Commercial pipeline evidence is unavailable");
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

function gateClasses(state) {
  if (state === "pass") return "border-emerald-200 bg-emerald-50 text-emerald-800";
  if (state === "review") return "border-amber-200 bg-amber-50 text-amber-800";
  return "border-red-200 bg-red-50 text-red-800";
}

export default function PlatformCommercialPipelinePanel() {
  const [pipeline, setPipeline] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async ({ quiet = false } = {}) => {
    if (quiet) setRefreshing(true);
    else setLoading(true);

    try {
      const next = await requestPipeline();
      setPipeline(next);
      setError("");
    } catch (loadError) {
      setError(loadError?.message || "Commercial pipeline evidence is unavailable");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const summary = pipeline?.summary || {};
  const evidence = pipeline?.evidence || {};
  const gates = Array.isArray(pipeline?.gates) ? pipeline.gates : [];
  const stages = pipeline?.stageCounts || {};
  const leadStatuses = Array.isArray(pipeline?.persistedStatusEvidence?.leadStatuses)
    ? pipeline.persistedStatusEvidence.leadStatuses
    : [];
  const subscriptionStatuses = Array.isArray(pipeline?.persistedStatusEvidence?.subscriptionStatuses)
    ? pipeline.persistedStatusEvidence.subscriptionStatuses
    : [];

  const blockedCount = gates.filter((gate) => gate.state === "blocked").length;
  const reviewCount = gates.filter((gate) => gate.state === "review").length;
  const canonicalReady = evidence.sellerOwnershipFieldProven === true
    && evidence.governedStageContractProven === true;
  const hasCanonicalRecords = numeric(summary.canonicalAcquisitions) > 0;

  const state = blockedCount > 0
    ? {
        label: "Acquisition evidence blocked",
        classes: "border-red-200 bg-red-50 text-red-800",
      }
    : hasCanonicalRecords
      ? {
          label: "Canonical pipeline active",
          classes: "border-emerald-200 bg-emerald-50 text-emerald-800",
        }
      : canonicalReady
        ? {
            label: "Canonical pipeline ready",
            classes: "border-[#B98A57]/30 bg-[#FBF7F1] text-[#8A643C]",
          }
        : {
            label: "Evidence needs review",
            classes: "border-amber-200 bg-amber-50 text-amber-800",
          };

  const askPartner = useCallback(() => {
    dispatchPartnerMessage([
      "Review Avantiqo Platform canonical acquisition lifecycle using authoritative current evidence.",
      `Canonical acquisition records: ${numeric(summary.canonicalAcquisitions)}; evidence events: ${numeric(summary.canonicalEvents)}.`,
      `Canonical first-value accounts: ${numeric(summary.canonicalFirstValueAccounts)}.`,
      `Human-linked customer accounts: ${numeric(summary.humanLinkedAccounts)}; with successful service use: ${numeric(summary.humanAccountsWithSuccessfulUse)}.`,
      `Human accounts canonically attributed: ${numeric(summary.humanAccountsCanonicallyAttributed)}.`,
      `Legacy leads: ${numeric(summary.persistedLeads)}; legacy subscriptions: ${numeric(summary.persistedSubscriptions)}; legacy lead-to-subscription links: ${numeric(summary.technicalLegacyLeadSubscriptionLinks)}.`,
      `Customer-domain quotations excluded from Platform acquisition: ${numeric(summary.customerDomainQuotationsExcluded)}.`,
      "Use the governed prospect → qualified → commitment pending → committed → customer created → human active → first value lifecycle. Do not retroactively backfill legacy customers by assumption, do not invent win rate or pipeline value, and recommend the next owner action from persisted canonical evidence only.",
    ].join(" "));
  }, [summary]);

  if (loading && !pipeline) {
    return (
      <section data-avantiqo-platform-commercial-pipeline="true" className="bg-[#F4F3EF] px-4 pb-5 md:px-5">
        <div className="mx-auto flex max-w-[1680px] items-center gap-2 rounded-[22px] border border-black/[0.07] bg-white px-4 py-5 text-[10px] text-[#817B73]">
          <RefreshCw size={13} className="animate-spin" />
          Reading canonical acquisition evidence…
        </div>
      </section>
    );
  }

  return (
    <section data-avantiqo-platform-commercial-pipeline="true" className="bg-[#F4F3EF] px-4 pb-6 md:px-5">
      <div className="mx-auto max-w-[1680px] overflow-hidden rounded-[22px] border border-black/[0.07] bg-white shadow-none">
        <div className="flex flex-col gap-4 border-b border-black/[0.06] px-4 py-4 md:flex-row md:items-start md:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-2 text-[8px] font-semibold uppercase tracking-[0.14em] text-[#8D877E]">
                <Target size={12} />
                Commercial acquisition
              </div>
              <span className={`rounded-full border px-2 py-0.5 text-[8px] font-semibold uppercase tracking-[0.09em] ${state.classes}`}>
                {state.label}
              </span>
            </div>
            <h2 className="mt-1.5 text-[17px] font-semibold tracking-[-0.025em] text-[#403C37]">
              Every customer must have a provable path from prospect to first value.
            </h2>
            <p className="mt-1 max-w-3xl text-[9px] leading-4 text-[#918B83]">
              Avantiqo now has a seller-scoped acquisition lifecycle with atomic evidence history. Customer ERP quotations remain separate, old lead records are never backfilled by assumption, and human activation or first value cannot be advanced from browser claims alone.
            </p>
          </div>

          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-lg border border-black/[0.07] bg-[#FBFAF8] px-2.5 py-2 text-[8px] text-[#858078]">
              <Clock3 size={10} />
              Observed {relativeTime(pipeline?.observedAt)}
            </span>
            <button
              type="button"
              onClick={() => load({ quiet: true })}
              disabled={refreshing}
              className="inline-flex min-h-8 items-center gap-1.5 rounded-lg border border-black/[0.08] bg-white px-2.5 text-[8px] font-medium text-[#625D55] hover:border-[#B98A57]/35 disabled:opacity-50"
            >
              <RefreshCw size={10} className={refreshing ? "animate-spin" : ""} />
              Refresh
            </button>
            <button
              type="button"
              onClick={askPartner}
              className="inline-flex min-h-8 items-center gap-1.5 rounded-lg border border-[#B98A57]/25 bg-[#FBF7F1] px-2.5 text-[8px] font-medium text-[#8A643C] hover:border-[#B98A57]/45"
            >
              Review with Partner
              <ArrowRight size={10} />
            </button>
          </div>
        </div>

        {error ? (
          <div className="flex items-start gap-2 border-b border-amber-200 bg-amber-50 px-4 py-3 text-[9px] leading-4 text-amber-900">
            <TriangleAlert size={12} className="mt-0.5 shrink-0" />
            {error}. Existing evidence remains visible but is not treated as freshly verified.
          </div>
        ) : null}

        <div className="grid grid-cols-1 gap-px bg-black/[0.06] sm:grid-cols-2 xl:grid-cols-4">
          {[
            ["Canonical prospects", summary.canonicalAcquisitions, `${formatInteger(summary.canonicalEvents)} persisted lifecycle evidence events`],
            ["Human-linked accounts", summary.humanLinkedAccounts, `${formatInteger(summary.humanAccountsCanonicallyAttributed)} canonically attributed`],
            ["First value proven", summary.canonicalFirstValueAccounts, `${formatInteger(summary.humanAccountsWithSuccessfulUse)} existing human accounts have successful service evidence`],
            ["Legacy acquisition records", numeric(summary.persistedLeads) + numeric(summary.persistedSubscriptions), "Visible as legacy evidence only; never promoted automatically"],
          ].map(([label, value, detail]) => (
            <div key={label} className="bg-white px-4 py-4">
              <div className="text-[8px] font-semibold uppercase tracking-[0.12em] text-[#98928A]">{label}</div>
              <div className="mt-2 text-[15px] font-semibold tracking-[-0.02em] text-[#3D3934]">{formatInteger(value)}</div>
              <div className="mt-1 text-[8px] leading-4 text-[#99938B]">{detail}</div>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.15fr)_minmax(340px,0.85fr)]">
          <div className="border-b border-black/[0.06] px-4 py-4 lg:border-b-0 lg:border-r">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2 text-[8px] font-semibold uppercase tracking-[0.13em] text-[#8D877E]">
                  <GitBranch size={11} />
                  Lifecycle gates
                </div>
                <div className="mt-1 text-[13px] font-semibold text-[#48433D]">Authority before conversion reporting</div>
              </div>
              <span className={`rounded-full px-2 py-1 text-[8px] font-medium ${blockedCount ? "bg-red-50 text-red-700" : reviewCount ? "bg-amber-50 text-amber-700" : "bg-emerald-50 text-emerald-700"}`}>
                {blockedCount} blocked · {reviewCount} waiting evidence
              </span>
            </div>

            <div className="mt-3 divide-y divide-black/[0.055]">
              {gates.map((gate) => (
                <div key={gate.key} className="grid gap-2 py-3 sm:grid-cols-[minmax(170px,0.34fr)_auto_minmax(0,1fr)] sm:items-start sm:gap-3">
                  <div className="text-[9px] font-medium text-[#4A453F]">{gate.label}</div>
                  <span className={`w-fit rounded-full border px-2 py-0.5 text-[7px] font-semibold uppercase tracking-[0.08em] ${gateClasses(gate.state)}`}>
                    {gate.state}
                  </span>
                  <div className="text-[8px] leading-4 text-[#858078]">{gate.detail}</div>
                </div>
              ))}
            </div>

            <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
              {[
                ["Prospect", stages.prospect],
                ["Qualified", stages.qualified],
                ["Commitment", numeric(stages.commitmentPending) + numeric(stages.committed)],
                ["Customer", numeric(stages.customerCreated) + numeric(stages.humanActive) + numeric(stages.firstValue)],
                ["First value", stages.firstValue],
                ["Lost", stages.lost],
              ].map(([label, value]) => (
                <div key={label} className="rounded-xl border border-black/[0.06] bg-[#FBFAF8] px-3 py-2.5">
                  <div className="text-[8px] uppercase tracking-[0.1em] text-[#99938B]">{label}</div>
                  <div className="mt-1 text-[14px] font-semibold text-[#48423C]">{formatInteger(value)}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="px-4 py-4">
            <div className="flex items-center gap-2 text-[8px] font-semibold uppercase tracking-[0.13em] text-[#8D877E]">
              <ShieldAlert size={11} />
              Truth guards
            </div>

            <div className="mt-3 space-y-2">
              {[
                ["Seller scope", evidence.sellerOwnershipFieldProven === true, "Every canonical record belongs explicitly to Avantiqo Platform as seller."],
                ["Governed stages", evidence.governedStageContractProven === true, "Stage transitions are constrained and evidence-backed."],
                ["Customer ERP quotations", evidence.customerDomainQuotationsExcludedFromPlatformPipeline === true, `${formatInteger(summary.customerDomainQuotationsExcluded)} excluded from Avantiqo acquisition truth`],
                ["Legacy backfill", evidence.legacyBackfillPerformed === false, "Existing customers and old leads are not retroactively attributed without source proof."],
                ["Win rate / pipeline value", evidence.winRateClaimed === false && evidence.pipelineValueClaimed === false, "Not claimed until a meaningful canonical cohort exists."],
              ].map(([label, protectedState, detail]) => (
                <div key={label} className="rounded-xl border border-black/[0.06] bg-[#FBFAF8] px-3 py-2.5">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-[9px] font-medium text-[#514B44]">{label}</span>
                    {protectedState ? <CheckCircle2 size={12} className="text-emerald-700" /> : <TriangleAlert size={12} className="text-red-700" />}
                  </div>
                  <div className="mt-1 text-[8px] leading-4 text-[#99938B]">{detail}</div>
                </div>
              ))}
            </div>

            <div className="mt-3 rounded-xl border border-[#A78158]/15 bg-[#FBF7F1] px-3 py-3">
              <div className="text-[8px] font-semibold uppercase tracking-[0.11em] text-[#8A643C]">Legacy evidence kept separate</div>
              <div className="mt-1.5 text-[8px] leading-4 text-[#81766A]">
                Leads: {leadStatuses.length ? leadStatuses.join(" · ") : "none"}. Subscriptions: {subscriptionStatuses.length ? subscriptionStatuses.join(" · ") : "none"}. These remain historical source records, not canonical lifecycle stages.
              </div>
            </div>

            <div className={`mt-3 rounded-xl border px-3 py-3 text-[8px] leading-4 ${canonicalReady ? "border-[#B98A57]/20 bg-[#FBF7F1] text-[#7D684F]" : "border-red-200/70 bg-red-50/60 text-red-800"}`}>
              <span className="font-semibold">Owner action:</span> {clean(pipeline?.ownerAction?.detail) || "Start new prospects in the governed acquisition lifecycle and preserve evidence at each transition."}
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-1 border-t border-black/[0.06] bg-[#FBFAF8] px-4 py-3 text-[8px] leading-4 text-[#99938B] sm:flex-row sm:items-center sm:justify-between">
          <span>Source: {pipeline?.source || "AVANTIQO_PLATFORM_CANONICAL_ACQUISITION_EVIDENCE"}</span>
          <span>No customer Home or customer Commercial transaction is promoted into Platform acquisition truth.</span>
        </div>
      </div>
    </section>
  );
}
