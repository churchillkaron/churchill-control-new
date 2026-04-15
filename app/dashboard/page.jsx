"use client";

import { useEffect, useState } from "react";

function money(v) {
  return Number(v || 0).toFixed(0);
}

function percent(v) {
  return `${Number(v || 0).toFixed(1)}%`;
}

function TrendBar({ data, keyName }) {
  const max = Math.max(...data.map((d) => d[keyName]), 1);

  return (
    <div style={{ marginTop: 10 }}>
      {data.map((d, i) => (
        <div key={i} style={{ marginBottom: 6 }}>
          <div style={{ fontSize: 12 }}>{d.date.slice(0, 10)}</div>
          <div
            style={{
              height: 10,
              width: `${(d[keyName] / max) * 100}%`,
              background: "#666",
            }}
          />
        </div>
      ))}
    </div>
  );
}

export default function Dashboard() {
  const [data, setData] = useState([]);

  useEffect(() => {
    fetch("/api/history")
      .then((res) => res.json())
      .then((res) => setData(res || []));
  }, []);

  const summary = (() => {
    if (!data.length) return null;

    let totalRevenue = 0;
    let totalProfit = 0;

    data.forEach((d) => {
      totalRevenue += d.revenue;
      totalProfit += d.profit;
    });

    const avgMargin =
      totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0;

    const bestDay = [...data].sort((a, b) => b.profit - a.profit)[0];
    const worstDay = [...data].sort((a, b) => a.profit - b.profit)[0];

    return {
      totalRevenue,
      totalProfit,
      avgMargin,
      bestDay,
      worstDay,
    };
  })();

  const ai = (() => {
    if (data.length < 2) return ["⚠️ Not enough data yet"];

    const last = data[0];
    const prev = data[1];

    const diff = last.profit - prev.profit;

    const messages = [];

    if (diff < 0) {
      messages.push(
        `🔴 Profit dropped ${money(Math.abs(diff))} THB vs yesterday`
      );
    } else {
      messages.push(`🟢 Profit increased ${money(diff)} THB vs yesterday`);
    }

    if (summary.avgMargin < 50) {
      messages.push("🟡 Average margin is low — pricing needs review");
    }

    return messages;
  })();

  return (
    <div style={{ padding: 40, maxWidth: 1100, margin: "0 auto" }}>
      <h1>Business Dashboard</h1>

      {!data.length && <p>No data yet</p>}

      {summary && (
        <>
          {/* KPI */}
          <div style={{ display: "flex", gap: 20, marginTop: 20 }}>
            <div>Total Revenue: {money(summary.totalRevenue)}</div>
            <div>Total Profit: {money(summary.totalProfit)}</div>
            <div>Avg Margin: {percent(summary.avgMargin)}</div>
          </div>

          {/* AI */}
          <div style={{ marginTop: 20 }}>
            <h3>AI Insights</h3>
            {ai.map((m, i) => (
              <div key={i}>{m}</div>
            ))}
          </div>

          {/* CHARTS */}
          <div style={{ marginTop: 30 }}>
            <h3>Revenue Trend</h3>
            <TrendBar data={data} keyName="revenue" />

            <h3 style={{ marginTop: 20 }}>Profit Trend</h3>
            <TrendBar data={data} keyName="profit" />
          </div>

          {/* BEST / WORST */}
          <div style={{ marginTop: 30 }}>
            <h3>Best Day</h3>
            <p>
              {summary.bestDay.date.slice(0, 10)} —{" "}
              {money(summary.bestDay.profit)} THB
            </p>

            <h3>Worst Day</h3>
            <p>
              {summary.worstDay.date.slice(0, 10)} —{" "}
              {money(summary.worstDay.profit)} THB
            </p>
          </div>
        </>
      )}
    </div>
  );
}