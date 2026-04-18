"use client";

import { useState } from "react";
import AppShell from "../AppShell";

export default function StaffReview() {
  const [image, setImage] = useState(null);
  const [status, setStatus] = useState("");
  const [result, setResult] = useState(null);

  const staffName = localStorage.getItem("staff_name") || "Unknown";

  const handleUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();

    reader.onloadend = () => {
      setImage(reader.result);
      setResult(null);
      setStatus("");
    };

    reader.readAsDataURL(file);
  };

  const runAI = async () => {
    if (!image) return alert("Upload screenshot first");

    try {
      setStatus("Reading review...");

      const res = await fetch("/api/review-ai", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ image }),
      });

      const data = await res.json();

      if (!data?.rating) {
        setStatus("Failed to detect review");
        return;
      }

      const review = {
        staff: staffName,
        rating: data.rating,
        text: data.text || "",
        platform: data.platform || "Unknown",
        date: new Date().toLocaleDateString("en-GB"),
      };

      const existing =
        JSON.parse(localStorage.getItem("reviews") || "[]");

      const updated = [review, ...existing];

      localStorage.setItem("reviews", JSON.stringify(updated));

      setResult(review);
      setStatus("Review saved");
    } catch {
      setStatus("AI error");
    }
  };

  return (
    <AppShell>
      <div className="space-y-10">

        <h1 className="text-3xl text-white">
          Upload Customer Review
        </h1>

        <input type="file" onChange={handleUpload} />

        {image && (
          <img src={image} className="w-64 rounded" />
        )}

        <button
          onClick={runAI}
          className="bg-[#ff7a00] px-6 py-2 rounded"
        >
          Analyze Review
        </button>

        {status && <p className="text-white/50">{status}</p>}

        {result && (
          <div className="bg-white/5 p-4 rounded">
            <p>⭐ Rating: {result.rating}</p>
            <p className="text-sm text-white/50">
              {result.text}
            </p>
          </div>
        )}

      </div>
    </AppShell>
  );
}