import { redirect } from "next/navigation";

export default async function Page({ params }) {
  const { organizationId, occurrenceId } = await params;
  redirect(`/workspace/${encodeURIComponent(organizationId)}/operations/field-service/evidence/${encodeURIComponent(occurrenceId)}?from=technician`);
}
