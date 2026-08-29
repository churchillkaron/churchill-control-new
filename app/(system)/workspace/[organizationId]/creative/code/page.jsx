export const dynamic = "force-dynamic";

import CreativeRuntimeEntryShell from "@/components/creative/runtime/CreativeRuntimeEntryShell";

export default async function CreativeCodePage({ params }) {
  const resolvedParams = await params;
  const organizationId = String(resolvedParams?.organizationId || "").trim();

  return (
    <CreativeRuntimeEntryShell
      organizationId={organizationId}
      eyebrow="Creative · Code"
      title="Code Studio"
      description="The customer-facing entry point for governed coding work inside Creative. The existing CodeWorkspaceRuntime remains the authority for workspace targets and command policy."
      statusLabel="Governed runtime · controller UI pending"
      statusDetail="CodeWorkspaceRuntime already supports governed SANDBOX and LOCAL_COMPUTER targets. No customer-facing controller currently invokes that runtime, so this surface intentionally does not open or execute a workspace directly."
      runtimeLabel="CodeWorkspaceRuntime · AVANTIQO_CODE_WORKSPACE_RUNTIME_V1"
      capabilities={[
        "Sandbox workspace target",
        "Local-computer workspace target",
        "Governed command policy",
        "Creative product entry",
      ]}
    />
  );
}
