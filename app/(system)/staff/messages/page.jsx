"use client";

import {
  useEffect,
  useState,
} from "react";

import {
  MessageCircle,
  Crown,
  Brain,
  Sparkles,
  Send,
} from "lucide-react";

export default function StaffMessagesPage() {

  const [messages, setMessages] =
    useState([]);

  const [message, setMessage] =
    useState("");

  useEffect(() => {

    loadMessages();

  }, []);

  async function loadMessages() {

    try {

      const res =
        await fetch(
          "/api/staff/profile-overview?tenant_id=76e2caa6-dd78-49e5-b0f5-1ff94185c2d4&email=patric@harrysphuket.com"
        );

      const data =
        await res.json();

      setMessages(
        data?.profile?.messages ||
        []
      );

    } catch (err) {

      console.error(err);

    }

  }

  function getIcon(type) {

    if (
      type?.includes(
        "VIP"
      )
    ) {

      return Crown;

    }

    if (
      type?.includes(
        "AI"
      )
    ) {

      return Brain;

    }

    return Sparkles;

  }

  return (

    <div className="min-h-screen bg-black px-5 py-10 text-white">

      <div className="mx-auto max-w-6xl">

        <div className="overflow-hidden rounded-[40px] border border-fuchsia-500/20 bg-gradient-to-br from-fuchsia-500/10 via-black to-black p-8">

          <div className="flex items-center justify-between">

            <div>

              <div className="text-[11px] uppercase tracking-[0.35em] text-fuchsia-300">
                Churchill Communication
              </div>

              <div className="mt-3 text-6xl font-black">
                Messages
              </div>

              <div className="mt-3 text-white/40">
                Management communication, AI alerts and operational coordination.
              </div>

            </div>

            <div className="hidden md:flex h-28 w-28 items-center justify-center rounded-full bg-fuchsia-500/10">

              <MessageCircle className="h-14 w-14 text-fuchsia-300" />

            </div>

          </div>

        </div>

        <div className="mt-8 space-y-4">

          {messages.map(
            (
              item,
              index
            ) => {

              const Icon =
                getIcon(
                  item.type || ""
                );

              return (

                <div
                  key={index}
                  className="rounded-[32px] border border-white/10 bg-white/[0.04] p-6"
                >

                  <div className="flex items-start justify-between">

                    <div className="flex gap-5">

                      <div className="flex h-14 w-14 items-center justify-center rounded-3xl bg-black/40">

                        <Icon className="h-7 w-7 text-fuchsia-300" />

                      </div>

                      <div>

                        <div className="text-2xl font-bold">
                          {item.subject ||
                            item.type ||
                            "Runtime Message"}
                        </div>

                        <div className="mt-3 max-w-3xl text-white/60">
                          {item.message ||
                            item.content ||
                            "No content"}
                        </div>

                        <div className="mt-3 text-xs text-white/30">

                          {new Date(
                            item.created_at
                          ).toLocaleString()}

                        </div>

                      </div>

                    </div>

                  </div>

                </div>

              );

            }
          )}

        </div>

        <div className="mt-8 rounded-[34px] border border-white/10 bg-white/[0.04] p-6">

          <div className="text-2xl font-bold">
            Send Message
          </div>

          <textarea
            value={message}
            onChange={(e) =>
              setMessage(
                e.target.value
              )
            }
            placeholder="Write message..."
            className="mt-5 h-32 w-full rounded-3xl border border-white/10 bg-black/40 p-5 outline-none"
          />

          <button
            className="mt-5 flex items-center gap-2 rounded-2xl bg-gradient-to-r from-fuchsia-500 to-cyan-400 px-6 py-3 font-semibold"
          >

            <Send className="h-4 w-4" />

            Send Message

          </button>

        </div>

      </div>

    </div>

  );

}
