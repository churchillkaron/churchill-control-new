"use client";

import { useEffect, useState } from "react";
import AppShell from "../AppShell";

export default function Payout() {
  const [revenue, setRevenue] = useState(0);
  const [serviceCharge, setServiceCharge] = useState(0);
  const [fohPool, setFohPool] = useState(0);
  const [staffBreakdown, setStaffBreakdown] = useState([]);

  useEffect(() => {
    const orders = JSON.parse(localStorage.getItem("orders")) || [];
    const history = JSON.parse(localStorage.getItem("history")) || [];

    const total = orders.reduce((sum, o) => sum + Number(o.total), 0);
    setRevenue(total);

    const level = Number(localStorage.getItem("serviceLevel")) || 5;
    const service = total * (level / 100);
    setServiceCharge(service);

    const fohBase = service * 0.5;
    setFohPool(fohBase);

    const staffLevelMap = {};

    history.forEach((day) => {
      if (!day.staff) return;

      day.staff.forEach((s) => {
        if (!staffLevelMap[s.name]) {
          staffLevelMap[s.name] = 0;
        }

        staffLevelMap[s.name] += Number(s.revenue);
      });
    });

    const getLevel = (revenue) => {
      if (revenue >= 100000) return 7;
      if (revenue >= 50000) return 6;
      return 5;
    };

    const staffMap = {};

    orders.forEach((order) => {
      if (!staffMap[order.staff]) {
        staffMap[order.staff] = 0;
      }
      staffMap[order.staff] += Number(order.total);
    });

    const totalFOHRevenue = Object.values(staffMap).reduce((a, b) => a + b, 0);

    const breakdown = Object.entries(staffMap).map(([name, value]) => {
      const share = totalFOHRevenue > 0 ? value / totalFOHRevenue : 0;

      const personalRevenue = staffLevelMap[name] || 0;
      const level = getLevel(personalRevenue);

      const multiplier = level / 5;

      const payout = fohBase * share * multiplier;

      return {
        name,
        revenue: value,
        level,
        payout,
      };
    });

    setStaffBreakdown(breakdown);
  }, []);

  return (
    <AppShell>
      <div className="space-y-14">

        {/* HEADER */}
        <div className="space-y-2">
          <h1 className="text-3xl font-medium text-white/90">
            Payout System
          </h1>
          <p className="text-white/50 text-sm">
            Real-time service charge distribution and staff performance payout
          </p>
        </div>

        {/* FINANCIAL HERO */}
        <div className="relative">
          <div className="absolute -inset-6 bg-[#ff7a00]/10 blur-3xl rounded-[32px]" />

          <div className="relative rounded-[28px] border border-white/10 bg-white/[0.06] backdrop-blur-xl p-8
            shadow-[0_30px_80px_rgba(0,0,0,0.6)]"
          >

            <div className="grid md:grid-cols-3 gap-6 text-sm">

              <div>
                <div className="text-white/40">Revenue</div>
                <div className="text-lg">
                  THB {revenue.toLocaleString()}
                </div>
              </div>

              <div>
                <div className="text-white/40">Service Charge</div>
                <div className="text-lg">
                  THB {serviceCharge.toLocaleString()}
                </div>
              </div>

              <div>
                <div className="text-white/40">FOH Pool</div>
                <div className="text-lg text-[#ff7a00] font-medium">
                  THB {fohPool.toLocaleString()}
                </div>
              </div>

            </div>

          </div>
        </div>

        {/* STAFF BREAKDOWN */}
        <div className="space-y-6">

          <h2 className="text-xl text-white/80">
            FOH Staff Breakdown
          </h2>

          {staffBreakdown.length === 0 && (
            <div className="relative">
              <div className="absolute -inset-2 bg-white/5 blur-xl rounded-xl" />
              <div className="relative text-white/40 p-6 rounded-xl border border-white/10 bg-white/[0.04]">
                No active orders
              </div>
            </div>
          )}

          {staffBreakdown.map((s, i) => (
            <div key={i} className="relative">

              <div className="absolute -inset-3 bg-white/5 blur-2xl rounded-2xl" />

              <div className="relative bg-white/[0.06] backdrop-blur-xl border border-white/10 p-6 rounded-2xl
                shadow-[0_25px_70px_rgba(0,0,0,0.6)]"
              >

                {/* TOP ROW */}
                <div className="flex justify-between items-center mb-3">
                  <div className="text-lg font-medium">
                    {s.name}
                  </div>

                  <div className="text-[#ff7a00] font-medium">
                    THB {Math.round(s.payout).toLocaleString()}
                  </div>
                </div>

                {/* DETAILS */}
                <div className="text-sm text-white/60 space-y-1">
                  <div>
                    Revenue: THB {s.revenue.toLocaleString()}
                  </div>

                  <div>
                    Level: {s.level}%
                  </div>
                </div>

              </div>

            </div>
          ))}

        </div>

      </div>
    </AppShell>
  );
}