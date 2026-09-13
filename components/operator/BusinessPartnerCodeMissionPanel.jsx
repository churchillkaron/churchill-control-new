"use client";

import BusinessPartnerCodeActivitySummary from "@/components/operator/BusinessPartnerCodeActivitySummary";
import CodeMissionStageRail from "@/components/operator/CodeMissionStageRail";
import CodeProgressFeedProvider from "@/components/operator/CodeProgressFeedProvider";

export default function BusinessPartnerCodeMissionPanel({ organizationId }) {
  return (
    <CodeProgressFeedProvider organizationId={organizationId}>
      <div
        data-avantiqo-business-partner-code-workspace="true"
        data-avantiqo-code-progress-poll-owner="shared-provider"
      >
        <BusinessPartnerCodeActivitySummary organizationId={organizationId} />
        <CodeMissionStageRail />
      </div>
    </CodeProgressFeedProvider>
  );
}
