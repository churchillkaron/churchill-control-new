import { createProperty } from "@/lib/hotel/createProperty";
import { getActiveOrganization } from "@/lib/workspace/getActiveOrganization";

export async function POST(req) {
  try {
    const body = await req.json();

    const organization = await getActiveOrganization();

    if (!organization) {
      return new Response(
        JSON.stringify({ error: "Organization not found" }),
        { status: 400 }
      );
    }

    const property = await createProperty({
      organizationId: organization.id,
      name: body.name,
      address: body.address,
      city: body.city,
      country: body.country,
    });

    return new Response(
      JSON.stringify({ property }),
      { status: 200 }
    );

  } catch (err) {
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500 }
    );
  }
}
