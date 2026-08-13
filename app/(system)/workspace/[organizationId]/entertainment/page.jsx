import { redirect } from "next/navigation";

export default async function EntertainmentPage({ params }) {
  const { organizationId } = await params;

  redirect(
    `/workspace/${organizationId}/operations/venue`
  );
}
