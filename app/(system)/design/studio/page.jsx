"use client";

import { useState } from "react";

const CREATE_TYPES = [
  "Social Media",
  "Menu Design",
  "Poster & Flyer",
  "Presentation",
  "Business Card",
  "SOP Builder",
  "Checklist Builder",
  "Contract Builder",
];

export default function DesignStudioPage() {
  const [activeType, setActiveType] =
    useState("Social Media");

  return (
    <div className="min-h-screen bg-[#050505] text-white">

      <div className="border-b border-[#D6B56D]/10">
        <div className="max-w-[1800px] mx-auto px-10 py-10">

          <div className="text-[#D6B56D] uppercase tracking-[0.35em] text-xs mb-4">
            Avantiqo Design OS
          </div>

          <h1 className="text-5xl font-extralight mb-3">
            Design Studio
          </h1>

          <p className="text-white/50 text-xl max-w-4xl">
            Create menus, presentations, flyers, posters,
            SOPs, checklists, contracts and visual assets
            for your organization.
          </p>

        </div>
      </div>

      <div className="max-w-[1800px] mx-auto p-8">

        <div className="grid grid-cols-[220px_minmax(0,1fr)_260px] gap-6">

          {/* LEFT */}

          <div className="rounded-[32px] border border-[#D6B56D]/10 bg-white/[0.02] backdrop-blur-xl p-6">

            <div className="text-[#D6B56D] text-xs uppercase tracking-[0.25em] mb-6">
              Create
            </div>

            <div className="space-y-2">

              {CREATE_TYPES.map((type) => (

                <button
                  key={type}
                  onClick={() =>
                    setActiveType(type)
                  }
                  className={`w-full text-left rounded-xl px-4 py-3 text-sm transition-all ${
                    activeType === type
                      ? "bg-[#D6B56D]/15 border border-[#D6B56D]/30"
                      : "bg-white/[0.03] border border-white/5 hover:border-[#D6B56D]/20"
                  }`}
                >
                  {type}
                </button>

              ))}

            </div>

          </div>

          {/* CENTER */}

          <div className="rounded-[40px] border border-[#D6B56D]/10 bg-white/[0.02] backdrop-blur-xl p-6">

            <div className="flex items-center justify-between mb-8">

              <div>
                <div className="text-[#D6B56D] text-xs uppercase tracking-[0.25em] mb-2">
                  Live Preview
                </div>

                <div className="text-3xl font-light">
                  {activeType}
                </div>
              </div>

            </div>

            <div className="h-[900px] rounded-[32px] bg-black border border-white/5 flex items-center justify-center">

              <div className="text-center">

                <div className="text-4xl font-extralight mb-4">
                  {activeType}
                </div>

                <div className="text-white/40">
                  Preview Canvas
                </div>

              </div>

            </div>

          </div>

          {/* RIGHT */}

          <div className="space-y-4">

            <div className="rounded-[32px] border border-[#D6B56D]/10 bg-white/[0.02] backdrop-blur-xl p-6">

              <div className="text-[#D6B56D] text-xs uppercase tracking-[0.25em] mb-6">
                AI Designer
              </div>

              <textarea
                placeholder="Describe what you want to create..."
                className="w-full h-28 rounded-2xl bg-black border border-white/10 p-4 resize-none"
              />

              <div className="mt-4 grid grid-cols-2 gap-2">

                <button className="rounded-xl border border-[#D6B56D]/30 bg-[#D6B56D]/10 p-3 text-left">
                  <div className="text-sm font-medium">
                    Full AI
                  </div>
                  <div className="text-xs text-white/50 mt-1">
                    Complete generation
                  </div>
                </button>

                <button className="rounded-xl border border-white/10 bg-black p-3 text-left">
                  <div className="text-sm font-medium">
                    Enhance
                  </div>
                  <div className="text-xs text-white/50 mt-1">
                    Improve existing assets
                  </div>
                </button>

                <button className="rounded-xl border border-white/10 bg-black p-3 text-left">
                  <div className="text-sm font-medium">
                    Composite
                  </div>
                  <div className="text-xs text-white/50 mt-1">
                    Combine multiple assets
                  </div>
                </button>

                <button className="rounded-xl border border-white/10 bg-black p-3 text-left">
                  <div className="text-sm font-medium">
                    Video
                  </div>
                  <div className="text-xs text-white/50 mt-1">
                    Generate video content
                  </div>
                </button>

              </div>

              <button className="w-full mt-4 rounded-2xl bg-[#D6B56D] text-black py-4 font-medium">
                Generate Design
              </button>

            </div>

            <div className="rounded-[32px] border border-[#D6B56D]/10 bg-white/[0.02] backdrop-blur-xl p-6">

              <div className="text-[#D6B56D] text-xs uppercase tracking-[0.25em] mb-4">
                Brand Kit
              </div>

              <div className="space-y-3 text-white/60">

                <div>Logo</div>
                <div>Colors</div>
                <div>Typography</div>
                <div>Brand Voice</div>

              </div>

            </div>

            <div className="rounded-[32px] border border-[#D6B56D]/10 bg-white/[0.02] backdrop-blur-xl p-6">

              <div className="text-[#D6B56D] text-xs uppercase tracking-[0.25em] mb-4">
                Assets
              </div>

              <div className="text-white/50">
                Drag & drop assets here
              </div>

            </div>

          </div>

        </div>

      </div>

    </div>
  );
}
