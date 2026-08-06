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
   