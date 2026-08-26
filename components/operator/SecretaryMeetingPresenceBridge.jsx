"use client";

import { useBusinessContext } from "@/app/providers/BusinessContextProvider";
import SecretaryMeetingPresence from "@/components/operator/SecretaryMeetingPresence";

export default function SecretaryMeetingPresenceBridge() {
  const businessContext = useBusinessContext();
  const organizationId =
    businessContext?.organization_id ||
    businessContext?.organization?.id ||
    null;
  const entityId =
    businessContext?.entity_id ||
    businessContext?.entity?.id ||
    null;

  if (!businessContext?.ready || !organizationId) return null;

  const organization = businessContext?.organization?.name || "Avantiqo";
  const entity =
    businessContext?.entity?.name ||
    businessContext?.entity?.legal_name ||
    "";
  const contextLabel = entity && entity !== organization
    ? `${organization} · ${entity}`
    : organization;

  return (
    <SecretaryMeetingPresence
      organizationId={organizationId}
      entityId={entityId}
      contextLabel={contextLabel}
      onCaptureStateChange={(active) => {
        window.dispatchEvent(
          new CustomEvent("avantiqo:secretary-meeting-capture", {
            detail: { active: active === true },
          }),
        );
      }}
    />
  );
}
