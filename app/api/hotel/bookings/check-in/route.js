import { checkInGuest }
from "@/lib/hotel/checkInGuest";

export async function POST(req) {

  try {

    const body =
      await req.json();

    const booking =
      await checkInGuest({
        bookingId:
          body.bookingId,
      });

    return Response.json({
      success: true,
      booking,
    });

  } catch (error) {

    return Response.json(
      {
        error:
          error.message,
      },
      {
        status: 500,
      }
    );

  }

}
