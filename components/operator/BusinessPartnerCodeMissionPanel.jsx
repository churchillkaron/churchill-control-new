"use client";

import BusinessPartnerActiveCodeMissionPanel from "@/components/operator/BusinessPartnerActiveCodeMissionPanel";
import CodeEngineeringIntelligenceLiveCard from "@/components/operator/CodeEngineeringIntelligenceLiveCard";
import CodeMissionHistoryPanel from "@/components/operator/CodeMissionHistoryPanel";
import CodeProgressFeedProvider from "@/components/operator/CodeProgressFeedProvider";

export default function BusinessPartnerCodeMissionPanel({ organizationId }) {
  return (
    <CodeProgressFeedProvider organizationId={organizationId}>
      <div
        data-avantiqo-business-partner-code-workspace="true"
        data-avantiqo-code-progress-poll-owner="shared-provider"
      >
        <BusinessPartnerActiveCodeMissionPanel organizationId={organizationId} />
        <CodeEngineeringIntelligenceLiveCard
          organizationId={organizationId}
          theme="light"
          compact
          className="border-b border-black/[0.07] bg-[#FBFAF8] px-5 py-4"
        />
        <CodeMissionHistoryPanel organizationId={organizationId} compact />
      </div>
    </CodeProgressFeedProvider>
  );
}
