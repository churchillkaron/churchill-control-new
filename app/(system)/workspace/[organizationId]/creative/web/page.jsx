export const dynamic = "force-dynamic";

import CreativeRuntimeEntryShell from "@/components/creative/runtime/CreativeRuntimeEntryShell";

export default async function CreativeWebPage({ params }) {
  const resolvedParams = await params;
  const organizationId = String(resolvedParams?.organizationId || "").trim();

  return (
    <CreativeRuntimeEntryShell
      organizationId={organizationId}
      eyebrow="Creative · Web"
      title="Web Builder"
      description="Reserved customer-facing home for governed website creation inside Creative."
      statusLabel="Planned · execution runtime not present"
      statusDetail="The current repository does not contain an executable Web Builder runtime or customer-facing builder. This route reserves the product structure without falsely presenting an unfinished system as operational."
      runtimeLabel="No governed Web Builder runtime registered yet"
      capabilities={[
        "Website projects",
        "Brand-aware page creation",
        "Preview and publishing",
        "Governed deployment handoff",
      ]}
    />
  );
}
