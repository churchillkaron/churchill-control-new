"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

import {
  calculateFOH,
  getPerformanceLevel,
  getServiceLevel,
} from "@/lib/performance";

export default function ControlFinalPage() {
  const [orders, setOrders] = useState([]);
  const [staff, setStaff] = useState([]);
  const [attendance, setAttendance] = useState({});

  const [payrollLocked, setPayrollLocked] = useState(false);
  const [currentMonth, setCurrentMonth] = useState("");

  useEffect(() => {
    loadOrders();
    loadStaff();
    loadAttendance();
    checkPayrollLock();
  }, []);

  const getMonthKey = () => {
    const now = new Date();
    return `${now.getFullYear()}-${now.getMonth() + 1}`;
  };

  const checkPayrollLock = () => {
    const lock = localStorage.getItem("payroll_locked") === "true";
    const month = localStorage.getItem("payroll_month");
    const current = getMonthKey();

    if (month !== current) {
      localStorage.setItem("payroll_locked", "false");
      localStorage.setItem("payroll_month", current);
      setPayrollLocked(false);
    } else {
      setPayrollLocked(lock);
    }

    setCurrentMonth(current);
  };

  const lockPayroll = () => {
    const ready = localStorage.getItem("system_ready_for_payroll");

    if (ready !== "true") {
      alert("System not ready. Finalize approvals first.");
      return;
    }

    localStorage.setItem("payroll_locked", "true");
    setPayrollLocked(true);
    alert("Payroll locked for this month");
  };

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

  const adjustments = orders.flatMap((order) =>
    (order.adjustmentRequests || []).map((adjustment) => ({
      ...adjustment,
      orderId: order.id,
      table: order.table,
    }))
  );

  const subtotal = orders.reduce((sum, order) => {
    const orderTotal = (order.items || []).reduce(
      (itemSum, item) => itemSum + Number(item.price || 0),
      0
    );

    return sum + orderTotal;
  }, 0);

  const discountTotal = adjustments.reduce((sum, adjustment) => {
    if (adjustment.status !== "approved") return sum;

    if (adjustment.type === "discount") {
      if (adjustment.mode === "percent") {
        return sum + (subtotal * Number(adjustment.value || 0)) / 100;
      }

      return sum + Number(adjustment.value || 0);
    }

    if (adjustment.type === "comp") {
      return sum + Number(adjustment.value || 0);
    }

    return sum;
  }, 0);

  const finalRevenue = subtotal - discountTotal;

  const foh = calculateFOH(orders);
  const performance = getPerformanceLevel(foh.score);
  const servicePercent = getServiceLevel(foh.score) / 100;
  const servicePool = finalRevenue * servicePercent;

  const calculateStaff = () => {
    if (!staff || staff.length === 0) return [];

    const enriched = staff.map((staffMember) => {
      const att = attendance[staffMember.id] || {};

      if (!att.present) {
        return {
          ...staffMember,
          weight: 0,
          hours: 0,
          score: staffMember.score || 0,
          penalty: att.penalty || 0,
        };
      }

      const hours = Number(att.hours || 0);
      const score = Number(staffMember.score || 0);
      const penalty = Number(att.penalty || 0);

      let weight = score * hours;
      weight = weight * (1 - penalty / 100);
      weight = weight * performance.multiplier;

      return {
        ...staffMember,
        weight,
        hours,
        score,
        penalty,
      };
    });

    const totalWeight = enriched.reduce(
      (sum, staffMember) => sum + Number(staffMember.weight || 0),
      0
    );

    if (totalWeight === 0) return [];

    return enriched.map((staffMember) => {
      const payout = (staffMember.weight / totalWeight) * servicePool;

      return {
        id: staffMember.id,
        name: staffMember.name,
        role: staffMember.role,
        score: staffMember.score || 0,
        hours: staffMember.hours || 0,
        penalty: staffMember.penalty || 0,
        payrollAmount: Math.round(payout),
      };
    });
  };

  const saveDay = async () => {
    if (payrollLocked) {
      alert("Payroll is locked. Cannot close new days.");
      return;
    }

    const calculatedStaff = calculateStaff();

    const tenant_id = "76e2caa6-dd78-49e5-b0f5-1ff94185c2d4";

    const { error } = await supabase.from("history_days").insert([
      {
        day_date: new Date().toISOString(),

        orders: orders || [],
        subtotal: Number(subtotal || 0),
        discount_total: Number(discountTotal || 0),
        final_revenue: Number(finalRevenue || 0),
        adjustments: adjustments || [],

        revenue: Number(finalRevenue || 0),
        service_charge: Number(servicePool || 0),
        service_pool: Number(servicePool || 0),
        payout_pool: Number(servicePool || 0),
        payout_status: "locked",

        foh_score: Number(foh.score || 0),
        bar_score: 0,
        kitchen_score: 0,

        staff_data: calculatedStaff || [],
        tenant_id,
      },
    ]);

    if (error) {
      console.error("SAVE ERROR:", error);
      alert("Error saving day");
      return;
    }

    localStorage.removeItem("orders");
    setOrders([]);

    alert("Day Closed & Locked");
  };

  return (
    <div className="text-white space-y-6">
      <h1>Control Final</h1>

      <div className="bg-white/5 p-4 rounded flex justify-between">
        <div>
          <div className="text-white/50 text-sm">Payroll Status</div>
          <div className={payrollLocked ? "text-red-400" : "text-green-400"}>
            {payrollLocked ? "LOCKED" : "OPEN"}
          </div>
          <div className="text-white/40 text-xs mt-1">
            Month: {currentMonth}
          </div>
        </div>

        {!payrollLocked && (
          <button onClick={lockPayroll} className="bg-red-500 px-4 py-2 rounded">
            Lock Month
          </button>
        )}
      </div>

      <div className="bg-white/5 p-4 rounded space-y-2">
        <div>Subtotal: {subtotal}</div>
        <div>Discounts: -{discountTotal}</div>
        <div>Revenue: {finalRevenue}</div>
        <div>Score: {foh.score}</div>
        <div>Level: {performance.level}</div>
        <div>Service %: {servicePercent * 100}%</div>
        <div>Service Pool: {Math.round(servicePool)} THB</div>
      </div>

      <div className="bg-white/5 p-4 rounded space-y-2">
        <div className="text-sm text-white/50">Staff Preview</div>

        {calculateStaff().length === 0 && (
          <div className="text-white/40 text-sm">No staff payout data</div>
        )}

        {calculateStaff().map((staffMember) => (
          <div key={staffMember.id} className="flex justify-between text-sm">
            <div>
              {staffMember.name} ({staffMember.hours}h / -
              {staffMember.penalty}%)
            </div>
            <div>{staffMember.payrollAmount} THB</div>
          </div>
        ))}
      </div>

      <button
        onClick={saveDay}
        disabled={orders.length === 0}
        className={`w-full py-3 rounded text-black ${
          orders.length === 0
            ? "bg-white/30 cursor-not-allowed"
            : "bg-orange-500"
        }`}
      >
        CLOSE DAY
      </button>
    </div>
  );
}