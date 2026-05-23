"use client";

import { useEffect, useState } from "react";

import {
  Camera,
  Flame,
  Heart,
  MessageCircle,
  Sparkles,
  Trophy,
  Zap,
} from "lucide-react";


function FloatingLiveMoments() {

  const moments = [

    {
      text: "+฿420 VIP TIP",
      className:
        "top-[18%] left-[8%] text-emerald-400/30",
    },

    {
      text: "CHAMPAGNE ENERGY",
      className:
        "top-[34%] right-[10%] text-fuchsia-400/20",
    },

    {
      text: "+2 STAR POWER",
      className:
        "bottom-[32%] left-[20%] text-cyan-400/20",
    },

    {
      text: "AI WATCHING FLOOR",
      className:
        "bottom-[20%] right-[12%] text-amber-300/20",
    },

  ];

  return (

    <div className="pointer-events-none fixed inset-0 z-10 overflow-hidden">

      {

        moments.map(
          (
            item,
            index
          ) => (

            <div
              key={index}
              className={`absolute text-sm font-bold tracking-[0.2em] animate-pulse ${item.className}`}
            >

              {item.text}

            </div>

          )
        )

      }

    </div>

  );

}




function LiveAIOverlay() {

  return (

    <div className="fixed bottom-[140px] left-4 right-4 z-30">

      <div className="mx-auto max-w-md">

        <div className="overflow-hidden rounded-[34px] border border-fuchsia-500/20 bg-black/50 backdrop-blur-3xl shadow-[0_0_60px_rgba(217,70,239,0.25)]">

          <div className="h-[2px] bg-gradient-to-r from-fuchsia-500 via-violet-500 to-cyan-400" />
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(217,70,239,0.16),transparent_34%)] opacity-0 transition duration-500 group-hover:opacity-100" />

          <div className="flex items-start gap-4 p-4">

            <div className="flex h-14 w-14 items-center justify-center rounded-3xl bg-gradient-to-br from-fuchsia-500 via-violet-500 to-cyan-400 shadow-[0_0_40px_rgba(217,70,239,0.45)]">

              🤖

            </div>

            <div className="flex-1">

              <div className="flex items-center gap-2">

                <div className="text-sm font-bold tracking-wide">

                  Churchill AI

                </div>

                <div className="rounded-full bg-emerald-400/20 px-2 py-1 text-[9px] font-bold uppercase tracking-[0.25em] text-emerald-300">

                  LIVE

                </div>

              </div>

              <div className="mt-2 text-sm leading-relaxed text-white/70">

                VIP table energy increasing. Push champagne now. Probability of +2,000 THB bonus is high.

              </div>

              <div className="mt-4 flex items-center gap-3">

                <button className="rounded-full bg-fuchsia-500/20 px-4 py-2 text-[11px] font-bold uppercase tracking-[0.2em] text-fuchsia-300">

                  ACCEPT

                </button>

                <button className="rounded-full bg-white/5 px-4 py-2 text-[11px] font-bold uppercase tracking-[0.2em] text-white/40">

                  DISMISS

                </button>

              </div>

            </div>

          </div>

        </div>

      </div>

    </div>

  );

}



function DynamicVenueAtmosphere() {
  return (
    <div className="pointer-events-none fixed inset-0 z-[1] overflow-hidden">
      <div className="absolute left-[8%] top-[18%] h-40 w-40 rounded-full bg-fuchsia-500/10 blur-[90px] animate-pulse" />
      <div className="absolute right-[12%] top-[42%] h-52 w-52 rounded-full bg-cyan-400/10 blur-[100px] animate-pulse" />
      <div className="absolute bottom-[18%] left-[28%] h-48 w-48 rounded-full bg-amber-400/10 blur-[100px] animate-pulse" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(217,70,239,0.08),transparent_38%)]" />
    </div>
  );
}

function LiveInsertionToast() {
  return (
    <div className="pointer-events-none fixed left-4 right-4 top-[205px] z-40">
      <div className="mx-auto max-w-md rounded-full border border-fuchsia-500/20 bg-black/55 px-5 py-3 text-center text-[11px] font-bold uppercase tracking-[0.28em] text-fuchsia-200 shadow-[0_0_50px_rgba(217,70,239,0.35)] backdrop-blur-3xl">
        New AI runtime moments loading
      </div>
    </div>
  );
}

function EmotionReactionRail() {
  return (
    <div className="fixed right-4 top-[46%] z-40 hidden flex-col gap-3 md:flex">
      {["🔥", "🍾", "👑", "💸", "⚡"].map((item, index) => (
        <button
          key={index}
          className="flex h-12 w-12 items-center justify-center rounded-full border border-white/10 bg-black/50 text-lg shadow-[0_0_35px_rgba(255,255,255,0.08)] backdrop-blur-3xl transition hover:scale-110 hover:bg-fuchsia-500/20"
        >
          {item}
        </button>
      ))}
    </div>
  );
}




function LiveVenuePulse() {

  const events = [

    {
      emoji: "🍾",
      title: "VIP TABLE OPENED",
      subtitle: "High spend probability detected",
      glow: "from-amber-400/30 to-fuchsia-500/20",
    },

    {
      emoji: "🔥",
      title: "RUSH MODE ACTIVE",
      subtitle: "Order velocity increasing fast",
      glow: "from-red-500/30 to-orange-500/20",
    },

    {
      emoji: "💸",
      title: "BONUS WINDOW",
      subtitle: "+฿2,000 opportunity available",
      glow: "from-emerald-500/30 to-cyan-500/20",
    },

  ];

  return (

    <div className="mb-6 overflow-x-auto no-scrollbar">

      <div className="flex gap-4">

        {

          events.map(
            (
              item,
              index
            ) => (

              <div
                key={index}
                className={`min-w-[280px] overflow-hidden rounded-[34px] border border-white/10 bg-gradient-to-br ${item.glow} backdrop-blur-3xl`}
              >

                <div className="p-5">

                  <div className="flex items-start gap-4">

                    <div className="flex h-16 w-16 items-center justify-center rounded-3xl bg-black/30 text-3xl shadow-[0_0_40px_rgba(255,255,255,0.08)]">

                      {item.emoji}

                    </div>

                    <div className="flex-1">

                      <div className="text-[11px] uppercase tracking-[0.3em] text-white/50">

                        LIVE EVENT

                      </div>

                      <div className="mt-2 text-lg font-bold">

                        {item.title}

                      </div>

                      <div className="mt-2 text-sm text-white/70">

                        {item.subtitle}

                      </div>

                    </div>

                  </div>

                </div>

              </div>

            )
          )

        }

      </div>

    </div>

  );

}


export default function StaffPage() {
  const [feed, setFeed] = useState([]);

  useEffect(() => {
    loadRuntime();

    const interval = setInterval(loadRuntime, 10000);

    return () => clearInterval(interval);
  }, []);

  async function loadRuntime() {
    try {
      const res = await fetch("/api/staff/ai-runtime", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          question: "Generate addictive luxury staff portal feed",
        }),
      });

      const data = await res.json();

      if (data.realtimeFeed) {
        setFeed(data.realtimeFeed);
      }
    } catch (err) {
      console.error(err);
    }
  }

  const stories = [
    {
      label: "VIP",
      icon: "👑",
    },
    {
      label: "Rush",
      icon: "🔥",
    },
    {
      label: "AI",
      icon: "🤖",
    },
    {
      label: "Money",
      icon: "💸",
    },
    {
      label: "Crew",
      icon: "🖤",
    },
    {
      label: "Backstage",
      icon: "📸",
    },
    {
      label: "Champagne",
      icon: "🍾",
    },
  ];

  const fallbackFeed = [
    {
      type: "ai",
      icon: "🤖",
      title: "Churchill AI is watching the room",
      text: "VIP energy is rising. Push champagne before midnight. You are close to unlocking Elite Bonus.",
      tag: "AI LIVE",
      reactions: 44,
      comments: 7,
    },
    {
      type: "money",
      icon: "💸",
      title: "+850 THB tip moment",
      text: "Table 7 just pushed your night earnings higher. Keep the VIP rhythm going.",
      tag: "MONEY",
      reactions: 31,
      comments: 4,
    },
    {
      type: "challenge",
      icon: "🍾",
      title: "Champagne Challenge",
      text: "Sell 2 more bottles before 23:30 and unlock +2,000 THB bonus energy.",
      tag: "MISSION",
      reactions: 58,
      comments: 12,
    },
    {
      type: "social",
      icon: "📸",
      title: "Backstage moment uploaded",
      text: "The crew energy is strong tonight. AI marked this as a high-engagement nightlife moment.",
      tag: "STORY",
      reactions: 76,
      comments: 18,
    },
    {
      type: "rank",
      icon: "🏆",
      title: "You are close to Rank #1",
      text: "Only 1 champagne sale behind Cole. This is your window.",
      tag: "RANKING",
      reactions: 29,
      comments: 5,
    },
  ];

  const activeFeed = feed.length ? feed : fallbackFeed;

  return (
    <div className="px-4">
      <DynamicVenueAtmosphere />
      <FloatingLiveMoments />
      <LiveInsertionToast />
      <EmotionReactionRail />      <LiveAIOverlay />
      <div className="mb-6">
        <div className="flex gap-4 overflow-x-auto pb-2 no-scrollbar">
          {stories.map((story, index) => (
            <div key={index} className="flex min-w-[78px] flex-col items-center">
              <div className="relative h-[70px] w-[70px] rounded-full bg-gradient-to-br from-fuchsia-500 via-violet-500 to-cyan-400 p-[2px] shadow-[0_0_35px_rgba(217,70,239,0.35)]">
                <div className="flex h-full w-full items-center justify-center rounded-full bg-black text-2xl">
                  {story.icon}
                </div>

                <div className="absolute bottom-0 right-0 flex h-5 w-5 items-center justify-center rounded-full bg-emerald-400 text-[10px] font-bold text-black">
                  +
                </div>
              </div>

              <div className="mt-2 text-[11px] text-white/60">
                {story.label}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="mb-6 overflow-hidden rounded-[38px] border border-fuchsia-500/20 bg-gradient-to-br from-fuchsia-500/15 via-violet-500/10 to-black p-5 shadow-[0_0_70px_rgba(217,70,239,0.2)]">
        <div className="flex items-center gap-3">
          <div className="flex h-14 w-14 items-center justify-center rounded-3xl bg-white/10">
            <Zap className="h-7 w-7 text-fuchsia-300" />
          </div>

          <div>
            <div className="text-[10px] uppercase tracking-[0.35em] text-fuchsia-300">
              Tonight Mission
            </div>

            <div className="mt-1 text-xl font-bold">
              Own the VIP floor
            </div>
          </div>
        </div>

        <div className="mt-5 rounded-3xl border border-white/10 bg-black/30 p-4">
          <div className="text-sm leading-relaxed text-white/70">
            Sell 2 champagne bottles, keep response time under 3 minutes, and stay above 90 stars.
          </div>

          <div className="mt-4 h-3 overflow-hidden rounded-full bg-white/10">
            <div className="h-full w-[62%] rounded-full bg-gradient-to-r from-fuchsia-500 via-violet-500 to-cyan-400" />
          </div>

          <div className="mt-3 flex items-center justify-between text-xs text-white/40">
            <span>62% complete</span>
            <span>+฿2,000 bonus</span>
          </div>
        </div>
      </div>

      <LiveVenuePulse />

      <div className="space-y-6 pb-10">
        {activeFeed.map((item, index) => (
          <div
            key={index}
            className="group relative overflow-hidden rounded-[40px] border border-white/10 bg-white/[0.045] backdrop-blur-3xl shadow-[0_0_60px_rgba(255,255,255,0.04)] transition duration-500 hover:-translate-y-1 hover:border-fuchsia-500/30 hover:shadow-[0_0_90px_rgba(217,70,239,0.22)]"
          >
            <div className="h-[2px] bg-gradient-to-r from-fuchsia-500 via-violet-500 to-cyan-400" />

            <div className="p-5">
              <div className="flex items-start gap-4">
                <div className="flex h-16 w-16 items-center justify-center rounded-3xl bg-white/10 text-3xl shadow-[0_0_40px_rgba(255,255,255,0.06)]">
                  {item.icon}
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <div className="truncate text-[15px] font-semibold tracking-wide">
                      {item.title}
                    </div>

                    <div className="rounded-full bg-fuchsia-500/15 px-2 py-1 text-[9px] font-bold uppercase tracking-[0.2em] text-fuchsia-300">
                      {item.tag || "LIVE"}
                    </div>
                  </div>

                  <div className="mt-3 text-[15px] leading-relaxed text-white/72">
                    {item.text}
                  </div>

                  <div className="mt-5 flex items-center justify-between">
                    <div className="flex items-center gap-5 text-sm text-white/40">
                      <button className="flex items-center gap-1 transition hover:text-fuchsia-300">
                        <Flame className="h-4 w-4" />
                        {item.reactions || 12}
                      </button>

                      <button className="flex items-center gap-1 transition hover:text-cyan-300">
                        <MessageCircle className="h-4 w-4" />
                        {item.comments || 3}
                      </button>

                      <button className="flex items-center gap-1 transition hover:text-rose-300">
                        <Heart className="h-4 w-4" />
                        Hype
                      </button>
                    </div>

                    <button className="rounded-full bg-white/5 px-3 py-2 text-[11px] font-semibold text-white/50 transition hover:bg-white/10 hover:text-white">
                      Open
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        ))}

        <div className="overflow-hidden rounded-[40px] border border-amber-500/20 bg-gradient-to-br from-amber-500/15 via-black to-black p-5">
          <div className="flex items-center gap-3">
            <Trophy className="h-6 w-6 text-amber-300" />

            <div>
              <div className="text-[10px] uppercase tracking-[0.35em] text-amber-300">
                Elite Board
              </div>

              <div className="mt-1 text-lg font-bold">
                Tonight is still open
              </div>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-3 gap-3 text-center">
            <div className="rounded-3xl bg-white/[0.04] p-4">
              <div className="text-2xl">🥇</div>
              <div className="mt-2 text-sm font-bold">Cole</div>
              <div className="text-xs text-white/40">฿24k</div>
            </div>

            <div className="rounded-3xl bg-white/[0.04] p-4">
              <div className="text-2xl">🥈</div>
              <div className="mt-2 text-sm font-bold">You</div>
              <div className="text-xs text-white/40">฿21k</div>
            </div>

            <div className="rounded-3xl bg-white/[0.04] p-4">
              <div className="text-2xl">🥉</div>
              <div className="mt-2 text-sm font-bold">Max</div>
              <div className="text-xs text-white/40">฿18k</div>
            </div>
          </div>
        </div>

        <button className="flex w-full items-center justify-center gap-3 rounded-[34px] border border-white/10 bg-white/[0.05] p-5 text-sm font-semibold text-white/70 backdrop-blur-3xl">
          <Camera className="h-5 w-5 text-fuchsia-300" />
          Upload nightlife moment
          <Sparkles className="h-5 w-5 text-cyan-300" />
        </button>
      </div>
    </div>
  );
}

