import { createRoom } from "@/lib/hotel/createRoom";
import { getActiveOrganization } from "@/lib/workspace/getActiveOrganization";

export async function POST(req) {
  try {
    const body = await req.json();

    const organization = await getActiveOrganization();
    if (!organization)
      return new Response(JSON.stringify({ error: "Organization not found" }), { status: 400 });

    const room = await createRoom({
      organizationId: organization.id,
      propertyId: body.propertyId,
      roomNumber: body.roomNumber,
      roomName: body.roomName,
      roomType: body.roomType,
      floorNumber: body.floorNumber,
      maxGuests: body.maxGuests,
    });

    return new Response(JSON.stringify({ room }), { status: 200 });

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
}
