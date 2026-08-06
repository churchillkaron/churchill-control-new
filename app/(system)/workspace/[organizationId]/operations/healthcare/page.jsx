"use client";

export const dynamic = "force-dynamic";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useOrganizationRuntime } from "@/lib/hooks/useOrganizationRuntime";

const HEALTHCARE_WORKFLOWS = Object.freeze([
  Object.freeze({
    id: "healthcare-dashboard",
    title: "Healthcare Dashboard",
    eyebrow: "Healthcare Domain",
    description:
      "Review Healthcare-owned patient, appointment, admission and bed metrics without moving clinical data into Operations.",
    route: "/healthcare/dashboard",
    action: "Open Dashboard",
  }),
  Object.freeze({
    id: "appointments",
    title: "Appointments",
    eyebrow: "Healthcare Domain",
    description:
      "Manage patient appointments and clinical scheduling through the Healthcare-owned appointment workflow.",
    route: "/healthcare/appointments",
    action: "Open Appointments",
  }),
  Object.freeze({
    id: "admissions",
    title: "Admissions",
    eyebrow: "Healthcare Domain",
    description:
      "Coordinate patient admission and discharge records through the Healthcare-owned clinical workflow.",
    route: "/healthcare/admissions",
    action: "Open Admissions",
  }),
  Object.freeze({
    id: "beds",
    title: "Beds & Wards",
    eyebrow: "Healthcare Domain",
    description:
      "Review Healthcare-owned bed capacity, occupancy and ward readiness without duplicating clinical state.",
    route: "/healthcare/beds",
    action: "Open Beds",
  }),
  Object.freeze({
    id: "pharmacy",
    title: "Pharmacy",
    eyebrow: "Healthcare Domain",
    description:
      "Open the Healthcare-owned pharmacy service and medication workflow; inventory ownership remains with its canonical domain.",
    route: "/healthcare/pharmacy",
    action: "Open Pharmacy",
  }),
  Object.freeze({
    id: "medical-records",
    title: "Medical Records",
    eyebrow: "Healthcare Domain",
    description:
      "Open controlled patient records through the Healthcare domain. Operations never owns clinical records or treatment decisions.",
    route: "/healthcare/medical-records",
    action: "Open Records",
  }),
]);

const OPERATIONS_CONTROLS = Object.freeze([
  Object.freeze({
    id: "patient-flow-queue",
    title: "Operational Queue",
    eyebrow: "Operations",
    description:
      "Prioritise and coordinate waiting operational work without becoming the clinical source of truth.",
    route: "/operations/queue-entries",
    action: "Open Queue",
  }),
  Object.freeze({
    id: "assignments",
    title: "Operational Assignments",
    eyebrow: "Operations",
    description:
      "Coordinate accountable execution responsibility while People remains the workforce authority and Healthcare owns clinical roles.",
    route: "/operations/assignments",
    action: "Open Assignments",
  }),
  Object.freeze({
    id: "incidents",
    title: "Operational Incidents",
    eyebrow: "Operations",
    description:
      "Capture, assess, assign and resolve operational disruption without replacing clinical safety or medical-governance systems.",
    route: "/operations/incidents",
    action: "Open Incidents",
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

function ControlGrid({ organizationId, items }) {
  return (
    <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
      {items.map((item) => (
        <ControlCard
          key={item.id}
          organizationId={organizationId}
          {...item}
        />
      ))}
    </div>
  );
}

export default function HealthcareOperationsPage() {
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
        Loading Healthcare Operations...
      </section>
    );
  }

  return (
    <section className="mx-auto max-w-[1180px] px-4 py-6 text-white">
      <div className="rounded-[32px] border border-white/10 bg-white/[0.025] p-5 md:p-7">
        <div className="max-w-3xl">
          <div className="text-[10px] font-semibold uppercase tracking-[0.24em] text-[#D6A66A]">
            Healthcare Operations
          </div>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight md:text-4xl">
            {organization?.name || "Healthcare Operations"}
          </h1>
          <p className="mt-3 text-sm leading-6 text-white/45">
            Coordinate live healthcare service without collapsing clinical ownership into Operations. Healthcare remains authoritative for patients, appointments, admissions, beds, pharmacy, medical records, clinical workflows and billing; Operations provides neutral queues, assignments and incident coordination.
          </p>
        </div>

        <div className="mt-8">
          <div className="text-sm font-semibold text-white/80">
            Healthcare-owned workflows
          </div>
          <p className="mt-1 text-sm leading-6 text-white/40">
            These links open the existing Healthcare domain and preserve its data hooks, routes and clinical responsibility.
          </p>
          <ControlGrid
            organizationId={organizationId}
            items={HEALTHCARE_WORKFLOWS}
          />
        </div>

        <div className="mt-8">
          <div className="text-sm font-semibold text-white/80">
            Cross-industry Operations controls
          </div>
          <p className="mt-1 text-sm leading-6 text-white/40">
            These capabilities coordinate execution and disruption without becoming the clinical system of record.
          </p>
          <ControlGrid
            organizationId={organizationId}
            items={OPERATIONS_CONTROLS}
          />
        </div>

        <div className="mt-8 rounded-[24px] border border-[#D6A66A]/20 bg-[#D6A66A]/[0.055] p-5">
          <div className="text-sm font-semibold text-[#F2D9AA]">
            Healthcare ownership boundary
          </div>
          <div className="mt-3 grid gap-3 text-sm leading-6 text-white/55 md:grid-cols-3">
            <div>
              <span className="font-semibold text-white/75">Healthcare:</span>{" "}
              patients, appointments, admissions, beds, clinical records, pharmacy and clinical decisions.
            </div>
            <div>
              <span className="font-semibold text-white/75">Operations:</span>{" "}
              neutral queues, accountable assignments, incident coordination and execution visibility.
            </div>
            <div>
              <span className="font-semibold text-white/75">Finance, People and Supply Chain:</span>{" "}
              billing, workforce authority, procurement and inventory remain with their canonical owners.
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
