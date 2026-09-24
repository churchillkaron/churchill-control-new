"use client";

export const dynamic = "force-dynamic";

import { useParams } from "next/navigation";

import OrganizationSetupWorkCenter from "@/components/workspace/administration/OrganizationSetupWorkCenter";
import { useBusinessContext } from "@/app/providers/BusinessContextProvider";

export default function OrganizationOnboardingPage() {
  const params = useParams();
  const businessContext = useBusinessContext() || {};
  const organizationId =
    params?.organizationId ||
    businessContext.organization_id ||
    businessContext.organization?.id ||
    null;

  return <OrganizationSetupWorkCenter organizationId={organizationId} />;
}
