export const dynamic = "force-dynamic";

import CreativeCodeStudio from "@/components/creative/code/CreativeCodeStudio";
import CodeMissionHistoryPanel from "@/components/operator/CodeMissionHistoryPanel";

export default async function CreativeCodePage({ params }) {
  const resolvedParams = await params;
  const organizationId = String(resolvedParams?.organizationId || "").trim();

  return (
    <div className="min-h-screen bg-[#080808]">
      <CreativeCodeStudio organizationId={organizationId} />
      <div className="mx-auto max-w-[1500px] px-5 pb-8 md:px-8">
        <CodeMissionHistoryPanel organizationId={organizationId} />
      </div>
    </div>
  );
}
