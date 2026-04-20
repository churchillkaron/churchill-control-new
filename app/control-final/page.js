"use client";

import { useEffect, useState } from "react";
import AppShell from "../AppShell";
import {
  calculateFOH,
  getPerformanceLevel,
  getServiceLevel,
} from "@/lib/performance";

export default function ControlFinalPage() {
  const [orders, setOrders] = useState([]);
  const [staff, setStaff] = useState([]);
  const [attendance, setAttendance] = useState({});

  useEffect(() => {
    loadOrders();
    loadStaff();
    loadAttendance();
  }, []);

  const loadOrders = () => {
    const stored = JSON.parse(localStorage.getItem("orders") || "[]");
    setOrders(stored);
  };

  const loadStaff = () => {
    const stored = JSON.parse(localStorage.getItem("staff") || "[]");
    setStaff(stored);
  };

  const loadAttendance = () => {
    const stored = JSON.parse(localStorage.getItem("attendance") || "{}");
    setAttendance(stored);
  };

  const saveOrders = (updatedOrders) => {
    localStorage.setItem("orders", JSON.stringify(updatedOrders));
    setOrders(updatedOrders);
  };

  const approve = (orderId, adjId) => {
    const updated = orders.map((o) => {
      if (o.id !== orderId) return o;

      return {
        ...o,
        adjustmentRequests: (o.adjustmentRequests || []).map((a) =>
          a.id === adjId
            ? {
                ...a,
                status: "approved",
                approvedBy: "manager",
                approved_at: new Date().toISOString(),
              }
            : a
        ),
      };
    });

    saveOrders(updated);
  };

  const reject = (orderId, adjId) => {
    const updated = orders.map((o) => {
      if (o.id !== orderId) return o;

      return {
        ...o,
        adjustmentRequests: (o.adjustmentRequests || []).map((a) =>
          a.id === adjId
            ? { ...a, status: "rejected" }
            : a
        ),
      };
    });

    saveOrders(updated);
  };

  const adjustments = orders.flatMap((o) =>
    (o.adjustmentRequests || []).map((a) => ({
      ...a,
      orderId: o.id,
      table: o.table,
    }))
  );

  const subtotal = orders.reduce(
    (sum, o) => sum + o.items.reduce((s, i) => s + i.price, 0),
    0
  );

  const discountTotal = adjustments.reduce((sum, a) => {
    if (a.status !== "approved") return sum;

    if (a.type === "discount") {
      if (a.mode === "percent") {
        return sum + (subtotal * a.value) / 100;
      }
      return sum + a.value;
    }

    if (a.type === "comp") {
      return sum + a.value;
    }

    return sum;
  }, 0);

  const finalRevenue = subtotal - discountTotal;

  // 🔥 PERFORMANCE ENGINE
  const foh = calculateFOH(orders);
  const performance = getPerformanceLevel(foh.score);
  const servicePercent = getServiceLevel(foh.score) / 100;

  const servicePool = finalRevenue * servicePercent;

  // 🔥 STAFF PAYOUT (WITH PERFORMANCE)
  const calculateStaff = () => {
    if (!staff || staff.length === 0) return [];

    const enriched = staff.map((s) => {
      const att = attendance[s.id] || {};

      if (!att.present) {
        return { ...s, weight: 0 };
      }

      const hours = att.hours || 0;
      const score = s.score || 0;
      const penalty = att.penalty || 0;

      let weight = score * hours;

      // penalty
      weight = weight * (1 - penalty / 100);

      // 🔥 PERFORMANCE MULTIPLIER
      weight = weight * performance.multiplier;

      return {
        ...s,
        weight,
        hours,
        score,
        penalty,
      };
    });

    const totalWeight = enriched.reduce((sum, s) => sum + s.weight, 0);

    if (totalWeight === 0) return [];

    return enriched.map((s) => {
      const payout = (s.weight / totalWeight) * servicePool;

      return {
        id: s.id,
        name: s.name,
        role: s.role,
        score: s.score,
        hours: s.hours,
        penalty: s.penalty || 0,
        payrollAmount: Math.round(payout),
      };
    });
  };

  const saveDay = () => {
    const history = JSON.parse(localStorage.getItem("history") || "[]");

    const calculatedStaff = calculateStaff();

    const newDay = {
      id: Date.now(),
      date: new Date().toISOString(),

      orders,
      adjustments,

      subtotal,
      discountTotal,
      finalRevenue,

      performance: {
        score: foh.score,
        level: performance.level,
        servicePercent: servicePercent * 100,
      },

      servicePool,
      staff: calculatedStaff,

      created_at: new Date().toISOString(),
    };

    history.push(newDay);

    localStorage.setItem("history", JSON.stringify(history));
    localStorage.removeItem("orders");

    alert("Day Closed & Saved");
    setOrders([]);
  };

  return (
    <AppShell showNav={true}>
      <div className="text-white space-y-6">

        <h1>Control Final</h1>

        {/* 🔥 PERFORMANCE PANEL */}
        <div className="bg-white/5 p-4 rounded space-y-2">
          <div>Revenue: {finalRevenue}</div>
          <div>Score: {foh.score}</div>
          <div>Level: {performance.level}</div>
          <div>Service %: {servicePercent * 100}%</div>
        </div>

        {/* STAFF PREVIEW */}
        <div className="bg-white/5 p-4 rounded space-y-2">
          <div className="text-sm text-white/50">Staff Preview</div>

          {calculateStaff().map((s) => (
            <div key={s.id} className="flex justify-between text-sm">
              <div>
                {s.name} ({s.hours}h / -{s.penalty}%)
              </div>
              <div>{s.payrollAmount} THB</div>
            </div>
          ))}
        </div>

        <button
          onClick={saveDay}
          className="w-full bg-orange-500 py-3 rounded text-black"
        >
          CLOSE DAY
        </button>

      </div>
    </AppShell>
  );
}