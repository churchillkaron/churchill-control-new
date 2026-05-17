"use client";

import { useState } from "react";

export default function IntelligenceChatPage() {

  const [
    question,
    setQuestion,
  ] = useState("");

  const [
    messages,
    setMessages,
  ] = useState([
    {
      role: "assistant",
      content:
        "Churchill AI online. Ask about revenue, operations, forecasting, staff, customers, or recommendations.",
    },
  ]);

  const [
    loading,
    setLoading,
  ] = useState(false);

  async function askQuestion() {

    if (!question.trim()) {
      return;
    }

    const userMessage = {
      role: "user",
      content: question,
    };

    setMessages(
      (prev) => [
        ...prev,
        userMessage,
      ]
    );

    setLoading(true);

    try {

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

      setMessages(
        (prev) => [
          ...prev,
          {
            role:
              "assistant",
            content:
              json.answer ||
              "No response generated.",
          },
        ]
      );

      if (
        question
          .toLowerCase()
          .includes("fix")
      ) {

        const corrective =
          await fetch(
            "/api/intelligence/actions/run",
            {
              method: "POST",
              headers: {
                "Content-Type":
                  "application/json",
              },
              body: JSON.stringify({
                tenant_id:
                  "demo",
                issue:
                  "LOW_PERFORMANCE",
                severity:
                  "warning",
              }),
            }
          );

        const action =
          await corrective.json();

        setMessages(
          (prev) => [
            ...prev,
            {
              role:
                "assistant",
              content:
                `Corrective action executed:\n${action.action}`,
            },
          ]
        );
      }

      setQuestion("");

    } catch (error) {

      setMessages(
        (prev) => [
          ...prev,
          {
            role:
              "assistant",
            content:
              "AI system error.",
          },
        ]
      );

    } finally {

      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-black text-white flex flex-col">

      <div className="border-b border-zinc-800 px-8 py-6">

        <h1 className="text-4xl font-bold">
          Churchill AI
        </h1>

        <div className="text-zinc-500 mt-2">
          Restaurant Intelligence Copilot
        </div>

      </div>

      <div className="flex-1 overflow-auto p-8 space-y-6">

        {messages.map(
          (
            message,
            index
          ) => (

            <div
              key={index}
              className={`max-w-4xl rounded-2xl p-5 whitespace-pre-wrap ${
                message.role ===
                "user"
                  ? "bg-white text-black ml-auto"
                  : "bg-zinc-900 border border-zinc-800"
              }`}
            >
              {message.content}
            </div>
          )
        )}

        {loading && (

          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 w-fit">
            Churchill AI thinking...
          </div>
        )}

      </div>

      <div className="border-t border-zinc-800 p-6">

        <div className="flex gap-4">

          <input
            value={question}
            onChange={(e) =>
              setQuestion(
                e.target.value
              )
            }
            onKeyDown={(e) => {

              if (
                e.key === "Enter"
              ) {

                askQuestion();
              }
            }}
            placeholder="Ask Churchill AI..."
            className="flex-1 bg-zinc-900 border border-zinc-800 rounded-2xl px-6 py-4 outline-none"
          />

          <button
            onClick={
              askQuestion
            }
            disabled={loading}
            className="bg-white text-black px-8 rounded-2xl disabled:opacity-50"
          >
            Send
          </button>

        </div>

      </div>

    </div>
  );
}
