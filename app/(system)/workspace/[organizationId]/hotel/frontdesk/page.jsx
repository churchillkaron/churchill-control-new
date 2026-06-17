"use client";

import { useEffect, useState } from "react";

export default function FrontDeskPage() {

  const [bookings, setBookings] =
    useState([]);

  const [loading, setLoading] =
    useState(true);

  async function loadBookings() {

    try {

      const res =
        await fetch(
          "/api/hotel/bookings/list"
        );

      const data =
        await res.json();

      setBookings(
        data.bookings || []
      );

    } catch (error) {

      console.error(error);

    } finally {

      setLoading(false);

    }

  }

  async function checkIn(
    bookingId
  ) {

    await fetch(
      "/api/hotel/bookings/check-in",
      {
        method: "POST",
        headers: {
          "Content-Type":
            "application/json",
        },
        body: JSON.stringify({
          bookingId,
        }),
      }
    );

    await loadBookings();

  }

  async function checkOut(
    bookingId
  ) {

    await fetch(
      "/api/hotel/bookings/check-out",
      {
        method: "POST",
        headers: {
          "Content-Type":
            "application/json",
        },
        body: JSON.stringify({
          bookingId,
        }),
      }
    );

    await loadBookings();

  }

  useEffect(() => {

    loadBookings();

  }, []);

  if (loading) {

    return (
      <div className="p-8">
        Loading Front Desk...
      </div>
    );

  }

  return (

    <div className="p-8">

      <h1 className="text-3xl font-bold mb-8">
        Front Desk
      </h1>

      <div className="space-y-4">

        {bookings.map(
          (booking) => (

          <div
            key={booking.id}
            className="border rounded-xl p-4"
          >

            <div>
              Guest:
              {" "}
              {booking.hotel_guests?.first_name}
              {" "}
              {booking.hotel_guests?.last_name}
            </div>

            <div>
              Room:
              {" "}
              {booking.hotel_rooms?.room_number}
            </div>

            <div>
              Status:
              {" "}
              {booking.status}
            </div>

            <div className="flex gap-2 mt-4">

              {booking.status ===
                "RESERVED" && (

                <button
                  onClick={() =>
                    checkIn(
                      booking.id
                    )
                  }
                >
                  Check In
                </button>

              )}

              {booking.status ===
                "CHECKED_IN" && (

                <button
                  onClick={() =>
                    checkOut(
                      booking.id
                    )
                  }
                >
                  Check Out
                </button>

              )}

            </div>

          </div>

        ))}

      </div>

    </div>

  );

}
