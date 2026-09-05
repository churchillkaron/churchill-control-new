"use client";

export const dynamic = "force-dynamic";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, ArrowLeft, CheckCircle2, Play } from "lucide-react";
import { useParams, useRouter } from "next/navigation";

import PestControlTreatmentWorkspace from "@/components/workspace/operations/pest-control/PestControlTreatmentWorkspace";
import { useOrganizationRuntime } from "@/lib/hooks/useOrganizationRuntime";
import { organizationHasIndustrySolution } from "@/lib/platform/solutions/OrganizationIndustrySolutionResolver";

export default function PestControlTreatmentPage() {
  const params = useParams();
  const router = useRouter();
  const { organization, loading } = useOrganizationRuntime();
  const organizationId = params?.organizationId || organization?.id || "";
  const occurrenceId = params?.occurrenceId || "";
  const [gate, setGate] = useState({ loading: true, error: "", execution: null });
  const isPestControl = useMemo(() => organizationHasIndustrySolution({ organization, organizationId, solutionId: "pest-control" }), [organization, organizationId]);

  const loadGate = useCallback(async () => {
    if (!organizationId || !occurrenceId || !isPestControl) return;
    setGate((current) => ({ ...current, loading: true, error: "" }));
    try {
      const response = await fetch(`/api/service-management/treatment?organizationId=${encodeURIComponent(organizationId)}&occurrenceId=${encodeURIComponent(occurrenceId)}`, { cache: "no-store", credentials: "include" });
      const json = await response.json().catch(() => ({}));
      if (!response.ok || !json.success) throw new Error(json.error || "Treatment execution state could not be loaded.");
      setGate({ loading: false, error: "", execution: json.execution || null });
    } catch (error) {
      setGate({ loading: false, error: error?.message || "Treatment execution state could not be loaded.", execution: null });
    }
  }, [isPestControl, occurrenceId, organizationId]);

  useEffect(() => {
    if (loading || !organization || isPestControl) return;
    router.replace(`/workspace/${encodeURIComponent(organization.id || organizationId)}/operations/work-orders`);
  }, [isPestControl, loading, organization, organizationId, router]);

  useEffect(() => { loadGate(); }, [loadGate]);
  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    window.addEventListener("focus", loadGate);
    return () => window.removeEventListener("focus", loadGate);
  }, [loadGate]);

  if (loading || gate.loading) return <div className="min-h-[420px] bg-[#F7F6F3] p-8 text-sm text-[#77736C]">Preparing treatment workspace...</div>;
  if (!organization || !isPestControl) return <div className="min-h-[420px] bg-[#F7F6F3] p-8 text-sm text-[#77736C]">Opening the installed Operations workspace...</div>;
  if (gate.error) return <div className="min-h-[420px] bg-[#F7F6F3] p-8"><div className="mx-auto max-w-3xl rounded-2xl border border-[#B36B52]/20 bg-white p-5 text-[11px] text-[#8B4937]"><AlertTriangle size={14} className="mb-2" />{gate.error}</div></div>;

  if (!gate.execution?.started && !gate.execution?.terminal) {
    const technicianHref = `/workspace/${encodeURIComponent(organizationId)}/operations/field-service/technician?occurrenceId=${encodeURIComponent(occurrenceId)}`;
    return (
      <main className="min-h-[calc(100vh-61px)] bg-[#F7F6F3] px-5 py-8 text-[#191919] md:px-9">
        <div className="mx-auto max-w-4xl">
          <Link href={technicianHref} className="inline-flex items-center gap-1.5 text-[9px] text-[#8D867E]"><ArrowLeft size={10} /> Technician workspace</Link>
          <section className="mt-5 rounded-3xl border border-black/[0.075] bg-white p-6 shadow-[0_12px_45px_rgba(50,39,27,0.04)] md:p-8">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[#D6A66A]/12 text-[#8A6742]"><Play size={15} /></div>
            <div className="mt-5 text-[10px] font-medium uppercase tracking-[0.16em] text-[#9A744B]">Controlled field execution</div>
            <h1 className="mt-1 text-[28px] font-medium tracking-[-0.04em] text-[#24211E]">Arrive before treatment starts</h1>
            <p className="mt-2 max-w-2xl text-[11px] leading-5 text-[#777169]">Treatment belongs to the exact on-site service occurrence. Confirm arrival first so findings, products, stock preflight and evidence cannot be recorded against a visit that has not actually started.</p>
            <div className="mt-6 rounded-2xl border border-[#D6A66A]/20 bg-[#D6A66A]/[0.045] p-4 text-[10px] leading-5 text-[#76583A]">{gate.execution?.reason || "Confirm arrival in the technician workspace before recording treatment work."}</div>
            <Link href={technicianHref} className="mt-5 inline-flex items-center gap-2 rounded-xl bg-[#2C2925] px-4 py-3 text-[10px] font-medium text-white"><Play size={10} /> Open visit & confirm arrival</Link>
          </section>
        </div>
      </main>
    );
  }

  return (
    <>
      {gate.execution?.terminal ? <div className="border-b border-[#748267]/14 bg-[#748267]/[0.045] px-6 py-2.5 text-center text-[9px] text-[#607057]"><CheckCircle2 size={10} className="mr-1 inline" /> Closed visit · treatment is read-only</div> : null}
      <PestControlTreatmentWorkspace organizationId={organizationId} occurrenceId={occurrenceId} />
    </>
  );
}
