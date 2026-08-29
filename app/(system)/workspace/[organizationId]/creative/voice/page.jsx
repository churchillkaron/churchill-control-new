export const dynamic = "force-dynamic";

import CreativeRuntimeEntryShell from "@/components/creative/runtime/CreativeRuntimeEntryShell";

export default async function CreativeVoicePage({ params }) {
  const resolvedParams = await params;
  const organizationId = String(resolvedParams?.organizationId || "").trim();

  return (
    <CreativeRuntimeEntryShell
      organizationId={organizationId}
      eyebrow="Creative · Voice"
      title="Voice Studio"
      description="The customer-facing entry point for Avantiqo voice work. Voice execution remains behind the existing governed Voice service runtime and provider controls."
      statusLabel="Governed runtime · Creative bridge"
      statusDetail="This page exposes Voice inside the Creative product structure without creating a second provider path or bypassing the existing lease, routing, service-runtime and certification controls."
      runtimeLabel="Existing Avantiqo Voice runtime"
      capabilities={[
        "Voice generation",
        "Governed provider routing",
        "Service-runtime controls",
        "Creative production handoff",
      ]}
      openSuffix="/design/production"
      openLabel="Open production workspace"
    />
  );
}
