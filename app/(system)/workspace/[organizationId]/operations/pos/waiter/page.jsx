import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default function LegacyWaiterPOSPage({ params }) {
  const organizationId = params?.organizationId || "";

  redirect(
    `/workspace/${encodeURIComponent(
      organizationId
    )}/operations/pos?view=waiter`
  );
}
