import { checkOutGuest } from "@/lib/hotel/checkOutGuest";

export async function POST(req) {
  try {
    const body = await req.json();

    const booking = await checkOutGuest({
      bookingId: body.bookingId,
    });

    return Response.json({
      success: true,
      booking,
    });
  } catch (error) {
    return Response.json(
      { error: error.message },
      { status: 500 }
    );
  }
}
