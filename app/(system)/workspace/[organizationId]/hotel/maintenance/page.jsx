import { redirect } from "next/navigation";

export default function HotelMaintenanceRedirect({ params }) {
  redirect(
    `/workspace/${params.organizationId}/operations/maintenance`
  );
}
