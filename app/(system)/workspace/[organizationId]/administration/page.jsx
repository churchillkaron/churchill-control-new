"use client";

export const dynamic = "force-dynamic";

import { useParams } from "next/navigation";

import AdministrationCommandCenter from "@/components/workspace/administration/AdministrationCommandCenter";
import { useBusinessContext } from "@/app/providers/BusinessContextProvider";

export default function AdministrationWorkspacePage() {
  const params = useParams();
  const businessContext = useBusinessContext() || {};
  const organizationId =
    params?.organizationId ||
    businessContext.organization_id ||
    businessContext.organization?.id ||
    null;

  return <AdministrationCommandCenter organizationId={organizationId} />;
}
