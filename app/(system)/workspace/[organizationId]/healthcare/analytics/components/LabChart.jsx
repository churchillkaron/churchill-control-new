"use client";

import { Bar } from "react-chartjs-2";

export default function LabChart({ data }) {
  const chartData = {
    labels: data.map(d => d.date),
    datasets: [
      {
        label: "Lab Orders",
        data: data.map(d => d.count),
        backgroundColor: "rgba(16, 185, 129, 0.7)"
      }
    ]
  };

  return <Bar data={chartData} />;
}
