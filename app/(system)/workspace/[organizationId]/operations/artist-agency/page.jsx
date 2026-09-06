"use client";

import { useParams } from "next/navigation";

import ArtistAgencyWorkspaceUI from "@/components/workspace/operations/ArtistAgencyWorkspaceUI";
import { useBusinessContext } from "@/app/providers/BusinessContextProvider";

export const dynamic = "force-dynamic";

export default function ArtistAgencyPage() {
  const params = useParams();
  const businessContext = useBusinessContext() || {};
  const organizationId =
    params?.organizationId ||
    businessContext.organization_id ||
    businessContext.organization?.id ||
    null;

  return <ArtistAgencyWorkspaceUI organizationId={organizationId} />;
}
