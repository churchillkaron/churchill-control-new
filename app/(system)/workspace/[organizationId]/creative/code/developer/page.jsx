export const dynamic = "force-dynamic";

import AvantiqoCodeIDE from "@/components/creative/code/AvantiqoCodeIDE";
import CodeProgressFeedProvider from "@/components/operator/CodeProgressFeedProvider";

export default async function AvantiqoCodeDeveloperPage({ params }) {
  const resolvedParams = await params;
  const organizationId = String(resolvedParams?.organizationId || "").trim();
  return (
    <CodeProgressFeedProvider organizationId={organizationId}>
      <AvantiqoCodeIDE organizationId={organizationId} />
    </CodeProgressFeedProvider>
  );
}
