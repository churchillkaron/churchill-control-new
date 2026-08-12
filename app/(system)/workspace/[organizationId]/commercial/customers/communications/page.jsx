"use client";

export const dynamic = "force-dynamic";

import CommunicationsWorkspace from "@/components/workspace/commercial/CommunicationsWorkspace";

export default function CommunicationsPage({ params }) {
  return <CommunicationsWorkspace organizationId={params.organizationId} />;
}
