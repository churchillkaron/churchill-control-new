import { createGuest } from "@/lib/hotel/createGuest";
import { getActiveOrganization } from "@/lib/workspace/getActiveOrganization";

export async function POST(req) {
  try {
    const body = await req.json();

    const organization = await getActiveOrganization();
    if (!organization)
      return new Response(JSON.stringify({ error: "Organization not found" }), { status: 400 });

    const guest = await createGuest({
      organizationId: organization.id,
      firstName: body.firstName,
      lastName: body.lastName,
      email: body.email,
      phone: body.phone,
      nationality: body.nationality,
      passportNumber: body.passportNumber,
      dateOfBirth: body.dateOfBirth,
      vipStatus: body.vipStatus,
      notes: body.notes
    });

    return new Response(JSON.stringify({ guest }), { status: 200 });

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
}
