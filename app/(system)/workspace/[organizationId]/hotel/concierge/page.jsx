import { redirect } from "next/navigation";

export default async function ConciergePage({ params }) {
  const { organizationId } = await params;

  redirect(
    `/workspace/${organizationId}/operations/concierge`
  );
}
