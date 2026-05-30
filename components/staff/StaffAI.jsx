"use client";

import {
  useState,
} from "react";

import {
  Bot,
  Mic,
  Send,
  Sparkles,
  Activity,
  Radio,
} from "lucide-react";

export default function StaffAI() {

  const [aiInput, setAiInput] =
    useState("");

  const [loading, setLoading] =
    useState(false);

  const [chatHistory, setChatHistory] =
    useState([]);

  async function askAI() {

    if (!aiInput.trim()) {
      return;
    }

    const question =
      aiInput;

    try {

      setLoading(true);

      const res =
        await fetch(
          "/api/staff/ai-feed",
          {
            method: "POST",
            headers: {
              "Content-Type":
                "application/json",
            },
            body: JSON.stringify({
              question,
            }),
          }
        );

      const data =
        await res.json();

      if (data.success) {

        setChatHistory(
          prev => [
            {
              role:
                "user",
              text:
                question,
            },
            {
              role:
                "ai",
              text:
                data.message,
            },
            ...prev,
          ]
        );

        setAiInput("");

      }

    } catch (err) {

      console.error(err);

    } finally {

      setLoading(false);

    }

  }

  function startVoice() {

    const SpeechRecognition =
      window.SpeechRecognition ||
      window.webkitSpeechRecognition;

    if (
      !SpeechRecognition
    ) {
      return;
    }

    const recognition =
      new SpeechRecognition();

    recognition.lang =
      "en-US";

    recognition.onresult =
      event => {

        const transcript =
          event.results[0][0]
            .transcript;

        setAiInput(
          transcript
        );

      };

    recognition.start();

  }

  return (

    <div className="relative overflow-hidden rounded-[36px] border border-fuchsia-500/10 bg-gradient-to-br from-black via-black to-fuchsia-500/10 backdrop-blur-3xl transition-all duration-500 hover:scale-[1.005] hover:border-white/20">

      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(168,85,247,0.12),transparent_30%)]" />

      <div className="relative z-10 before:absolute before:inset-0 before:rounded-[inherit] before:border before:border-white/5 before:opacity-0 before:transition-all before:duration-700 hover:before:opacity-100">

        <div className="border-b border-white/5 px-6 py-5">

          <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">

            <div className="flex items-center gap-5">

              <div className="flex h-20 w-20 items-center justify-center rounded-[28px] bg-gradient-to-br from-violet-500 via-fuchsia-500 to-cyan-400 shadow-[0_0_50px_rgba(168,85,247,0.35)]">

                <Bot className="h-10 w-10 text-white" />

              </div>

              <div>

                <div className="text-[11px] uppercase tracking-[0.45em] text-fuchsia-300">
                  Churchill Intelligence
                </div>

                <div className="mt-2 text-4xl font-black text-white">
                  Runtime AI Console
                </div>

                <div className="mt-3 max-w-2xl text-sm leading-relaxed text-white/50">
                  Live hospitality intelligence monitoring venue energy,
                  operational pressure, staff momentum and nightlife flow.
                </div>

              </div>

            </div>

            <div className="grid grid-cols-3 gap-3">

              <div className="rounded-[22px] border border-cyan-500/20 bg-cyan-500/10 px-4 py-3">

                <div className="flex items-center gap-2 text-cyan-300">

                  <Radio className="h-4 w-4" />

                  <span className="text-[10px] uppercase tracking-[0.25em]">
                    Live
                  </span>

                </div>

                <div className="mt-2 text-sm font-black text-white">
                  Runtime
                </div>

              </div>

              <div className="rounded-[22px] border border-fuchsia-500/20 bg-fuchsia-500/10 px-4 py-3">

                <div className="flex items-center gap-2 text-fuchsia-300">

                  <Sparkles className="h-4 w-4" />

                  <span className="text-[10px] uppercase tracking-[0.25em]">
                    AI
                  </span>

                </div>

                <div className="mt-2 text-sm font-black text-white">
                  Active
                </div>

              </div>

              <div className="rounded-[22px] border border-emerald-500/20 bg-emerald-500/10 px-4 py-3">

                <div className="flex items-center gap-2 text-emerald-300">

                  <Activity className="h-4 w-4" />

                  <span className="text-[10px] uppercase tracking-[0.25em]">
                    Venue
                  </span>

                </div>

                <div className="mt-2 text-sm font-black text-white">
                  Stable
                </div>

              </div>

            </div>

          </div>

        </div>

        <div className="grid gap-6 p-6 lg:grid-cols-[1fr_380px]">

          <div className="space-y-4">

            {loading && (

              <div className="rounded-[28px] border border-white/10 bg-white/[0.04] p-5 text-sm text-white/60">
                Churchill Intelligence analyzing live venue runtime...
              </div>

            )}

            {chatHistory.length === 0 && !loading && (

              <div className="rounded-[28px] border border-white/10 bg-white/[0.03] p-6">

                <div className="text-[11px] uppercase tracking-[0.35em] text-fuchsia-300">
                  Suggested Runtime Queries
                </div>

                <div className="mt-5 grid gap-3">

                  {[
                    "How is venue energy tonight?",
                    "Analyze FOH performance",
                    "What operational risks exist?",
                    "How can we increase VIP spending?",
                  ].map((item, index) => (

                    <button
                      key={index}
                      onClick={() => setAiInput(item)}
                      className="rounded-[22px] border border-white/10 bg-black/30 px-5 py-4 text-left text-sm text-white/70 transition-all hover:border-fuchsia-500/20 hover:bg-fuchsia-500/10"
                    >
                      {item}
                    </button>

                  ))}

                </div>

              </div>

            )}

            {chatHistory.map(
              (
                item,
                index
              ) => (

                <div
                  key={index}
                  className={`rounded-[28px] border p-5 ${
                    item.role === "ai"
                      ? "border-fuchsia-500/10 bg-fuchsia-500/10 text-white"
                      : "border-white/10 bg-white text-black"
                  }`}
                >

                  <div className="text-[10px] uppercase tracking-[0.3em] opacity-60">
                    {item.role === "ai"
                      ? "Churchill AI"
                      : "Operator"}
                  </div>

                  <div className="mt-3 text-sm leading-relaxed">
                    {item.text}
                  </div>

                </div>

              )
            )}

          </div>

          <div className="rounded-[32px] border border-white/10 bg-black/30 p-5">

            <div className="text-[11px] uppercase tracking-[0.35em] text-cyan-300">
              Runtime Input
            </div>

            <div className="mt-2 text-2xl font-black text-white">
              Operational Query
            </div>

            <div className="mt-4 text-sm leading-relaxed text-white/45">
              Ask Churchill Intelligence about performance,
              venue flow, staff pressure, VIP behavior and live hospitality operations.
            </div>

            <div className="mt-6 space-y-4">

              <textarea
                value={aiInput}
                onChange={e =>
                  setAiInput(
                    e.target.value
                  )
                }
                placeholder="Ask Churchill Intelligence..."
                className="min-h-[180px] w-full rounded-[28px] border border-white/10 bg-black/60 p-5 text-sm text-white outline-none placeholder:text-white/20"
              />

              <div className="flex items-center gap-3">

                <button
                  onClick={startVoice}
                  className="flex h-14 w-14 items-center justify-center rounded-[20px] border border-fuchsia-500/20 bg-fuchsia-500/10 transition-all hover:scale-105"
                >

                  <Mic className="h-5 w-5 text-fuchsia-300" />

                </button>

                <button
                  onClick={askAI}
                  disabled={loading}
                  className="flex flex-1 items-center justify-center gap-3 rounded-[22px] bg-gradient-to-r from-fuchsia-500 to-cyan-500 px-6 py-4 text-sm font-black text-white transition-all hover:scale-[1.01]"
                >

                  <Send className="h-5 w-5" />

                  Launch Runtime Intelligence

                </button>

              </div>

            </div>

          </div>

        </div>

      </div>

    </div>

  );

}
