"use client";

import { Bar } from "react-chartjs-2";

export default function PatientsChart({ data }) {
  const chartData = {
    labels: data.map(d => d.date),
    datasets: [
      {
        label: "New Patients",
        data: data.map(d => d.count),
        backgroundColor: "rgba(59, 130, 246, 0.7)"
      }
    ]
  };

  return <Bar data={chartData} />;
}
