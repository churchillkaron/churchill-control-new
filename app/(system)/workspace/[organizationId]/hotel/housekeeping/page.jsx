import { redirect } from "next/navigation";

export default async function HotelHousekeepingRedirect({ params }) {
  const { organizationId } = await params;

  redirect(
    `/workspace/${encodeURIComponent(organizationId)}/operations/housekeeping`
  );
}
