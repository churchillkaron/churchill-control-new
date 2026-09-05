export const dynamic = "force-dynamic";

import CreativeCodeStudio from "@/components/creative/code/CreativeCodeStudio";
import CodeEngineeringIntelligenceLiveCard from "@/components/operator/CodeEngineeringIntelligenceLiveCard";
import CodeMissionHistoryPanel from "@/components/operator/CodeMissionHistoryPanel";

export default async function CreativeCodePage({ params }) {
  const resolvedParams = await params;
  const organizationId = String(resolvedParams?.organizationId || "").trim();

  return (
    <div className="min-h-screen bg-[#080808]">
      <CreativeCodeStudio organizationId={organizationId} />
      <div className="mx-auto max-w-[1500px] space-y-5 px-5 pb-8 md:px-8">
        <CodeEngineeringIntelligenceLiveCard
          organizationId={organizationId}
          theme="dark"
        />
        <CodeMissionHistoryPanel organizationId={organizationId} />
      </div>
    </div>
  );
}
