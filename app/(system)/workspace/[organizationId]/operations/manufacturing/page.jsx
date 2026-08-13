"use client";

export const dynamic = "force-dynamic";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useOrganizationRuntime } from "@/lib/hooks/useOrganizationRuntime";

const CONTROL_AREAS = Object.freeze([
  Object.freeze({
    id: "work-orders",
    title: "Work Orders",
    eyebrow: "Operations",
    description:
      "Authorise, scope and control production work requiring accountable execution and completion.",
    route: "/operations/work-orders",
    action: "Open Work Orders",
  }),
  Object.freeze({
    id: "production-runs",
    title: "Production Runs",
    eyebrow: "Operations",
    description:
      "Coordinate repeatable production batches, rounds and cycles through the neutral operational run capability.",
    route: "/operations/operational-runs",
    action: "Open Runs",
  }),
  Object.freeze({
    id: "work-centres",
    title: "Work Centres",
    eyebrow: "Operations",
    description:
      "Manage stations, lines and equipment capacity where production work is executed.",
    route: "/operations/work-centres",
    action: "Open Work Centres",
  }),
  Object.freeze({
    id: "assignments",
    title: "Assignments",
    eyebrow: "Operations",
    description:
      "Coordinate accountable responsibility across active production work and station coverage.",
    route: "/operations/assignments",
    action: "Open Assignments",
  }),
  Object.freeze({
    id: "quality-checks",
    title: "Quality Checks",
    eyebrow: "Operations",
    description:
      "Execute in-process and final quality checks and preserve inspection outcomes as evidence.",
    route: "/operations/quality-checks",
    action: "Open Quality",
  }),
  Object.freeze({
    id: "downtime",
    title: "Downtime",
    eyebrow: "Operations",
    description:
      "Record and resolve equipment and resource downtime affecting production throughput.",
    route: "/operations/resource-downtime",
    action: "Open Downtime",
  }),
  Object.freeze({
    id: "completion",
    title: "Completion Evidence",
    eyebrow: "Operations",
    description:
      "Capture and validate proof of completed production work before release.",
    route: "/operations/completion-evidence",
    action: "Open Completion",
  }),
  Object.freeze({
    id: "material-usage",
    title: "Material Issue & Usage",
    eyebrow: "Supply Chain",
    description:
      "Issue and consume materials against production through the canonical inventory owner.",
    route: "/supply-chain/production/usage",
    action: "Open Usage",
  }),
  Object.freeze({
    id: "output-batches",
    title: "Output Receipt",
    eyebrow: "Supply Chain",
    description:
      "Receive produced batches into stock so output and valuation stay owned by Supply Chain.",
    route: "/supply-chain/production/batches",
    action: "Open Batches",
  }),
  Object.freeze({
    id: "scrap",
    title: "Scrap & Waste",
    eyebrow: "Supply Chain",
    description:
      "Record scrap and waste movements against production without duplicating stock ownership.",
    route: "/supply-chain/production/waste",
    action: "Open Waste",
  }),
  Object.freeze({
    id: "costing",
    title: "Production Costing",
    eyebrow: "Finance",
    description:
      "Review production cost posting and variance through the canonical costing contract.",
    route: "/supply-chain/production/costing",
    action: "Open Costing",
  }),
  Object.freeze({
    id: "labour",
    title: "Workforce",
    eyebrow: "People",
    description:
      "Review labour coverage, time capture and shift attendance owned by the People domain.",
    route: "/people",
    action: "Open People",
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

export default function ManufacturingOperationsControlPage() {
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
        Loading Manufacturing Control...
      </section>
    );
  }

  return (
    <section className="mx-auto max-w-[1180px] px-4 py-6 text-white">
      <div className="rounded-[32px] border border-white/10 bg-white/[0.025] p-5 md:p-7">
        <div className="max-w-3xl">
          <div className="text-[10px] font-semibold uppercase tracking-[0.24em] text-[#D6A66A]">
            Manufacturing Operations
          </div>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight md:text-4xl">
            {organization?.name || "Manufacturing Control"}
          </h1>
          <p className="mt-3 text-sm leading-6 text-white/45">
            Coordinate production execution from one command workspace. Operations owns work authorisation, station execution, quality and downtime; Supply Chain owns material issue, output receipt and scrap; People owns labour; Finance owns costing.
          </p>
        </div>

        <div className="mt-7 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {CONTROL_AREAS.map((area) => (
            <ControlCard
              key={area.id}
              organizationId={organizationId}
              {...area}
            />
          ))}
        </div>

        <div className="mt-7 rounded-[24px] border border-[#D6A66A]/20 bg-[#D6A66A]/[0.055] p-5">
          <div className="text-sm font-semibold text-[#F2D9AA]">
            Manufacturing boundary
          </div>
          <div className="mt-3 grid gap-3 text-sm leading-6 text-white/55 md:grid-cols-3">
            <div>
              <span className="font-semibold text-white/75">Operations:</span>{" "}
              work orders, production runs, work centres, assignments, quality checks, downtime and completion evidence.
            </div>
            <div>
              <span className="font-semibold text-white/75">Supply Chain:</span>{" "}
              material issue and consumption, output receipt into stock, scrap and waste movement.
            </div>
            <div>
              <span className="font-semibold text-white/75">People and Finance:</span>{" "}
              labour coverage and time capture, production cost posting and variance.
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
