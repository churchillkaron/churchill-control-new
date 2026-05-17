"use client";

import { useState } from "react";

export default function VoiceAIPage() {

  const [
    transcript,
    setTranscript,
  ] = useState("");

  const [
    response,
    setResponse,
  ] = useState(null);

  const [
    listening,
    setListening,
  ] = useState(false);

  async function askVoiceAI() {

    const res =
      await fetch(
        "/api/intelligence/voice",
        {
          method: "POST",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({
            tenant_id:
              "demo",
            transcript,
          }),
        }
      );

    const json =
      await res.json();

    setResponse(json);
  }

  function startVoice() {

    if (
      !window.webkitSpeechRecognition
    ) {

      alert(
        "Speech recognition not supported."
      );

      return;
    }

    const recognition =
      new window.webkitSpeechRecognition();

    recognition.continuous =
      false;

    recognition.interimResults =
      false;

    recognition.lang =
      "en-US";

    recognition.start();

    setListening(true);

    recognition.onresult =
      (event) => {

        const text =
          event.results[0][0]
            .transcript;

        setTranscript(
          text
        );

        setListening(
          false
        );
      };

    recognition.onerror =
      () => {

        setListening(
          false
        );
      };
  }

  return (
    <div className="min-h-screen bg-black text-white p-10">

      <h1 className="text-5xl font-bold mb-10">
        Churchill Voice AI
      </h1>

      <div className="flex gap-4">

        <input
          value={transcript}
          onChange={(e) =>
            setTranscript(
              e.target.value
            )
          }
          placeholder="Speak or type..."
          className="flex-1 bg-zinc-900 border border-zinc-800 rounded-2xl px-6 py-4"
        />

        <button
          onClick={
            startVoice
          }
          className="bg-zinc-800 px-6 rounded-2xl"
        >
          {listening
            ? "Listening..."
            : "Voice"}
        </button>

        <button
          onClick={
            askVoiceAI
          }
          className="bg-white text-black px-8 rounded-2xl"
        >
          Ask
        </button>

      </div>

      {response && (

        <div className="mt-10 border border-zinc-800 rounded-2xl p-6">

          <div className="text-zinc-500 mb-4">
            Churchill AI Response
          </div>

          <div className="text-xl whitespace-pre-wrap">
            {response.response}
          </div>

        </div>
      )}

    </div>
  );
}
