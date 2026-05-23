"use client";

import {
  useState,
} from "react";

import {
  Bot,
  Mic,
  Send,
  Volume2,
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
          "/api/staff/ai-runtime",
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
            ...prev,
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
          ]
        );

        setAiInput("");

        speakAI(
          data.message
        );

      }

    } catch (err) {

      console.error(err);

    } finally {

      setLoading(false);

    }

  }

  function speakAI(text) {

    if (
      !window.speechSynthesis
    ) {
      return;
    }

    window
      .speechSynthesis
      .cancel();

    const utterance =
      new SpeechSynthesisUtterance(
        text
      );

    utterance.lang =
      "en-US";

    utterance.rate =
      1;

    utterance.pitch =
      1;

    window
      .speechSynthesis
      .speak(
        utterance
      );

  }

  function startVoice() {

    const SpeechRecognition =
      window.SpeechRecognition ||
      window.webkitSpeechRecognition;

    if (
      !SpeechRecognition
    ) {

      alert(
        "Voice recognition not supported"
      );

      return;

    }

    const recognition =
      new SpeechRecognition();

    recognition.lang =
      "en-US";

    recognition.interimResults =
      false;

    recognition.maxAlternatives =
      1;

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

    <div className="overflow-hidden rounded-[32px] border border-white/10 bg-black/40 backdrop-blur-3xl">

      <div className="border-b border-white/5 px-6 py-5">

        <div className="flex items-center gap-4">

          <div className="flex h-16 w-16 items-center justify-center rounded-[26px] bg-gradient-to-br from-violet-500 via-fuchsia-500 to-amber-400 shadow-[0_0_40px_rgba(168,85,247,0.35)]">

            <Bot className="h-8 w-8 text-white" />

          </div>

          <div>

            <div className="text-xs uppercase tracking-[0.35em] text-violet-300">
              Churchill AI
            </div>

            <div className="mt-2 text-3xl font-semibold text-white">
              Hospitality Intelligence
            </div>

          </div>

        </div>

      </div>

      <div className="space-y-4 p-5">

        <div className="max-h-[320px] space-y-3 overflow-auto">

          {chatHistory.map(
            (
              item,
              index
            ) => (

              <div
                key={index}
                className={`rounded-[26px] px-5 py-4 ${
                  item.role ===
                  "ai"
                    ? "border border-violet-500/10 bg-violet-500/10 text-violet-50"
                    : "bg-white text-black"
                }`}
              >

                {item.text}

              </div>

            )
          )}

          {loading && (

            <div className="rounded-[26px] border border-white/10 bg-white/5 px-5 py-4 text-sm text-white/60">
              Churchill AI thinking...
            </div>

          )}

        </div>

        <div className="flex items-center gap-3 rounded-[30px] border border-white/10 bg-black/80 p-3">

          <button
            onClick={
              startVoice
            }
            className="flex h-12 w-12 items-center justify-center rounded-2xl bg-violet-500/20"
          >

            <Mic className="h-5 w-5 text-violet-300" />

          </button>

          <input
            value={aiInput}
            onChange={e =>
              setAiInput(
                e.target.value
              )
            }
            onKeyDown={e => {

              if (
                e.key ===
                "Enter"
              ) {

                askAI();

              }

            }}
            placeholder="Ask Churchill AI..."
            className="flex-1 bg-transparent text-sm text-white outline-none placeholder:text-white/30"
          />

          <button
            onClick={
              askAI
            }
            className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-500 via-fuchsia-500 to-amber-400"
          >

            <Send className="h-5 w-5 text-white" />

          </button>

          <button
            onClick={() =>
              window
                .speechSynthesis
                .cancel()
            }
            className="flex h-12 w-12 items-center justify-center rounded-2xl border border-white/10 bg-white/5"
          >

            <Volume2 className="h-5 w-5 text-white/70" />

          </button>

        </div>

      </div>

    </div>

  );

}
