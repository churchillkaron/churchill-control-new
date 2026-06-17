"use client";

import { Bar } from "react-chartjs-2";

export default function RadiologyChart({ data }) {
  const chartData = {
    labels: data.map(d => d.date),
    datasets: [
      {
        label: "Radiology Orders",
        data: data.map(d => d.count),
        backgroundColor: "rgba(239, 68, 68, 0.7)"
      }
    ]
  };

  return <Bar data={chartData} />;
}
