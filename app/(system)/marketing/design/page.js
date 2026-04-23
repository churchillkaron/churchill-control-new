"use client";

import { useState } from "react";

const PRESETS = [
  { title: "Luxury Cinematic", style: "luxury" },
  { title: "High-Energy Social", style: "party" },
  { title: "Elegant Brand Story", style: "minimal" },
];

export default function Page() {
  const [step, setStep] = useState(1);
  const [images, setImages] = useState([]);
  const [selectedIndex, setSelectedIndex] = useState(null);
  const [loading, setLoading] = useState(false);

  const [format, setFormat] = useState("image");
  const [platform, setPlatform] = useState("instagram");

  const [idea, setIdea] = useState("beach sunset");
  const [mood, setMood] = useState("luxury");
  const [time, setTime] = useState("golden hour");

  const [caption, setCaption] = useState(
    "Step into a new level of hospitality."
  );

  const [hashtags, setHashtags] = useState(
    "#LuxuryHospitality #BeachClub #Phuket"
  );

  function buildPrompt(style) {
    return `
${idea}, ${mood}, ${time},
premium hospitality campaign,
${style} style, cinematic lighting
`;
  }

  async function generate() {
    setLoading(true);
    setImages([]);
    setSelectedIndex(null);

    try {
      const results = await Promise.all(
        PRESETS.map(async (p) => {
          const res = await fetch("/api/ai/generate", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              prompt: buildPrompt(p.style),
            }),
          });

          const data = await res.json();
          return data.url;
        })
      );

      setImages(results.filter(Boolean));
      setStep(3);
    } catch (err) {
      console.error(err);
    }

    setLoading(false);
  }

  return (
    <div className="min-h-screen bg-black text-white p-10">

      <h1 className="text-4xl mb-6">AI Creative Studio</h1>

      {/* STEP NAV */}
      <div className="flex gap-4 mb-8">
        <button onClick={() => setStep(1)}>1. Setup</button>
        <button onClick={() => setStep(2)}>2. Generate</button>
        <button onClick={() => setStep(3)}>3. Review</button>
        <button onClick={() => setStep(4)}>4. Export</button>
      </div>

      {/* STEP 1 */}
      {step === 1 && (
        <div className="max-w-md space-y-4">

          <input
            value={idea}
            onChange={(e) => setIdea(e.target.value)}
            className="w-full p-2 bg-black border border-white/20"
            placeholder="Idea"
          />

          <input
            value={mood}
            onChange={(e) => setMood(e.target.value)}
            className="w-full p-2 bg-black border border-white/20"
            placeholder="Mood"
          />

          <input
            value={time}
            onChange={(e) => setTime(e.target.value)}
            className="w-full p-2 bg-black border border-white/20"
            placeholder="Time"
          />

          <button
            onClick={() => setStep(2)}
            className="bg-orange-500 px-4 py-2 text-black"
          >
            Continue
          </button>
        </div>
      )}

      {/* STEP 2 */}
      {step === 2 && (
        <div>
          <button
            onClick={generate}
            className="bg-orange-500 px-6 py-3 text-black"
          >
            {loading ? "Generating..." : "Generate 3 Directions"}
          </button>
        </div>
      )}

      {/* STEP 3 */}
      {step === 3 && (
        <div className="grid grid-cols-3 gap-6">

          {images.map((img, i) => (
            <div key={i} className="bg-white/5 p-2 rounded">

              <img src={img} className="h-48 w-full object-cover" />

              <button
                onClick={() => {
                  setSelectedIndex(i);
                  setStep(4);
                }}
                className="mt-2 bg-orange-500 px-3 py-1 text-black"
              >
                Select
              </button>
            </div>
          ))}

        </div>
      )}

      {/* STEP 4 */}
      {step === 4 && selectedIndex !== null && (
        <div className="max-w-xl space-y-4">

          <textarea
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            className="w-full p-2 bg-black border border-white/20"
          />

          <textarea
            value={hashtags}
            onChange={(e) => setHashtags(e.target.value)}
            className="w-full p-2 bg-black border border-white/20"
          />

          <button className="bg-orange-500 px-6 py-3 text-black">
            Export Campaign
          </button>
        </div>
      )}

    </div>
  );
}