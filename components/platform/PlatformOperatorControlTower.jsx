"use client";

import { AlertTriangle, ArrowRight, CheckCircle2, CircleDot, Database, ServerCog, ShieldAlert, WalletCards } from "lucide-react";

function t(value) {
  return String(value ?? "").trim();
}

function label(value) {
  return t(value || "unknown").replaceAll("_", " ");
}

function when(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function severityTone(severity) {
  if (severity === "critical") return "border-red-700/15 bg-red-50 text-red-800";
  if (severity === "high") return "border-orange-700/15 bg-orange-50 text-orange-800";
  if (severity === "medium") return "border-amber-700/15 bg-amber-50 text-amber-800";
  return "border-black/[0.08] bg-[#F6F4F0] text-[#746E66]";
}

function stateTone(state) {
  if (state === "critical") return "text-red-800";
  if (state === "attention") return "text-orange-800";
  if (state === "review") return "text-amber-800";
  return "text-emerald-800";
}

function IconFor({ category }) {
  if (category === "wallet") return <WalletCards size={13} />;
  if (category === "runtime" || category === "event_processing" || category === "release_governance") return <ServerCog size={13} />;
  if (category === "security_incident") return <ShieldAlert size={13} />;
  if (category === "service_execution") return <AlertTriangle size={13} />;
  return <CircleDot size={13} />;
}

function EvidenceCell({ name, value }) {
  if (value === null || value === undefined || value === "") return null;
  return (
    <div className="rounded-lg border border-black/[0.06] bg-white px-2.5 py-2">
      <div className="text-[6.5px] font-semibold uppercase tracking-[0.1em] text-[#A29A91]">{name}</div>
      <div className="mt-0.5 break-words text-[8px] font-medium text-[#514B45]">{String(value)}</div>
    </div>
  );
}

export default function PlatformOperatorControlTower({ control = {} }) {
  const signals = Array.isArray(control?.signals) ? control.signals : [];
  const coverage = control?.coverage || {};
  const counts = control?.counts || {};

  return (
    <section className="-mx-5 -mt-5 bg-[#F7F6F3] px-5 pb-2 pt-5 text-[#2A2723] lg:-mx-7 lg:-mt-6 lg:px-7 lg:pt-6">
      <div className="mx-auto max-w-[1760px] overflow-hidden rounded-[22px] border border-[#A37849]/14 bg-[#FFFDF9]">
        <div className="grid gap-5 border-b border-black/[0.06] px-5 py-5 xl:grid-cols-[minmax(0,1fr)_420px] xl:items-end">
          <div>
            <div className="text-[8px] font-semibold uppercase tracking-[0.16em] text-[#8A633C]">Avantiqo Platform · operator command</div>
            <div className="mt-1 flex flex-wrap items-center gap-3">
              <h1 className="text-[22px] font-semibold tracking-[-0.035em] text-[#27231F]">What needs attention now</h1>
              <span className={`text-[9px] font-semibold uppercase tracking-[0.1em] ${stateTone(control?.status)}`}>{label(control?.status || "unknown")}</span>
            </div>
            <p className="mt-1 max-w-4xl text-[9px] leading-5 text-[#8D867D]">
              Ranked from persisted evidence by current impact and recency. Repeated failures are compressed into one operational condition; stale unresolved debt remains visible without outranking live incidents.
            </p>
          </div>

          <div className="grid grid-cols-4 overflow-hidden rounded-xl border border-black/[0.06] bg-[#FBF8F3]">
            {[
              ["Critical", counts.critical || 0],
              ["High", counts.high || 0],
              ["Review", (counts.medium || 0) + (counts.low || 0)],
              ["Sources", `${coverage.verified || 0}/${coverage.total || 0}`],
            ].map(([name, value], index) => (
              <div key={name} className={`px-3 py-3 ${index ? "border-l border-black/[0.05]" : ""}`}>
                <div className="text-[6.5px] font-semibold uppercase tracking-[0.11em] text-[#999188]">{name}</div>
                <div className="mt-1 text-[14px] font-semibold text-[#403B35]">{value}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="grid xl:grid-cols-[minmax(0,1fr)_315px]">
          <div className="divide-y divide-black/[0.05]">
            {signals.slice(0, 10).map((signal, index) => (
              <div key={signal.id || index} className="px-5 py-4">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-[7px] font-semibold uppercase tracking-[0.09em] ${severityTone(signal.severity)}`}>
                        <IconFor category={signal.category} />
                        {label(signal.severity)}
                      </span>
                      <span className="text-[7px] font-semibold uppercase tracking-[0.09em] text-[#9A938A]">#{index + 1} · score {signal.score}</span>
                      <span className="text-[7px] uppercase tracking-[0.08em] text-[#A49C93]">{label(signal.state)}</span>
                    </div>
                    <div className="mt-2 text-[12px] font-semibold tracking-[-0.01em] text-[#322E2A]">{signal.title}</div>
                    <div className="mt-1 max-w-5xl text-[8.5px] leading-4 text-[#777068]">{signal.summary}</div>
                  </div>

                  <div className="shrink-0 text-right">
                    <div className="text-[7px] font-semibold uppercase tracking-[0.09em] text-[#9B948B]">Operator route</div>
                    <div className="mt-1 inline-flex items-center gap-1.5 text-[8px] font-semibold text-[#76583A]">Platform → {label(signal.target)} <ArrowRight size={10} /></div>
                    <div className="mt-1 text-[7.5px] text-[#A29A91]">{when(signal.occurredAt)}</div>
                  </div>
                </div>

                {signal.evidence ? (
                  <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                    {Object.entries(signal.evidence).slice(0, 8).map(([name, value]) => (
                      <EvidenceCell key={name} name={label(name)} value={value} />
                    ))}
                  </div>
                ) : null}

                <div className="mt-2 text-[6.5px] uppercase tracking-[0.09em] text-[#B0A89E]">Evidence source · {label(signal.source)}</div>
              </div>
            ))}

            {!signals.length ? (
              <div className="flex items-center justify-center gap-2 px-5 py-12 text-[10px] text-emerald-800">
                <CheckCircle2 size={14} /> No ranked operator exceptions from the verified sources.
              </div>
            ) : null}
          </div>

          <aside className="border-t border-black/[0.06] bg-[#FBF8F3] p-4 xl:border-l xl:border-t-0">
            <div className="flex items-center gap-2 text-[8px] font-semibold uppercase tracking-[0.13em] text-[#8A633C]"><Database size={11} /> Evidence coverage</div>
            <div className="mt-1 text-[9px] leading-4 text-[#827B73]">A source is counted only when its read completed successfully. Missing or failed sources are shown as unverified, never silently treated as clear.</div>

            <div className="mt-4 space-y-2">
              {(coverage.sources || []).map((source, index) => (
                <div key={`${source.name}-${index}`} className="rounded-lg border border-black/[0.06] bg-white px-3 py-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-[8px] font-semibold text-[#514B45]">{source.name}</div>
                    <span className={`text-[6.5px] font-semibold uppercase tracking-[0.08em] ${source.status === "verified" ? "text-emerald-800" : "text-amber-800"}`}>{label(source.status)}</span>
                  </div>
                  {source.detail ? <div className="mt-1 text-[7px] leading-3 text-[#9C958C]">{source.detail}</div> : null}
                </div>
              ))}
            </div>

            <div className="mt-4 rounded-lg border border-black/[0.06] bg-white px-3 py-3">
              <div className="text-[7px] font-semibold uppercase tracking-[0.1em] text-[#A19A91]">Ranking contract</div>
              <div className="mt-1 text-[8px] leading-4 text-[#746E66]">Live impact → runtime truth → active blockers → fresh alerts → stale unresolved debt.</div>
              <div className="mt-2 text-[6.5px] uppercase tracking-[0.08em] text-[#B0A89E]">{label(control?.policy)}</div>
            </div>
          </aside>
        </div>
      </div>
    </section>
  );
}
