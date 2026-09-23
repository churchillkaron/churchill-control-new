export const dynamic = "force-dynamic";

import CreativeCodeStudio from "@/components/creative/code/CreativeCodeStudio";
import CodeProgressFeedProvider from "@/components/operator/CodeProgressFeedProvider";

export default async function CreativeCodePage({ params }) {
  const resolvedParams = await params;
  const organizationId = String(resolvedParams?.organizationId || "").trim();

  return (
    <CodeProgressFeedProvider organizationId={organizationId}>
      <div
        className="min-h-screen bg-[#080808]"
        data-avantiqo-code-progress-poll-owner="shared-provider"
      >
        <CreativeCodeStudio organizationId={organizationId} />
      </div>
    </CodeProgressFeedProvider>
  );
}
