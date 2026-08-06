"use client";

export const dynamic = "force-dynamic";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useOrganizationRuntime } from "@/lib/hooks/useOrganizationRuntime";

const PROJECT_EXECUTION_AREAS = Object.freeze([
  Object.freeze({
    id: "work-orders",
    title: "Work Orders",
    eyebrow: "Execution Control",
    description:
      "Authorise, scope and control accountable field work through the canonical Operations work-order lifecycle.",
    route: "/operations/work-orders",
    action: "Open Work Orders",
  }),
  Object.freeze({
    id: "dispatch",
    title: "Dispatch",
    eyebrow: "Field Coordination",
    description:
      "Release and dispatch approved work to eligible resources, devices or work centres without creating a project-specific dispatch engine.",
    route: "/operations/dispatch",
    action: "Open Dispatch",
  }),
  Object.freeze({
    id: "assignments",
    title: "Assignments",
    eyebrow: "Responsibility",
    description:
      "Coordinate accountable responsibility across active field work while People remains the workforce authority.",
    route: "/operations/assignments",
    action: "Open Assignments",
  }),
  Object.freeze({
    id: "queue",
    title: "Work Queue",
    eyebrow: "Prioritisation",
    description:
      "Review waiting and unassigned operational work, priorities and execution demand before dispatch.",
    route: "/operations/queue-entries",
    action: "Open Work Queue",
  }),
  Object.freeze({
    id: "incidents",
    title: "Incidents",
    eyebrow: "Risk & Recovery",
    description:
      "Capture, assess, assign and resolve field disruption, safety events and operational risk.",
    route: "/operations/incidents",
    action: "Open Incidents",
  }),
  Object.freeze({
    id: "completion-evidence",
    title: "Completion Evidence",
    eyebrow: "Proof of Work",
    description:
      "Capture, validate and retain accountable evidence that authorised work was completed correctly.",
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

export default function ProjectExecutionControlPage() {
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
        Loading Project Operations...
      </section>
    );
  }

  return (
    <section className="mx-auto max-w-[1180px] px-4 py-6 text-white">
      <div className="rounded-[32px] border border-white/10 bg-white/[0.025] p-5 md:p-7">
        <div className="max-w-3xl">
          <div className="text-[10px] font-semibold uppercase tracking-[0.24em] text-[#D6A66A]">
            Project Execution
          </div>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight md:text-4xl">
            {organization?.name || "Project Operations"}
          </h1>
          <p className="mt-3 text-sm leading-6 text-white/45">
            Coordinate accountable field execution from one command workspace. Operations owns work execution, dispatch, responsibility, incidents and completion evidence; project commercial terms, procurement, materials, budgets and accounting remain with their canonical domain owners.
          </p>
        </div>

        <div className="mt-7 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {PROJECT_EXECUTION_AREAS.map((area) => (
            <ControlCard
              key={area.id}
              organizationId={organizationId}
              {...area}
            />
          ))}
        </div>

        <div className="mt-7 rounded-[24px] border border-[#D6A66A]/20 bg-[#D6A66A]/[0.055] p-5">
          <div className="text-sm font-semibold text-[#F2D9AA]">
            Project execution boundary
          </div>
          <div className="mt-3 grid gap-3 text-sm leading-6 text-white/55 md:grid-cols-3">
            <div>
              <span className="font-semibold text-white/75">Operations:</span>{" "}
              work orders, queues, dispatch, assignments, incidents and completion evidence.
            </div>
            <div>
              <span className="font-semibold text-white/75">Projects and Commercial:</span>{" "}
              project commitments, contracts, customers, scope and commercial governance.
            </div>
            <div>
              <span className="font-semibold text-white/75">Supply Chain and Finance:</span>{" "}
              procurement, materials, inventory, budgets, accounting and settlement.
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
