"use client";

import { useEffect, useState } from "react";


export default function ControlFinal() {
  const [revenue, setRevenue] = useState(0);

  useEffect(() => {
    const loadData = () => {
      try {
        const raw = localStorage.getItem("history_day");

        if (!raw) {
          setRevenue(0);
          return;
        }

        const data = JSON.parse(raw);

        setRevenue(data.revenue || 0);
      } catch (e) {
        console.error("Error reading history_day", e);
      }
    };

    loadData();

    // 🔥 FORCE reliable refresh
    window.addEventListener("storage", loadData);

    const interval = setInterval(loadData, 500);

    return () => {
      clearInterval(interval);
      window.removeEventListener("storage", loadData);
    };
  }, []);

  const serviceCharge = Math.round(revenue * 0.05);

  return (
  
      <div className="space-y-10">

        <div>
          <p className="text-xs uppercase tracking-[0.25em] text-white/40">
            Control Final
          </p>
          <h1 className="text-3xl md:text-5xl font-semibold mt-2">
            End-of-Day Control
          </h1>
        </div>

        <div className="relative">
          <div className="absolute -inset-4 bg-[#ff7a00]/10 blur-2xl rounded-3xl" />

          <div className="relative rounded-3xl border border-white/10 bg-white/[0.05] backdrop-blur-2xl p-6 md:p-8 shadow-[0_25px_80px_rgba(0,0,0,0.6)] flex justify-between items-center">

            <div>
              <p className="text-white/50 text-sm">
                Today Revenue
              </p>

              <div className="text-4xl md:text-6xl font-semibold mt-2">
                THB {revenue.toLocaleString()}
              </div>

              <p className="text-white/50 mt-3">
                Service Charge (5%): THB {serviceCharge.toLocaleString()}
              </p>
            </div>

            <button className="bg-[#ff7a00] px-6 py-3 rounded-xl text-black font-semibold">
              Close Day
            </button>

          </div>

        </div>

      </div>
   
  );
}