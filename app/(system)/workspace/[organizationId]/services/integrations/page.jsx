"use client";

import { useParams } from "next/navigation";

import ServicesWorkspace from "@/components/workspace/services/ServicesWorkspace";

export const dynamic = "force-dynamic";

export default function ServicesIntegrationsPage() {
  const params = useParams();
  return <ServicesWorkspace organizationId={params?.organizationId} mode="integrations" />;
}
