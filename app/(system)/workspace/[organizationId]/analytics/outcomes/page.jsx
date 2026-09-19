"use client";

import { useParams } from "next/navigation";

import { useBusinessContext } from "@/app/providers/BusinessContextProvider";
import OutcomeEngineWorkspace from "@/components/workspace/analytics/outcomes/OutcomeEngineWorkspace";

export const dynamic = "force-dynamic";

export default function OutcomeEnginePage() {
  const params = useParams();
  const businessContext = useBusinessContext() || {};
  const organizationId =
    params?.organizationId ||
    businessContext.organization_id ||
    businessContext.organization?.id ||
    null;
  const entityId =
    businessContext.entity_id ||
    businessContext.entity?.id ||
    null;

  return <OutcomeEngineWorkspace organizationId={organizationId} entityId={entityId} />;
}
