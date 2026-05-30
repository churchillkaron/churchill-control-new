"use client";

import { useMemo, useState } from "react";

import {
  Bot,
  Camera,
  ChevronRight,
  Crown,
  Flame,
  Languages,
  Lock,
  Sparkles,
  Trophy,
  User,
  Volume2,
  Wallet,
  CalendarDays,
  FileText,
  MessageCircle,
  Martini,
  Brain,
  Clock3,
  Bell,
  Target,
} from "lucide-react";

export default function StaffWorkshopPage() {
  const [profileImage, setProfileImage] = useState(
    "https://i.pravatar.cc/300?img=5"
  );

  const [activeGame, setActiveGame] = useState("vip");

  function uploadProfile(event) {
    const file = event.target.files?.[0];

    if (!file) return;

    setProfileImage(URL.createObjectURL(file));
  }

  const games = useMemo(
    () => [
      {
        id: "vip",
        title: "VIP Pressure Check",
        icon: Crown,
        mood: "Luxury pressure",
        prompt:
          "A VIP table is quiet, spending slowly, but watching the champagne parade. What is the best approach?",
        choices: [
          "Offer the most expensive bottle immediately",
          "Read the table first, then offer a premium celebration moment",
          "Wait until they ask",
        ],
        answer: 1,
        lesson:
          "Luxury upsell is timing + confidence. Sell the feeling first, then the bottle.",
      },
      {
        id: "translate",
        title: "Translation Duel",
        icon: Languages,
        mood: "Guest communication",
        prompt:
          "A Russian guest asks about seafood allergies. Choose the best service response.",
        choices: [
          "No problem, everything is safe",
          "Let me confirm carefully with kitchen before recommending",
          "You should avoid seafood",
        ],
        answer: 1,
        lesson:
          "Never guess with allergies. Confidence comes from verification.",
      },
      {
        id: "rush",
        title: "Rush Simulation",
        icon: Flame,
        mood: "Peak hour control",
        prompt:
          "Three tables need attention: VIP payment, angry guest waiting food, new champagne order. What first?",
        choices: [
          "Champagne order",
          "Angry guest recovery",
          "VIP payment",
        ],
        answer: 1,
        lesson:
          "Recovering a negative guest moment protects reputation and future revenue.",
      },
      {
        id: "cocktail",
        title: "Blind Cocktail",
        icon: Martini,
        mood: "Bar knowledge",
        prompt:
          "Guest wants something sweet, tropical, strong, and photogenic. Best first suggestion?",
        choices: [
          "Negroni",
          "Pornstar Martini",
          "Old Fashioned",
        ],
        answer: 1,
        lesson:
          "Match drink to emotion, not only ingredients.",
      },
    ],
    []
  );

  const currentGame =
    games.find((game) => game.id === activeGame) || games[0];

  const [selected, setSelected] = useState(null);
  const [aiExplanation, setAiExplanation] = useState("");
  const [checkingAI, setCheckingAI] = useState(false);

  async function selectAnswer(index) {
    setSelected(index);
    setCheckingAI(true);
    setAiExplanation("");

    try {
      const res = await fetch("/api/staff/ai-runtime", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          role: "STAFF",
          venueMood: "Luxury Nightlife Runtime",
          question: `
You are Churchill AI. Explain this staff instinct answer clearly.

Scenario:
${currentGame.prompt}

Staff answer:
${currentGame.choices[index]}

Best answer:
${currentGame.choices[currentGame.answer]}

Explain:
1. Whether the staff answer was correct
2. Why the best answer is best
3. What real hospitality lesson this teaches
4. How this affects guest experience, sales, or reputation

Tone: premium, clear, professional nightlife operations.
          `,
        }),
      });

      const data = await res.json();

      setAiExplanation(
        data.message ||
          data.answer ||
          currentGame.lesson
      );
    } catch (err) {
      console.error(err);
      setAiExplanation(currentGame.lesson);
    } finally {
      setCheckingAI(false);
    }
  }

  const sections = [

    {
      icon: Brain,
      title: "AI Runtime",
      description: "Live executive AI, translation, coaching and operational intelligence",
      route: "/staff",
    },

    {
      icon: Wallet,
      title: "Salary Vault",
      description: "Payslips, payout history, service charge and bonuses",
      route: "/staff/earnings",
    },
    {
      icon: CalendarDays,
      title: "Schedule",
      description: "Your shifts, team lineup and earning nights",
      route: "/staff/schedule",
    },
    {
      icon: MessageCircle,
      title: "Messages",
      description: "Management, crew, AI alerts and approvals",
      route: "/staff/messages",
    },
    {
      icon: FileText,
      title: "Uploads",
      description: "Invoices, recipes, damage reports and marketing files",
    },
    {
      icon: Trophy,
      title: "Performance",
      description: "Stars, rankings, achievements and AI coaching",
      route: "/staff/ai-coach",
    },
    {
      icon: Lock,
      title: "Settings",
      description: "Profile picture, language, voice and security",
      route: "/staff/settings",
    },
  ];

  return (
    <div className="px-4 pb-32">
      <div className="overflow-hidden rounded-[34px] border border-fuchsia-500/10 bg-black/50 backdrop-blur-3xl">
        <div className="h-[2px] bg-gradient-to-r from-fuchsia-500 via-violet-500 to-cyan-400" />

        <div className="p-5">
          <div className="flex items-center gap-4">
            <div className="relative">
              <div className="absolute -inset-2 rounded-full bg-gradient-to-br from-fuchsia-500 via-violet-500 to-cyan-400 blur-xl opacity-45" />

              <img
                src={profileImage}
                className="relative h-24 w-24 rounded-full border-2 border-white object-cover"
              />

              <label className="absolute bottom-0 right-0 flex h-8 w-8 cursor-pointer items-center justify-center rounded-full bg-cyan-400 shadow-[0_0_20px_rgba(34,211,238,0.45)]">
                <Camera className="h-4 w-4 text-black" />

                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={uploadProfile}
                />
              </label>
            </div>

            <div>
              <div className="text-[10px] uppercase tracking-[0.35em] text-fuchsia-300">
                Staff Workshop
              </div>

              <div className="mt-1 text-2xl font-bold text-white">
                Your World
              </div>

              <div className="mt-2 text-sm text-white/50">
                Salary, schedule, profile, AI training, messages, performance and live runtime.
              </div>
            </div>
          </div>

          <div className="mt-6 grid grid-cols-3 gap-3">
            <div className="rounded-3xl bg-white/[0.04] p-4 text-center">
              <div className="text-[10px] uppercase tracking-[0.2em] text-white/40">
                Stars
              </div>
              <div className="mt-2 text-2xl font-bold text-amber-300">
                LIVE
              </div>
            </div>

            <div className="rounded-3xl bg-white/[0.04] p-4 text-center">
              <div className="text-[10px] uppercase tracking-[0.2em] text-white/40">
                Rank
              </div>
              <div className="mt-2 text-2xl font-bold text-fuchsia-300">#2</div>
            </div>

            <div className="rounded-3xl bg-white/[0.04] p-4 text-center">
              <div className="text-[10px] uppercase tracking-[0.2em] text-white/40">
                Aura
              </div>
              <div className="mt-2 text-2xl font-bold text-cyan-300">Elite</div>
            </div>
          </div>
        </div>


      <div className="mt-6 grid gap-4 md:grid-cols-3">

        <a
          href="/staff/runtime"
          className="rounded-[30px] border border-cyan-500/20 bg-cyan-500/5 p-5 transition hover:bg-cyan-500/10"
        >

          <div className="text-[11px] uppercase tracking-[0.25em] text-cyan-300">
            Live Runtime
          </div>

          <div className="mt-3 text-2xl font-bold text-white">
            Venue Intelligence
          </div>

          <div className="mt-2 text-sm text-white/40">
            Live pressure, service mood and AI operational awareness.
          </div>

        </a>

        <a
          href="/staff/messages"
          className="rounded-[30px] border border-fuchsia-500/20 bg-fuchsia-500/5 p-5 transition hover:bg-fuchsia-500/10"
        >

          <div className="text-[11px] uppercase tracking-[0.25em] text-fuchsia-300">
            Communication
          </div>

          <div className="mt-3 text-2xl font-bold text-white">
            Messages
          </div>

          <div className="mt-2 text-sm text-white/40">
            AI alerts, management communication and team coordination.
          </div>

        </a>

        <a
          href="/staff/earnings"
          className="rounded-[30px] border border-emerald-500/20 bg-emerald-500/5 p-5 transition hover:bg-emerald-500/10"
        >

          <div className="text-[11px] uppercase tracking-[0.25em] text-emerald-300">
            Salary Vault
          </div>

          <div className="mt-3 text-2xl font-bold text-white">
            Payroll Runtime
          </div>

          <div className="mt-2 text-sm text-white/40">
            Salary, service charge, payouts and payroll intelligence.
          </div>

        </a>

      </div>


      </div>

      

        <a
          href="/staff/ai-coach"
          className="mt-6 block rounded-[34px] border border-violet-500/20 bg-gradient-to-br from-violet-500/10 via-black to-black p-6 transition hover:border-violet-400/40"
        >

          <div className="flex items-center justify-between">

            <div>

              <div className="text-[11px] uppercase tracking-[0.35em] text-violet-300">
                Adaptive AI Coaching
              </div>

              <div className="mt-3 text-3xl font-black text-white">
                Churchill studies your hospitality instinct
              </div>

              <div className="mt-3 max-w-2xl text-white/50">
                Translation, emotional intelligence, upselling, guest recovery,
                VIP handling and operational confidence evolve continuously through AI learning.
              </div>

            </div>

            <div className="hidden md:flex h-24 w-24 items-center justify-center rounded-full bg-violet-500/10">
              <Brain className="h-12 w-12 text-violet-300" />
            </div>

          </div>

        </a>




        <a
          href="/staff/leaderboard"
          className="mt-5 block rounded-[34px] border border-amber-500/20 bg-gradient-to-br from-amber-500/10 via-black to-black p-6 transition hover:border-amber-400/40"
        >

          <div className="flex items-center justify-between">

            <div>

              <div className="text-[11px] uppercase tracking-[0.35em] text-amber-300">
                Live Ranking System
              </div>

              <div className="mt-3 text-3xl font-black text-white">
                Staff Leaderboard
              </div>

              <div className="mt-3 max-w-2xl text-white/50">
                AI instinct rankings, guest recovery score, translation performance,
                upselling aura and live operational intelligence levels.
              </div>

            </div>

            <div className="hidden md:flex h-24 w-24 items-center justify-center rounded-full bg-amber-500/10">
              <Trophy className="h-12 w-12 text-amber-300" />
            </div>

          </div>

        </a>




        <a
          href="/staff/achievements"
          className="mt-5 block rounded-[34px] border border-cyan-500/20 bg-gradient-to-br from-cyan-500/10 via-black to-black p-6 transition hover:border-cyan-400/40"
        >

          <div className="flex items-center justify-between">

            <div>

              <div className="text-[11px] uppercase tracking-[0.35em] text-cyan-300">
                Recognition System
              </div>

              <div className="mt-3 text-3xl font-black text-white">
                Achievements & Rewards
              </div>

              <div className="mt-3 max-w-2xl text-white/50">
                AI-detected milestones, hospitality achievements, service aura
                progression and operational recognition.
              </div>

            </div>

            <div className="hidden md:flex h-24 w-24 items-center justify-center rounded-full bg-cyan-500/10">
              <Trophy className="h-12 w-12 text-cyan-300" />
            </div>

          </div>

        </a>




        <a
          href="/staff/documents"
          className="mt-5 block rounded-[34px] border border-emerald-500/20 bg-gradient-to-br from-emerald-500/10 via-black to-black p-6 transition hover:border-emerald-400/40"
        >

          <div className="flex items-center justify-between">

            <div>

              <div className="text-[11px] uppercase tracking-[0.35em] text-emerald-300">
                Staff Vault
              </div>

              <div className="mt-3 text-3xl font-black text-white">
                Documents & Contracts
              </div>

              <div className="mt-3 max-w-2xl text-white/50">
                Employment contracts, payroll records, uploads, certifications
                and operational documentation.
              </div>

            </div>

            <div className="hidden md:flex h-24 w-24 items-center justify-center rounded-full bg-emerald-500/10">
              <FileText className="h-12 w-12 text-emerald-300" />
            </div>

          </div>

        </a>




        <a
          href="/staff/notifications"
          className="mt-5 block rounded-[34px] border border-violet-500/20 bg-gradient-to-br from-violet-500/10 via-black to-black p-6 transition hover:border-violet-400/40"
        >

          <div className="flex items-center justify-between">

            <div>

              <div className="text-[11px] uppercase tracking-[0.35em] text-violet-300">
                Live Alerts
              </div>

              <div className="mt-3 text-3xl font-black text-white">
                Notifications Runtime
              </div>

              <div className="mt-3 max-w-2xl text-white/50">
                AI recommendations, operational warnings, schedule alerts,
                guest intelligence and realtime staff notifications.
              </div>

            </div>

            <div className="hidden md:flex h-24 w-24 items-center justify-center rounded-full bg-violet-500/10">
              <Bell className="h-12 w-12 text-violet-300" />
            </div>

          </div>

        </a>




        <a
          href="/staff/goals"
          className="mt-5 block rounded-[34px] border border-fuchsia-500/20 bg-gradient-to-br from-fuchsia-500/10 via-black to-black p-6 transition hover:border-fuchsia-400/40"
        >

          <div className="flex items-center justify-between">

            <div>

              <div className="text-[11px] uppercase tracking-[0.35em] text-fuchsia-300">
                AI Growth Engine
              </div>

              <div className="mt-3 text-3xl font-black text-white">
                Goals & Progression
              </div>

              <div className="mt-3 max-w-2xl text-white/50">
                AI tracked progression, hospitality growth targets,
                operational achievements and personal service evolution.
              </div>

            </div>

            <div className="hidden md:flex h-24 w-24 items-center justify-center rounded-full bg-fuchsia-500/10">
              <Target className="h-12 w-12 text-fuchsia-300" />
            </div>

          </div>

        </a>




        <a
          href="/staff/identity"
          className="mt-5 block rounded-[34px] border border-cyan-500/20 bg-gradient-to-br from-cyan-500/10 via-black to-black p-6 transition hover:border-cyan-400/40"
        >

          <div className="flex items-center justify-between">

            <div>

              <div className="text-[11px] uppercase tracking-[0.35em] text-cyan-300">
                AI Identity System
              </div>

              <div className="mt-3 text-3xl font-black text-white">
                Personal Hospitality Identity
              </div>

              <div className="mt-3 max-w-2xl text-white/50">
                Churchill analyzes leadership style, guest psychology,
                communication aura, operational instinct and hospitality evolution.
              </div>

            </div>

            <div className="hidden md:flex h-24 w-24 items-center justify-center rounded-full bg-cyan-500/10">
              <Crown className="h-12 w-12 text-cyan-300" />
            </div>

          </div>

        </a>


<div className="mt-5 overflow-hidden rounded-[34px] border border-amber-500/20 bg-gradient-to-br from-amber-500/10 via-black to-black backdrop-blur-3xl">
        <div className="p-5">
          <div className="flex items-center gap-3">
            <Brain className="h-6 w-6 text-amber-300" />

            <div>
              <div className="text-[10px] uppercase tracking-[0.35em] text-amber-300">
                Runtime Instinct
              </div>

              <div className="mt-1 text-xl font-semibold text-white">
                Check your knowledge and get your instinct score
              </div>
            </div>
          </div>

          <div className="mt-5 flex gap-2 overflow-x-auto pb-1 no-scrollbar">
            {games.map((game) => {
              const Icon = game.icon;
              const active = game.id === activeGame;

              return (
                <button
                  key={game.id}
                  onClick={() => {
                    setActiveGame(game.id);
                    setSelected(null);
                    setAiExplanation("");
                  }}
                  className={`min-w-[130px] rounded-2xl border p-3 text-left transition ${
                    active
                      ? "border-amber-300/40 bg-amber-300/10"
                      : "border-white/10 bg-white/[0.04]"
                  }`}
                >
                  <Icon className="h-5 w-5 text-amber-300" />

                  <div className="mt-2 text-sm font-semibold text-white">
                    {game.title}
                  </div>

                  <div className="mt-1 text-[11px] text-white/40">
                    {game.mood}
                  </div>
                </button>
              );
            })}
          </div>

          <div className="mt-5 rounded-[28px] border border-white/10 bg-black/35 p-4">
            <div className="flex items-center justify-between">
              <div className="text-[10px] uppercase tracking-[0.28em] text-white/35">
                Pressure Check
              </div>

              <div className="flex items-center gap-2 text-[11px] text-white/40">
                <Clock3 className="h-4 w-4" />
                Instinct score
              </div>
            </div>

            <div className="mt-3 text-lg font-semibold leading-relaxed text-white">
              {currentGame.prompt}
            </div>

            <div className="mt-5 space-y-2">
              {currentGame.choices.map((choice, index) => {
                const isSelected = selected === index;
                const isCorrect = selected !== null && index === currentGame.answer;
                const isWrong =
                  selected !== null &&
                  isSelected &&
                  index !== currentGame.answer;

                return (
                  <button
                    key={index}
                    onClick={() => selectAnswer(index)}
                    className={`w-full rounded-2xl border p-4 text-left text-sm transition ${
                      isCorrect
                        ? "border-emerald-400/50 bg-emerald-400/10 text-emerald-200"
                        : isWrong
                        ? "border-red-400/40 bg-red-400/10 text-red-200"
                        : "border-white/10 bg-white/[0.04] text-white/70"
                    }`}
                  >
                    {choice}
                  </button>
                );
              })}
            </div>

            {selected !== null && (
              <div className="mt-5 rounded-2xl border border-cyan-400/15 bg-cyan-400/5 p-4">
                <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.3em] text-cyan-300">
                  <Bot className="h-4 w-4" />
                  AI Explanation
                </div>

                <div className="mt-2 text-sm leading-relaxed text-white/70">
                  {checkingAI
                    ? "Churchill AI is reading your decision..."
                    : aiExplanation || currentGame.lesson}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
   </div>
      
  );
}
