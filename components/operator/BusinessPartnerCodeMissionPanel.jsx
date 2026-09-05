"use client";

import BusinessPartnerActiveCodeMissionPanel from "@/components/operator/BusinessPartnerActiveCodeMissionPanel";
import CodeMissionHistoryPanel from "@/components/operator/CodeMissionHistoryPanel";

export default function BusinessPartnerCodeMissionPanel({ organizationId }) {
  return (
    <div data-avantiqo-business-partner-code-workspace="true">
      <BusinessPartnerActiveCodeMissionPanel organizationId={organizationId} />
      <CodeMissionHistoryPanel organizationId={organizationId} compact />
    </div>
  );
}
