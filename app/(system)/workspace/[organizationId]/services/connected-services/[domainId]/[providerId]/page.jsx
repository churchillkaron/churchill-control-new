"use client";

export const dynamic = "force-dynamic";

import { notFound, useParams } from "next/navigation";

import ERPEngine from "@/lib/platform/erp-engine/ERPEngine.jsx";
import {
  getWorkspaceItemByRoute,
} from "@/lib/platform/registry/erpRegistry";
import {
  serializeCapability,
} from "@/lib/platform/registry/serializeCapability";
import {
  getProvider,
} from "@/lib/platform/service-runtime/providers/ProviderRegistry";

function titleCase(value) {
  return String(value || "")
    .replace(/_/g, " ")
    .replace(/-/g, " ")
    .replace(/\b\w/g, c => c.toUpperCase());
}

export default function ProviderDetailPage() {
  const params =
    useParams();

  const domainId =
    params.domainId;


  const providerId =
    params.providerId;


  const provider =
    getProvider(providerId);

  const baseCapability =
    serializeCapability(
      getWorkspaceItemByRoute(
        "/services/connected-services"
      )
    );

  if (!provider || !baseCapability) {
    notFound();
  }

  const capability = {
    ...baseCapability,
    id:
      `${baseCapability.id}_${provider.id}`,
    name:
      provider.name,
    description:
      `${titleCase(provider.category)} Provider`,
    ui: {
      ...(baseCapability.ui || {}),
      runtime:
        "provider_detail",
      api:
        `/api/platform/services/providers/${provider.id}`,
      rowsKey:
        "rows",
      domainId,

      providerId:
        provider.id,
    },
  };

  return (
    <ERPEngine
      renderer={
        baseCapability.renderer
      }
      capability={
        capability
      }
    />
  );
}
