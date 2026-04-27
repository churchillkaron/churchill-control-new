"use client";

import { useState } from "react";
import something from "@lib/branding"
export default function BrandPage() {
  const [name, setName] = useState("");
  const [logo, setLogo] = useState("");
  const [color, setColor] = useState("#f97316");

  function apply() {
    setBranding({
      name,
      logo,
      primary: color,
    });

    location.reload();
  }

  return (
    <div className="min-h-screen bg-black text-white p-10">

      <h1 className="text-2xl mb-6">White Label Setup</h1>

      <input
        placeholder="Brand Name"
        onChange={(e) => setName(e.target.value)}
        className="block mb-4 p-2 bg-white/10"
      />

      <input
        placeholder="Logo (text)"
        onChange={(e) => setLogo(e.target.value)}
        className="block mb-4 p-2 bg-white/10"
      />

      <input
        type="color"
        onChange={(e) => setColor(e.target.value)}
        className="block mb-4"
      />

      <button
        onClick={apply}
        className="bg-orange-500 px-4 py-2 rounded text-black"
      >
        Apply Branding
      </button>

    </div>
  );
}