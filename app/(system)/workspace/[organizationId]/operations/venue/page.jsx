"use client";

export const dynamic = "force-dynamic";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useOrganizationRuntime } from "@/lib/hooks/useOrganizationRuntime";

const VENUE_CONTROL_AREAS = Object.freeze([
  Object.freeze({
    id: "pos",
    title: "Stationary POS",
    eyebrow: "Sales Execution",
    description:
      "Sell products and services, control active transactions, take payment, issue receipts and manage operator shifts.",
    route: "/operations/pos",
    action: "Open POS",
  }),
  Object.freeze({
    id: "incidents",
    title: "Incidents",
    eyebrow: "Live Control",
    description:
      "Capture, assign and resolve safety, service and operating incidents through the canonical Operations incident engine.",
    route: "/operations/incidents",
    action: "Open Incidents",
  }),
  Object.freeze({
    id: "queue",
    title: "Work Queue",
    eyebrow: "Coordination",
    description:
      "Review waiting and unassigned operational work, then route it into accountable execution without creating a parallel task system.",
    route: "/operations/queue-entries",
    action: "Open Work Queue",
  }),
]);

function ControlCard({
  organizationId,
  title,
  eyebrow,
  description,
  route,
  action,
}) {
  const href = `/workspace/${encodeURIComponent(organizationId)}${route}`;

  return (
    <Link
      href={href}
      className="group rounded-[24px] border border-white/10 bg-white/[0.035] p-5 transition hover:border-[#D6A66A]/45 hover:bg-[#D6A66A]/[0.06]"
    >
      <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#D6A66A]">
        {eyebrow}
      </div>
      <h2 className="mt-3 text-xl font-semibold text-white">
        {title}
      </h2>
      <p className="mt-3 min-h-[72px] text-sm leading-6 text-white/45">
        {description}
      </p>
      <div className="mt-5 text-xs font-semibold text-[#E4C78F]">
        {action} →
      </div>
    </Link>
  );
}

export default function VenueOperationsControlPage() {
  const params = useParams();
  const {
    organization,
    loading,
  } = useOrganizationRuntime();
  const organizationId =
    params?.organizationId || organization?.id || "";

  if (loading) {
    return (
      <section className="mx-auto max-w-[1080px] px-4 py-12 text-white/45">
        Loading Venue Control...
      </section>
    );
  }

  return (
    <section className="mx-auto max-w-[1080px] px-4 py-6 text-white">
      <div className="rounded-[32px] border border-white/10 bg-white/[0.025] p-5 md:p-7">
        <div className="max-w-3xl">
          <div className="text-[10px] font-semibold uppercase tracking-[0.24em] text-[#D6A66A]">
            Venue Operations
          </div>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight md:text-4xl">
            {organization?.name || "Venue Control"}
          </h1>
          <p className="mt-3 text-sm leading-6 text-white/45">
            Coordinate live venue execution from one command workspace. POS owns selling and shifts; the Operations event engine owns incidents and waiting work; commercial event planning remains outside this execution layer.
          </p>
        </div>

        <div className="mt-7 grid gap-3 md:grid-cols-3">
          {VENUE_CONTROL_AREAS.map((area) => (
            <ControlCard
              key={area.id}
              organizationId={organizationId}
              {...area}
            />
          ))}
        </div>

        <div className="mt-7 rounded-[24px] border border-[#D6A66A]/20 bg-[#D6A66A]/[0.055] p-5">
          <div className="text-sm font-semibold text-[#F2D9AA]">
            Venue boundary
          </div>
          <div className="mt-3 grid gap-3 text-sm leading-6 text-white/55 md:grid-cols-3">
            <div>
              <span className="font-semibold text-white/75">POS:</span>{" "}
              sales, checkout, payment, receipts and operator shifts.
            </div>
            <div>
              <span className="font-semibold text-white/75">Incidents:</span>{" "}
              safety, service disruption, escalation and accountable resolution.
            </div>
            <div>
              <span className="font-semibold text-white/75">Work Queue:</span>{" "}
              waiting operational work and responsibility routing during live service.
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
