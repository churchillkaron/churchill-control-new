"use client";

import { useState } from "react";

export default function IntelligenceChatPage() {

  const [
    question,
    setQuestion,
  ] = useState("");

  const [
    response,
    setResponse,
  ] = useState(null);

  async function askQuestion() {

    const res =
      await fetch(
        "/api/intelligence/chat",
        {
          method: "POST",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({
            tenant_id:
              "demo",
            question,
          }),
        }
      );

    const json =
      await res.json();

    setResponse(json);
  }

  return (
    <div className="min-h-screen bg-black text-white p-10">

      <h1 className="text-5xl font-bold mb-10">
        Owner AI Chat
      </h1>

      <div className="flex gap-4">

        <input
          value={question}
          onChange={(e) =>
            setQuestion(
              e.target.value
            )
          }
          placeholder="Ask about revenue, operations, recommendations..."
          className="flex-1 bg-zinc-900 border border-zinc-800 rounded-xl px-5 py-4"
        />

        <button
          onClick={
            askQuestion
          }
          className="bg-white text-black px-6 rounded-xl"
        >
          Ask
        </button>

      </div>

      {response && (

        <div className="mt-10 border border-zinc-800 rounded-xl p-6">

          <div className="text-zinc-400 mb-4">
            AI Response
          </div>

          <div className="text-xl">
            {response.answer}
          </div>

        </div>
      )}

    </div>
  );
}
