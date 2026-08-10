"use client";

export const dynamic = "force-dynamic";

import { notFound, useParams } from "next/navigation";

import ERPEngine from "@/lib/platform/erp-engine/ERPRuntime";
import { getWorkspaceItemByRoute } from "@/lib/platform/registry/erpRegistry";
import { serializeCapability } from "@/lib/platform/registry/serializeCapability";

export default function AdministrationDynamicCapabilityPage() {
  const params = useParams();
  const routeParts = Array.isArray(params?.administrationRoute)
    ? params.administrationRoute
    : params?.administrationRoute
      ? [params.administrationRoute]
      : [];

  const route = `/administration/${routeParts.join("/")}`;
  const capability = serializeCapability(getWorkspaceItemByRoute(route));

  if (!capability || !capability.renderer) {
    notFound();
  }

  return (
    <ERPEngine
      renderer={capability.renderer}
      capability={capability}
    />
  );
}
