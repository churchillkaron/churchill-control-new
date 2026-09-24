"use client";

export const dynamic = "force-dynamic";

import Link from "next/link";
import { Building2, CheckCircle2, Hotel, MapPin, MonitorSmartphone, Settings2, TableProperties } from "lucide-react";
import { useOrganizationRuntime } from "@/lib/hooks/useOrganizationRuntime";

function moduleKey(value) {
  if (typeof value === "string") return value.trim().toLowerCase();
  return String(value?.module_id || value?.id || value?.key || "").trim().toLowerCase();
}

function SetupCard({ href, icon: Icon, title, detail, status = "Available" }) {
  return (
    <Link href={href} className="group rounded-[20px] border border-black/[0.07] bg-white p-5 shadow-[0_1px_2px_rgba(0,0,0,0.025)] transition hover:border-[#C8AD8C] hover:bg-[#FFFCF8]">
      <div className="flex items-start justify-between gap-4">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-[#C9AD89]/25 bg-[#FBF6EF] text-[#8A633C]"><Icon size={15} /></span>
        <span className="rounded-full bg-[#F0E7DA] px-2 py-1 text-[7px] font-semibold uppercase tracking-[0.09em] text-[#8A633C]">{status}</span>
      </div>
      <div className="mt-4 text-[13px] font-semibold text-[#302A24]">{title}</div>
      <div className="mt-1.5 text-[9px] leading-5 text-[#817B73]">{detail}</div>
      <div className="mt-4 text-[8px] font-semibold text-[#806444]">Open setup →</div>
    </Link>
  );
}

export default function OperationsConfigurationPage() {
  const { ready, organization, modules } = useOrganizationRuntime();
  const organizationId = organization?.id || null;
  const enabled = new Set((modules || []).map(moduleKey).filter(Boolean));
  const has = (...keys) => keys.some((key) => enabled.has(key));
  const restaurantEnabled = has("pos", "kitchen", "operations");
  const hotelEnabled = has("hotel", "reservations", "frontdesk");

  if (!ready || !organizationId) {
    return <div className="min-h-[calc(100vh-92px)] bg-[#F7F6F3] p-6 text-[11px] text-[#817B73]">Loading operations setup…</div>;
  }

  return (
    <main className="min-h-[calc(100vh-92px)] bg-[#F7F6F3] px-4 py-5 text-[#24201B] md:px-6">
      <div className="mx-auto max-w-[1180px]">
        <header className="border-b border-black/[0.07] pb-5">
          <div className="text-[9px] font-semibold uppercase tracking-[0.18em] text-[#A37849]">Operations · Configuration</div>
          <h1 className="mt-2 text-[30px] font-semibold tracking-[-0.04em]">Operations Setup</h1>
          <p className="mt-2 max-w-3xl text-[11px] leading-5 text-[#777169]">Configure the operational surfaces this organization actually uses. Every setup area stays scoped to <span className="font-semibold text-[#51473D]">{organization?.name || "this organization"}</span>.</p>
        </header>

        <section className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          <SetupCard
            href={`/workspace/${organizationId}/administration/business-locations`}
            icon={MapPin}
            title="Business locations"
            detail="Create operating sites, branches and workforce locations used by Operations, People and POS."
          />

          {restaurantEnabled ? (
            <>
              <SetupCard
                href={`/workspace/${organizationId}/operations/tables/configuration`}
                icon={TableProperties}
                title="Table runtime"
                detail="Configure table locking, transfers, merges, reservations, capacity rules and realtime table behavior."
              />
              <SetupCard
                href={`/workspace/${organizationId}/operations/pos`}
                icon={MonitorSmartphone}
                title="Point of Sale"
                detail="Open the stationary POS and verify ordering, payments, receipts, shifts and fulfillment for this organization."
              />
            </>
          ) : null}

          {hotelEnabled ? (
            <>
              <SetupCard
                href={`/workspace/${organizationId}/operations/hotel-setup`}
                icon={Hotel}
                title="Hotel setup"
                detail="Configure hotel operating foundations before front-desk and reservation workflows go live."
              />
              <SetupCard
                href={`/workspace/${organizationId}/operations/channel-manager`}
                icon={Building2}
                title="Hotel distribution"
                detail="Connect and verify OTA distribution channels using evidence-backed readiness."
              />
            </>
          ) : null}

          <SetupCard
            href={`/workspace/${organizationId}/administration/onboarding`}
            icon={CheckCircle2}
            title="Organization readiness"
            detail="Return to the complete company setup checklist and see what is configured, skipped or still needs review."
            status="Checklist"
          />
        </section>

        <div className="mt-5 rounded-[18px] border border-[#C8AD8C]/20 bg-[#FBF6EF] px-4 py-3 text-[9px] leading-5 text-[#776958]">
          This page intentionally exposes only live organization-scoped configuration surfaces. Legacy modifier endpoints and hardcoded organization identities are not part of the setup path.
        </div>
      </div>
    </main>
  );
}
