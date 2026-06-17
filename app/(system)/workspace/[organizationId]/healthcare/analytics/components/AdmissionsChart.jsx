"use client";

import { Bar } from "react-chartjs-2";

export default function AdmissionsChart({ data }) {
  const chartData = {
    labels: data.map(d => d.date),
    datasets: [
      {
        label: "Admissions",
        data: data.map(d => d.count),
        backgroundColor: "rgba(245, 158, 11, 0.7)"
      }
    ]
  };

  return <Bar data={chartData} />;
}
