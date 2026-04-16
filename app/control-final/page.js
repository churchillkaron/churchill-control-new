"use client";

import { useEffect, useState } from "react";
import { getControlData } from "../../lib/controlLogic";

export default function ControlFinal() {
  const [user, setUser] = useState("");
  const [role, setRole] = useState("");
  const [shift, setShift] = useState(null);
  const [error, setError] = useState("");
  const [locationStatus, setLocationStatus] = useState("");

  // 📍 TARGET LOCATION (your venue)
  const TARGET_LAT = 7.8804;
  const TARGET_LNG = 98.3923;
  const MAX_DISTANCE = 0.001; // approx ~100m

  useEffect(() => {
    setUser(localStorage.getItem("staffName") || "");
    setRole(localStorage.getItem("staffRole") || "");

    const savedShift = localStorage.getItem("shift");
    if (savedShift) {
      setShift(JSON.parse(savedShift));
    }
  }, []);

  // 📍 GET LOCATION
  const checkLocation = async () => {
    return new Promise((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const lat = pos.coords.latitude;
          const lng = pos.coords.longitude;

          const distance =
            Math.abs(lat - TARGET_LAT) + Math.abs(lng - TARGET_LNG);

          if (distance < MAX_DISTANCE) {
            setLocationStatus("Inside work zone");
            resolve(true);
          } else {
            setLocationStatus("Outside work zone");
            resolve(false);
          }
        },
        () => {
          setLocationStatus("Location blocked");
          reject(false);
        }
      );
    });
  };

  const handleClockIn = async () => {
    if (shift && !shift.end) {
      setError("Already clocked in");
      return;
    }

    const valid = await checkLocation();

    if (!valid) {
      setError("You must be at the venue to clock in");
      return;
    }

    const newShift = {
      start: new Date().toISOString(),
      end: null,
    };

    localStorage.setItem("shift", JSON.stringify(newShift));
    setShift(newShift);
    setError("");
  };

  const handleClockOut = () => {
    if (!shift || shift.end) {
      setError("Not clocked in");
      return;
    }

    const updated = {
      ...shift,
      end: new Date().toISOString(),
    };

    localStorage.setItem("shift", JSON.stringify(updated));
    setShift(updated);
    setError("");
  };

  const getDuration = () => {
    if (!shift?.start) return null;

    const start = new Date(shift.start);
    const end = shift.end ? new Date(shift.end) : new Date();

    const diff = Math.floor((end - start) / 60000);
    const hours = Math.floor(diff / 60);
    const minutes = diff % 60;

    return `${hours}h ${minutes}m`;
  };

  const {
    data,
    profit,
    payoutStatus,
    payoutLevel,
    staffWithPayout,
  } = getControlData();

  return (
    <div className="relative min-h-screen text-white">

      <div className="absolute inset-0 -z-30">
        <img src="/bg-hero-control.jpg" className="w-full h-full object-cover" />
      </div>

      <div className="absolute inset-0 -z-20 bg-black/70" />

      <div className="relative z-10 max-w-7xl mx-auto px-6 pt-28 pb-16 space-y-10">

        <div className="bg-white/10 backdrop-blur-xl rounded-3xl p-8 space-y-10">

          {/* USER */}
          <div className="flex justify-between text-sm text-white/60">
            <div>{user}</div>
            <div>{role}</div>
          </div>

          <h1 className="text-2xl">Control Final</h1>

          {/* 📍 SHIFT + GPS */}
          <div className="bg-black/40 p-6 rounded-xl space-y-4">

            <h2>Shift Control (GPS Protected)</h2>

            <p className="text-sm text-white/60">
              Location: {locationStatus || "Not checked"}
            </p>

            <button
              onClick={handleClockIn}
              className="px-4 py-2 bg-green-600 rounded-xl"
            >
              Clock In
            </button>

            <button
              onClick={handleClockOut}
              className="px-4 py-2 bg-red-600 rounded-xl"
            >
              Clock Out
            </button>

            {shift?.start && (
              <p>Start: {new Date(shift.start).toLocaleTimeString()}</p>
            )}

            {shift?.end && (
              <p>End: {new Date(shift.end).toLocaleTimeString()}</p>
            )}

            {shift?.start && <p>Duration: {getDuration()}</p>}

            {error && <p className="text-red-400">{error}</p>}

          </div>

          {/* OWNER */}
          {role === "Owner" && (
            <div className="grid md:grid-cols-3 gap-6">
              <div className="bg-black/40 p-6 rounded-xl">
                <p>Revenue</p>
                <h2>{data.revenue}</h2>
              </div>

              <div className="bg-black/40 p-6 rounded-xl">
                <p>Profit</p>
                <h2>{profit}</h2>
              </div>

              <div className="bg-black/40 p-6 rounded-xl">
                <p>Status</p>
                <h2>{payoutStatus} ({payoutLevel}%)</h2>
              </div>
            </div>
          )}

          {/* STAFF */}
          {role !== "Owner" && (
            <div className="bg-black/40 p-6 rounded-xl">
              <p>Your Performance</p>

              {staffWithPayout
                .filter(s => s.name === user)
                .map((s, i) => (
                  <div key={i}>
                    <p>Score: {s.score}</p>
                    <p className="text-[#ffb36b]">THB {s.payout}</p>
                  </div>
                ))}
            </div>
          )}

        </div>
      </div>
    </div>
  );
}