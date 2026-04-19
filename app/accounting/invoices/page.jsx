"use client";

import { useState } from "react";

export default function InvoicesPage() {
  const [image, setImage] = useState("");
  const [result, setResult] = useState(null);

  const handleAnalyze = async () => {
    const res = await fetch("/api/invoice", {
      method: "POST",
      body: JSON.stringify({ image }),
      headers: { "Content-Type": "application/json" },
    });

    const data = await res.json();
    setResult(data);
  };

  return (
    <div style={{ padding: 20 }}>
      <h1>Invoice AI</h1>

      <input
        placeholder="Paste image URL or base64"
        value={image}
        onChange={(e) => setImage(e.target.value)}
        style={{ width: "100%", marginBottom: 10 }}
      />

      <button onClick={handleAnalyze}>Analyze</button>

      <pre>{JSON.stringify(result, null, 2)}</pre>
    </div>
  );
}