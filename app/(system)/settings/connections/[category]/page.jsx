"use client";

export const dynamic = "force-dynamic";

import { notFound, useParams } from "next/navigation";

import ERPEngine from "@/lib/platform/erp-engine/ERPRuntime";
import { getWorkspaceItemByRoute } from "@/lib/platform/registry/erpRegistry";
import { serializeCapability } from "@/lib/platform/registry/serializeCapability";

export default function BusinessConnectionsCategoryPage() {
  const params = useParams();
  const category = Array.isArray(params?.category)
    ? params.category[0]
    : params?.category;

  const route = `/settings/connections/${String(category || "").trim()}`;
  const capability = serializeCapability(getWorkspaceItemByRoute(route));

  if (!capability || capability.renderer !== "ChannelConnectionWorkCenter") {
    notFound();
  }

  return (
    <ERPEngine
      renderer={capability.renderer}
      capability={capability}
    />
  );
}
