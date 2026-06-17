import { getAvailability } from "@/lib/hotel/getAvailability";
import { getActiveOrganization } from "@/lib/workspace/getActiveOrganization";

export async function POST(req) {
  try {
    const body = await req.json();

    const organization = await getActiveOrganization();
    if (!organization)
      return new Response(JSON.stringify({ error: "Organization not found" }), { status: 400 });

    const rooms = await getAvailability({
      organizationId: organization.id,
      propertyId: body.propertyId,
      checkInDate: body.checkInDate,
      checkOutDate: body.checkOutDate,
    });

    return new Response(JSON.stringify({ rooms }), { status: 200 });

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
}
