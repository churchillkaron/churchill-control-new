"use client";

export const dynamic = "force-dynamic";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useOrganizationRuntime } from "@/lib/hooks/useOrganizationRuntime";

const FIELD_SERVICE_AREAS = Object.freeze([
  Object.freeze({
    id: "service-orders",
    title: "Service Orders",
    eyebrow: "Execution Control",
    description:
      "Authorise, scope and control accountable customer service work through the canonical Operations work-order lifecycle.",
    route: "/operations/work-orders",
    action: "Open Service Orders",
  }),
  Object.freeze({
    id: "appointments",
    title: "Appointment Windows",
    eyebrow: "Service Commitments",
    description:
      "Manage committed service windows independently from contracts, recurring-service rules and customer master data.",
    route: "/operations/appointment-windows",
    action: "Open Appointments",
  }),
  Object.freeze({
    id: "dispatch",
    title: "Dispatch",
    eyebrow: "Field Coordination",
    description:
      "Dispatch approved service work to eligible technicians, vehicles or operational resources without creating an industry-specific dispatch engine.",
    route: "/operations/dispatch",
    action: "Open Dispatch",
  }),
  Object.freeze({
    id: "assignments",
    title: "Technician Assignments",
    eyebrow: "Responsibility",
    description:
      "Coordinate accountable responsibility across active service work while People remains the workforce authority.",
    route: "/operations/assignments",
    action: "Open Assignments",
  }),
  Object.freeze({
    id: "queue",
    title: "Service Queue",
    eyebrow: "Prioritisation",
    description:
      "Review waiting, unassigned and delayed service work before scheduling or dispatch.",
    route: "/operations/queue-entries",
    action: "Open Service Queue",
  }),
  Object.freeze({
    id: "completion-evidence",
    title: "Service Evidence",
    eyebrow: "Proof of Service",
    description:
      "Capture, validate and retain completion evidence, customer acknowledgement and accountable proof of performed work.",
    route: "/operations/completion-evidence",
    action: "Open Evidence",
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
      className="group rounded-[24px] border border-white/10 bg-white/[0.035] p-5 transition hover:border-[#9BCF53]/45 hover:bg-[#9BCF53]/[0.06]"
    >
      <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#9BCF53]">
        {eyebrow}
      </div>
      <h2 className="mt-3 text-xl font-semibold text-white">
        {title}
      </h2>
      <p className="mt-3 min-h-[72px] text-sm leading-6 text-white/45">
        {description}
      </p>
      <div className="mt-5 text-xs font-semibold text-[#C7E89A]">
        {action} →
      </div>
    </Link>
  );
}

export default function FieldServiceControlPage() {
  const params = useParams();
  const {
    organization,
    loading,
  } = useOrganizationRuntime();
  const organizationId =
    params?.organizationId || organization?.id || "";

  if (loading) {
    return (
      <section className="mx-auto max-w-[1180px] px-4 py-12 text-white/45">
        Loading Field Service Operations...
      </section>
    );
  }

  return (
    <section className="mx-auto max-w-[1180px] px-4 py-6 text-white">
      <div className="rounded-[32px] border border-white/10 bg-white/[0.025] p-5 md:p-7">
        <div className="max-w-3xl">
          <div className="text-[10px] font-semibold uppercase tracking-[0.24em] text-[#9BCF53]">
            Field Service Execution
          </div>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight md:text-4xl">
            {organization?.name || "Field Service Operations"}
          </h1>
          <p className="mt-3 text-sm leading-6 text-white/45">
            Coordinate live customer service execution from one command workspace. Operations owns service orders, appointment windows, dispatch, assignments, queues and completion evidence; contracts, treatments, chemicals, customers, billing and recurring-service rules remain with their canonical business domains.
          </p>
        </div>

        <div className="mt-7 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {FIELD_SERVICE_AREAS.map((area) => (
            <ControlCard
              key={area.id}
              organizationId={organizationId}
              {...area}
            />
          ))}
        </div>

        <div className="mt-7 rounded-[24px] border border-[#9BCF53]/20 bg-[#9BCF53]/[0.055] p-5">
          <div className="text-sm font-semibold text-[#D9F4B7]">
            Field service boundary
          </div>
          <div className="mt-3 grid gap-3 text-sm leading-6 text-white/55 md:grid-cols-3">
            <div>
              <span className="font-semibold text-white/75">Operations:</span>{" "}
              service orders, appointment windows, queues, dispatch, assignments and completion evidence.
            </div>
            <div>
              <span className="font-semibold text-white/75">Service domain:</span>{" "}
              contracts, treatment plans, recurring-service rules, customer commitments and industry-specific protocols.
            </div>
            <div>
              <span className="font-semibold text-white/75">Supply Chain and Finance:</span>{" "}
              chemicals, materials, inventory, purchasing, billing, accounting and settlement.
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
