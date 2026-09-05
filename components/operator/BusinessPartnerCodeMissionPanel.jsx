"use client";

import BusinessPartnerActiveCodeMissionPanel from "@/components/operator/BusinessPartnerActiveCodeMissionPanel";
import CodeEngineeringIntelligenceLiveCard from "@/components/operator/CodeEngineeringIntelligenceLiveCard";
import CodeMissionHistoryPanel from "@/components/operator/CodeMissionHistoryPanel";

export default function BusinessPartnerCodeMissionPanel({ organizationId }) {
  return (
    <div data-avantiqo-business-partner-code-workspace="true">
      <BusinessPartnerActiveCodeMissionPanel organizationId={organizationId} />
      <CodeEngineeringIntelligenceLiveCard
        organizationId={organizationId}
        theme="light"
        compact
        className="border-b border-black/[0.07] bg-[#FBFAF8] px-5 py-4"
      />
      <CodeMissionHistoryPanel organizationId={organizationId} compact />
    </div>
  );
}
