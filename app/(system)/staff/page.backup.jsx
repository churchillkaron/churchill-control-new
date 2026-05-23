"use client";

import { useEffect, useMemo, useState } from "react";

import {
  Bot,
  BriefcaseBusiness,
  Camera,
  ChefHat,
  Flame,
 Heart,
  Languages,
  MessageCircle,
  Mic,
  Send,
  Sparkles,
  Trophy,
  UserRound,
  Volume2,
} from "lucide-react";

function speakText(text) {
  if (typeof window === "undefined") return;
  if (!window.speechSynthesis) return;

  window.speechSynthesis.cancel();

  const utterance = new SpeechSynthesisUtterance(text);

  utterance.rate = 0.95;
  utterance.pitch = 1;
  utterance.volume = 1;

  window.speechSynthesis.speak(utterance);
}

function FloatingLiveMoments() {
  return (
    <div className="pointer-events-none fixed inset-0 z-10 overflow-hidden">
      <div className="absolute left-[8%] top-[18%] animate-pulse text-sm font-bold tracking-[0.25em] text-emerald-400/20">
        +฿420 VIP TIP
      </div>

      <div className="absolute right-[10%] top-[34%] animate-pulse text-sm font-bold tracking-[0.25em] text-fuchsia-400/20">
        AI WATCHING FLOOR
      </div>

      <div className="absolute bottom-[16%] left-[12%] animate-pulse text-sm font-bold tracking-[0.25em] text-cyan-400/20">
        SERVICE FLOW OPTIMAL
      </div>
    </div>
  );
}

function AICommandCenter({
  input,
  setInput,
  loading,
  askAI,
  startVoice,
  lastAnswer,
}) {
  const quickPrompts = [
    {
      label: "Translate",
      icon: Languages,
      prompt:
        "Translate politely for customer service and allergy communication.",
    },
    {
      label: "Recipes",
      icon: ChefHat,
      prompt:
        "Explain cocktail recipe and premium upsell recommendations.",
    },
    {
      label: "Business",
      icon: BriefcaseBusiness,
      prompt:
        "How can I improve revenue and guest satisfaction tonight?",
    },
    {
      label: "Performance",
      icon: UserRound,
      prompt:
        "Analyze my current shift performance and earning opportunities.",
    },
  ];

  return (
    <div className="mb-5 overflow-hidden rounded-[28px] border border-fuchsia-500/10 bg-black/55 backdrop-blur-3xl">
      <div className="h-[2px] bg-gradient-to-r from-fuchsia-500 via-violet-500 to-cyan-400" />

      <div className="p-4">
        <div className="flex items-start gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-[24px] bg-gradient-to-br from-fuchsia-500 via-violet-500 to-cyan-400 shadow-[0_0_40px_rgba(217,70,239,0.35)]">
            <Bot className="h-6 w-6 text-white" />
          </div>

          <div className="min-w-0 flex-1">
            <div className="text-[10px] uppercase tracking-[0.3em] text-fuchsia-300">
              Churchill AI
            </div>

            <div className="mt-1 text-lg font-semibold text-white">
              Live venue intelligence
            </div>

            <div className="mt-2 text-sm leading-relaxed text-white/55">
              Translation, recipes, guests, salaries, service coaching and live nightlife operations.
            </div>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-4 gap-2">
          {quickPrompts.map((item, index) => {
            const Icon = item.icon;

            return (
              <button
                key={index}
                onClick={() => setInput(item.prompt)}
                className="rounded-2xl border border-white/10 bg-white/[0.04] p-2 transition-all duration-300 hover:scale-[1.03] hover:bg-white/[0.08]"
              >
                <Icon className="mx-auto h-5 w-5 text-fuchsia-300" />

                <div className="mt-2 text-[10px] uppercase tracking-[0.16em] text-white/50">
                  {item.label}
                </div>
              </button>
            );
          })}
        </div>

        <div className="mt-4 rounded-[24px] border border-white/10 bg-black/40 p-3">
          <div className="flex items-center gap-3">
            <button
              onClick={startVoice}
              className="flex h-11 w-11 items-center justify-center rounded-2xl bg-fuchsia-500/20"
            >
              <Mic className="h-5 w-5 text-fuchsia-300" />
            </button>

            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") askAI();
              }}
              placeholder="Ask AI anything..."
              className="min-w-0 flex-1 bg-transparent text-sm text-white outline-none placeholder:text-white/30"
            />

            <button
              onClick={askAI}
              className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-fuchsia-500 to-cyan-400"
            >
              {loading ? (
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
              ) : (
                <Send className="h-5 w-5 text-white" />
              )}
            </button>
          </div>
        </div>

        {lastAnswer && (
          <div className="mt-4 rounded-[24px] border border-cyan-400/15 bg-cyan-400/5 p-4">
            <div className="mb-3 flex items-center justify-between">
              <div className="text-[10px] uppercase tracking-[0.3em] text-cyan-300">
                AI Answer
              </div>

              <button
                onClick={() => speakText(lastAnswer)}
                className="flex items-center gap-2 rounded-full bg-white/5 px-3 py-2 text-[11px] uppercase tracking-[0.2em] text-white/50"
              >
                <Volume2 className="h-4 w-4" />
                Speak
              </button>
            </div>

            <div className="text-sm leading-relaxed text-white/75">
              {lastAnswer}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function StaffPage() {
  const [feed, setFeed] = useState([]);
  const [input, setInput] = useState("");
  const [loadingAI, setLoadingAI] = useState(false);
  const [lastAnswer, setLastAnswer] = useState("");

  useEffect(() => {
    setFeed([
      {
        icon: "🍾",
        title: "VIP Floor Energy",
        text: "Champagne sales exploding after midnight service.",
        tag: "VIP",
        reactions: 142,
        comments: 18,
      },
      {
        icon: "🔥",
        title: "Kitchen Momentum",
        text: "Orders moving faster than projected during rush hour.",
        tag: "RUSH",
        reactions: 96,
        comments: 11,
      },
      {
        icon: "🎧",
        title: "Nightlife Atmosphere",
        text: "Dancefloor engagement climbing with current music flow.",
        tag: "MOOD",
        reactions: 203,
        comments: 27,
      },
    ]);
  }, []);

  async function askAI() {
    if (!input.trim()) return;

    setLoadingAI(true);

    setTimeout(() => {
      setLastAnswer(
        "Churchill AI online. Service flow stable. VIP atmosphere rising. Continue upselling premium experience and maintain guest engagement."
      );

      setLoadingAI(false);
      setInput("");
    }, 1200);
  }

  function startVoice() {
    alert("Voice activated");
  }

  const stories = useMemo(
    () => [
      { label: "VIP", icon: "🥂" },
      { label: "Rush", icon: "🔥" },
      { label: "Crew", icon: "🖤" },
      { label: "DJ", icon: "🎧" },
      { label: "Sales", icon: "💸" },
    ],
    []
  );

  return (
    <div className="relative min-h-screen overflow-hidden bg-black text-white">
      <FloatingLiveMoments />

      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(168,85,247,0.18),transparent_35%),radial-gradient(circle_at_bottom,rgba(34,211,238,0.15),transparent_35%)]" />

      <div className="relative z-20 mx-auto max-w-2xl px-4 pb-24 pt-6">
        <div className="mb-6">
          <div className="text-[10px] uppercase tracking-[0.3em] text-fuchsia-300">
            Churchill Runtime
          </div>

          <div className="mt-2 text-3xl font-black">
            Luxury Staff Portal
          </div>

          <div className="mt-2 text-sm leading-relaxed text-white/45">
            AI nightlife operations, performance coaching and luxury hospitality control.
          </div>
        </div>

        <div className="mb-4 flex gap-4 overflow-x-auto pb-1 no-scrollbar">
          {stories.map((story, index) => (
            <div
              key={index}
              className="flex min-w-[72px] flex-col items-center"
            >
              <div className="flex h-[62px] w-[62px] items-center justify-center rounded-full bg-gradient-to-br from-fuchsia-500 via-violet-500 to-cyan-400 text-2xl shadow-[0_0_35px_rgba(217,70,239,0.35)]">
                {story.icon}
              </div>

              <div className="mt-2 text-[11px] text-white/60">
                {story.label}
              </div>
            </div>
          ))}
        </div>

        <AICommandCenter
          input={input}
          setInput={setInput}
          loading={loadingAI}
          askAI={askAI}
          startVoice={startVoice}
          lastAnswer={lastAnswer}
        />

        <div className="space-y-4">
          {feed.map((item, index) => (
            <div
              key={index}
              className="overflow-hidden rounded-[32px] border border-fuchsia-500/20 bg-fuchsia-500/[0.05] backdrop-blur-3xl"
            >
              <div className="h-[2px] bg-gradient-to-r from-fuchsia-500 via-violet-500 to-cyan-400" />

              <div className="p-4">
                <div className="flex items-start gap-4">
                  <div className="flex h-12 w-12 items-center justify-center rounded-3xl bg-white/10 text-2xl">
                    {item.icon}
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <div className="truncate text-[15px] font-semibold text-white">
                        {item.title}
                      </div>

                      <div className="rounded-full bg-fuchsia-500/15 px-2 py-1 text-[9px] uppercase tracking-[0.2em] text-fuchsia-300">
                        {item.tag}
                      </div>
                    </div>

                    <div className="mt-3 text-[15px] leading-relaxed text-white/70">
                      {item.text}
                    </div>

                    <div className="mt-5 flex items-center gap-4 text-sm text-white/40">
                      <div className="flex items-center gap-1">
                        <Flame className="h-4 w-4" />
                        {item.reactions}
                      </div>

                      <div className="flex items-center gap-1">
                        <MessageCircle className="h-4 w-4" />
                        {item.comments}
                      </div>

                      <div className="flex items-center gap-1">
                        <Heart className="h-4 w-4" />
                        Hype
                      </div>
                    </div>

                    <div className="mt-5 flex gap-2">
                      <button
                        onClick={() =>
                          setInput(
                            `Analyze runtime event: ${item.title}`
                          )
                        }
                        className="rounded-full bg-white/5 px-3 py-2 text-[11px] text-white/50"
                      >
                        Ask AI
                      </button>

                      <button className="rounded-full bg-fuchsia-500/15 px-3 py-2 text-[11px] text-fuchsia-300">
                        Priority
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ))}

          <button className="flex w-full items-center justify-center gap-3 rounded-[28px] border border-white/10 bg-white/[0.05] p-4 text-sm text-white/70">
            <Camera className="h-5 w-5 text-fuchsia-300" />
            Upload stories, invoices, recipes, damage reports or nightlife moments
          </button>

          <div className="overflow-hidden rounded-[32px] border border-amber-500/20 bg-gradient-to-br from-amber-500/10 via-black to-black p-4">
            <div className="flex items-center gap-3">
              <Trophy className="h-6 w-6 text-amber-300" />

              <div>
                <div className="text-[10px] uppercase tracking-[0.35em] text-amber-300">
                  AI Staff Intelligence
                </div>

                <div className="mt-1 text-lg font-semibold text-white">
                  AI learns how your venue performs
                </div>
              </div>
            </div>

            <div className="mt-4 grid grid-cols-3 gap-3">
              <div className="rounded-3xl bg-white/[0.04] p-4 text-center">
                <div className="text-xl">🌍</div>

                <div className="mt-2 text-sm font-bold text-white">
                  Translate
                </div>
              </div>

              <div className="rounded-3xl bg-white/[0.04] p-4 text-center">
                <div className="text-xl">🍸</div>

                <div className="mt-2 text-sm font-bold text-white">
                  Recipes
                </div>
              </div>

              <div className="rounded-3xl bg-white/[0.04] p-4 text-center">
                <div className="text-xl">💸</div>

                <div className="mt-2 text-sm font-bold text-white">
                  Earnings
                </div>
              </div>
            </div>
          </div>

          <div className="mt-8 flex items-center justify-center pb-24">
            <div className="rounded-full border border-white/10 bg-black/40 px-5 py-3 backdrop-blur-3xl">
              <div className="flex items-center gap-3">
                <div className="relative flex h-3 w-3">
                  <div className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />

                  <div className="relative inline-flex h-3 w-3 rounded-full bg-emerald-400" />
                </div>

                <div className="text-[10px] uppercase tracking-[0.28em] text-white/45">
                  Churchill AI Runtime Active
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_bottom,transparent,rgba(0,0,0,0.55))]" />
    </div>
  );
}
