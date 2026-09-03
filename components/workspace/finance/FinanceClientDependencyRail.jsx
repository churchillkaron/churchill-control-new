"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  FileCheck2,
  LoaderCircle,
  RefreshCw,
  UserRoundCheck,
} from "lucide-react";

import {
  buildFinanceClientDependencySummary,
  resolveFinanceClientDependency,
} from "@/lib/finance/ui/FinanceClientDependencyPolicy";

function label(value) {
  return String(value || "")
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function localDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function stateTone(state) {
  const value = String(state || "").toUpperCase();
  if (["CLIENT_RESPONDED", "ACCEPTED"].includes(value)) return "border-emerald-700/15 bg-emerald-50 text-emerald-800";
  if (["FOLLOW_UP_DUE", "MANUAL_FOLLOW_UP", "NOT_ISSUED", "REQUEST_MISSING"].includes(value)) return "border-amber-700/15 bg-amber-50 text-amber-800";
  return "border-black/[0.08] bg-[#F6F4F0] text-[#746E66]";
}

function DependencyMetric({ label: metricLabel, value, attention = false }) {
  return (
    <div className="rounded-xl border border-black/[0.06] bg-white px-3 py-2.5">
      <div className={`text-[17px] font-semibold tabular-nums ${attention && value ? "text-[#8A633C]" : "text-[#36312C]"}`}>{value || 0}</div>
      <div className="mt-0.5 text-[7px] font-medium uppercase tracking-[0.08em] text-[#989188]">{metricLabel}</div>
    </div>
  );
}

export default function FinanceClientDependencyRail({ organizationId }) {
  const [practice, setPractice] = useState(null);
  const [programs, setPrograms] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const today = localDateKey();

  async function load() {
    if (!organizationId) return;
    try {
      setLoading(true);
      setError("");
      const [practiceResponse, programsResponse] = await Promise.all([
        fetch(`/api/workspace/finance/practice-control?organizationId=${encodeURIComponent(organizationId)}`, { cache: "no-store", credentials: "include" }),
        fetch(`/api/workspace/finance/work-programs?organizationId=${encodeURIComponent(organizationId)}`, { cache: "no-store", credentials: "include" }),
      ]);
      const [practiceBody, programsBody] = await Promise.all([
        practiceResponse.json().catch(() => ({})),
        programsResponse.json().catch(() => ({})),
      ]);
      if (!practiceResponse.ok || practiceBody?.success === false) throw new Error(practiceBody?.error || "Unable to load accounting practice");
      if (!programsResponse.ok || programsBody?.success === false) throw new Error(programsBody?.error || "Unable to load client dependencies");
      setPractice(practiceBody);
      setPrograms(programsBody);
    } catch (loadError) {
      setError(loadError?.message || "Unable to load client dependencies");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [organizationId]);

  const clientMap = useMemo(
    () => new Map((practice?.clients || []).map((client) => [client.organization_id, client])),
    [practice],
  );

  const analyzedItems = useMemo(() => {
    const rows = [];
    for (const run of programs?.runs || []) {
      const client = clientMap.get(run.organization_id);
      const requests = new Map((run.client_requests || []).map((request) => [request.work_item_id, request]));
      for (const item of run.work_items || []) {
        const status = String(item.status || "").toUpperCase();
        if (status !== "WAITING_ON_CLIENT" && item.work_type !== "CLIENT_REQUEST") continue;
        const clientRequest = requests.get(item.id) || null;
        rows.push({
          ...item,
          client_name: client?.name || "Client organization",
          client_request: clientRequest,
          client_dependency: resolveFinanceClientDependency(clientRequest, { workItem: item, today }),
        });
      }
    }
    return rows;
  }, [programs, clientMap, today]);

  const summary = useMemo(
    () => buildFinanceClientDependencySummary(analyzedItems),
    [analyzedItems],
  );

  if (!organizationId) return null;
  if (loading && !programs) {
    return (
      <div className="mb-4 flex min-h-[88px] items-center justify-center rounded-2xl border border-[#A37849]/12 bg-[#FFFDF9] text-[9px] text-[#817A72]">
        <LoaderCircle size={12} className="mr-2 animate-spin text-[#A37849]" /> Reading client dependencies…
      </div>
    );
  }

  return (
    <section className="mb-4 overflow-hidden rounded-[22px] border border-[#A37849]/14 bg-[#FFFDF9]">
      <div className="flex flex-col gap-4 border-b border-black/[0.06] px-4 py-4 xl:flex-row xl:items-center xl:justify-between">
        <div className="max-w-3xl">
          <div className="flex items-center gap-1.5 text-[8px] font-semibold uppercase tracking-[0.13em] text-[#8A633C]"><UserRoundCheck size={10} /> Client dependency intelligence</div>
          <div className="mt-1 text-[13px] font-semibold tracking-[-0.02em] text-[#332F2A]">Know when to act — and when not to chase</div>
          <p className="mt-1 text-[8px] leading-4 text-[#837C74]">Avantiqo reads the governed request state before recommending contact. Client replies become evidence review, recent requests stay quiet, and overdue manual requests remain a human decision.</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="grid grid-cols-4 gap-1.5">
            <DependencyMetric label="Action" value={summary.counts.action_due} attention />
            <DependencyMetric label="Responded" value={summary.counts.client_responded} attention />
            <DependencyMetric label="Follow-up" value={summary.counts.follow_up_due} attention />
            <DependencyMetric label="Do not chase" value={summary.counts.do_not_chase} />
          </div>
          <button type="button" onClick={load} disabled={loading} aria-label="Refresh client dependency intelligence" className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-black/[0.07] bg-white text-[#806143] disabled:opacity-50"><RefreshCw size={11} className={loading ? "animate-spin" : ""} /></button>
        </div>
      </div>

      {error ? <div className="border-b border-red-700/10 bg-red-50 px-4 py-2.5 text-[8px] text-red-800"><span className="inline-flex items-center gap-1.5"><AlertTriangle size={10} /> {error}</span></div> : null}

      {summary.dependencies.length ? (
        <div className="divide-y divide-black/[0.05]">
          {summary.dependencies.slice(0, 6).map(({ item, analysis }) => (
            <div key={item.id} className="grid gap-2 px-4 py-3 md:grid-cols-[minmax(160px,0.8fr)_minmax(230px,1.25fr)_minmax(240px,1.2fr)_auto] md:items-center md:gap-4">
              <div className="min-w-0">
                <div className="truncate text-[9px] font-semibold text-[#49423B]">{item.client_name}</div>
                <div className="mt-0.5 truncate text-[8px] text-[#9A938B]">{item.title || "Client evidence request"}</div>
              </div>
              <div className="min-w-0">
                <div className="truncate text-[9px] font-semibold text-[#3C3732]">{analysis.title}</div>
                <div className="mt-0.5 truncate text-[8px] text-[#8D857D]">{analysis.detail}</div>
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 text-[8px] font-semibold text-[#76583A]"><FileCheck2 size={9} /> {analysis.nextAction}</div>
                {analysis.blocks ? <div className="mt-0.5 truncate text-[7px] text-[#A19A92]">Blocks · {analysis.blocks}</div> : null}
              </div>
              <div className="flex items-center justify-between gap-2 md:justify-end">
                <span className={`rounded-full border px-2 py-1 text-[7px] font-semibold uppercase tracking-[0.05em] ${stateTone(analysis.state)}`}>{label(analysis.state)}</span>
                {analysis.shouldWait ? <Clock3 size={10} className="text-[#9B948B]" /> : analysis.state === "CLIENT_RESPONDED" ? <CheckCircle2 size={10} className="text-emerald-700" /> : <AlertTriangle size={10} className="text-[#9A7045]" />}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="flex items-center gap-2 px-4 py-4 text-[8px] text-[#817A72]"><CheckCircle2 size={11} className="text-emerald-700" /> No client dependencies need coordination right now.</div>
      )}

      <div className="border-t border-black/[0.05] bg-white/55 px-4 py-2 text-[7px] text-[#9A938B]">Read-only guidance · existing requests only · no automatic message is sent from this panel · review and sign-off controls remain unchanged.</div>
    </section>
  );
}
