import PestControlMonitoringExceptionWorkspace from "@/components/workspace/operations/pest-control/PestControlMonitoringExceptionWorkspace";

export default async function Page({ params }) {
  const { organizationId } = await params;
  return <PestControlMonitoringExceptionWorkspace organizationId={organizationId} />;
}
