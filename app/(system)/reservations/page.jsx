"use client";

import { useEffect, useState } from "react";
import {
  getReservations,
  updateReservation,
} from "@/lib/reservations";
import { saveVisit } from "@/lib/visits";

export default function SystemReservations() {
  const [reservations, setReservations] = useState([]);
  const [activeVisit, setActiveVisit] = useState(null);

  const [visitData, setVisitData] = useState({
    spend: "",
    hadDinner: false,
    hadDrinks: false,
    playedGames: false,
    liveMusic: false,
  });

  const loadData = () => {
    setReservations(getReservations());
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleStatus = (r, status) => {
    updateReservation(r.id, { status });

    if (status === "completed") {
      setActiveVisit(r);
      return;
    }

    if (status === "no-show") {
      saveVisit({
        reservationId: r.id,
        customerId: r.customerId,
        status: "no-show",
      });
    }

    loadData();
  };

  const handleSaveVisit = () => {
    saveVisit({
      reservationId: activeVisit.id,
      customerId: activeVisit.customerId,
      status: "completed",
      spend: Number(visitData.spend),

      hadDinner: visitData.hadDinner,
      hadDrinks: visitData.hadDrinks,
      playedGames: visitData.playedGames,
      liveMusic: visitData.liveMusic,
    });

    setActiveVisit(null);

    setVisitData({
      spend: "",
      hadDinner: false,
      hadDrinks: false,
      playedGames: false,
      liveMusic: false,
    });

    loadData();
  };

  return (
    <main className="min-h-screen bg-[#0b0b0b] text-white p-6">

      <h1 className="text-3xl font-semibold mb-6">
        Reservations
      </h1>

      <div className="space-y-4">

        {reservations.map((r) => (
          <div
            key={r.id}
            className="p-5 rounded-xl bg-white/5 border border-white/10"
          >

            <div className="flex justify-between mb-3">
              <div>
                <p className="text-lg">{r.name}</p>
                <p className="text-sm text-gray-400">
                  {r.date} · {r.time} · {r.guests}
                </p>
              </div>

              <p className="text-sm text-gray-400">
                {r.status}
              </p>
            </div>

            <div className="flex gap-2 flex-wrap">

              <button
                onClick={() => handleStatus(r, "confirmed")}
                className="px-3 py-1 bg-blue-600 rounded text-xs"
              >
                Confirm
              </button>

              <button
                onClick={() => handleStatus(r, "seated")}
                className="px-3 py-1 bg-purple-600 rounded text-xs"
              >
                Seat
              </button>

              <button
                onClick={() => handleStatus(r, "completed")}
                className="px-3 py-1 bg-green-600 rounded text-xs"
              >
                Complete
              </button>

              <button
                onClick={() => handleStatus(r, "no-show")}
                className="px-3 py-1 bg-red-600 rounded text-xs"
              >
                No-show
              </button>

            </div>

          </div>
        ))}

      </div>

      {/* 🔥 VISIT INPUT MODAL */}
      {activeVisit && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center">

          <div className="bg-[#111] p-6 rounded-xl w-full max-w-md">

            <h2 className="text-xl mb-4">
              Complete Visit: {activeVisit.name}
            </h2>

            <input
              type="number"
              placeholder="Total Spend (THB)"
              value={visitData.spend}
              onChange={(e) =>
                setVisitData({ ...visitData, spend: e.target.value })
              }
              className="w-full p-3 mb-4 bg-black border border-white/20 rounded"
            />

            <div className="space-y-2 mb-4">

              <label>
                <input
                  type="checkbox"
                  checked={visitData.hadDinner}
                  onChange={() =>
                    setVisitData({
                      ...visitData,
                      hadDinner: !visitData.hadDinner,
                    })
                  }
                />{" "}
                Dinner
              </label>

              <label>
                <input
                  type="checkbox"
                  checked={visitData.hadDrinks}
                  onChange={() =>
                    setVisitData({
                      ...visitData,
                      hadDrinks: !visitData.hadDrinks,
                    })
                  }
                />{" "}
                Drinks
              </label>

              <label>
                <input
                  type="checkbox"
                  checked={visitData.playedGames}
                  onChange={() =>
                    setVisitData({
                      ...visitData,
                      playedGames: !visitData.playedGames,
                    })
                  }
                />{" "}
                Games
              </label>

              <label>
                <input
                  type="checkbox"
                  checked={visitData.liveMusic}
                  onChange={() =>
                    setVisitData({
                      ...visitData,
                      liveMusic: !visitData.liveMusic,
                    })
                  }
                />{" "}
                Live Music
              </label>

            </div>

            <button
              onClick={handleSaveVisit}
              className="w-full py-3 bg-[#ff7a00] rounded"
            >
              Save Visit
            </button>

          </div>

        </div>
      )}

    </main>
  );
}