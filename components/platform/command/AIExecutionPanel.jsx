"use client";

import { useState } from "react";

import {
  CheckCircle2,
  Loader2,
  Sparkles,
  Wand2,
} from "lucide-react";

import {
  useAIExecution,
} from "@/lib/intelligence/useAIExecution";

export default function AIExecutionPanel() {

  const [prompt, setPrompt] =
    useState("");

  const {
    execute,
    loading,
    response,
  } = useAIExecution();

  async function handleExecute() {

    if (!prompt)
      return;

    await execute({

      prompt,

      context: {

        source:
          "platform-command-center",

      },

    });

  }

  return (

    <div className="border-t border-white/10 bg-black/40 p-6">

      <div className="mb-4 flex items-center gap-3">

        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-violet-500/10">

          <Sparkles className="h-6 w-6 text-violet-400" />

        </div>

        <div>

          <div className="text-xl font-light text-white">

            AI Runtime

          </div>

          <div className="text-sm text-white/40">

            Execute platform-level intelligence commands

          </div>

        </div>

      </div>

      <div className="flex items-center gap-3 rounded-2xl border border-violet-500/20 bg-violet-500/5 px-5 py-4">

        <Wand2 className="h-5 w-5 text-violet-400" />

        <input
          value={prompt}
          onChange={e =>
            setPrompt(
              e.target.value
            )
          }
          placeholder="Ask Churchill AI to analyze, automate or orchestrate..."
          className="w-full bg-transparent text-white outline-none placeholder:text-white/20"
        />

        <button
          onClick={
            handleExecute
          }
          disabled={loading}
          className="flex min-w-[90px] items-center justify-center rounded-xl bg-violet-500 px-5 py-2 text-sm font-medium text-white transition-all hover:bg-violet-400 disabled:opacity-50"
        >

          {loading ? (

            <Loader2 className="h-4 w-4 animate-spin" />

          ) : (

            "Run"

          )}

        </button>

      </div>

      <div className="mt-4 flex flex-wrap gap-2">

        {[
          "Analyze kitchen performance",
          "Forecast payroll",
          "Generate campaign",
          "Detect anomalies",
          "Review inventory waste",
        ].map(
          action => (

            <button
              key={action}
              onClick={() =>
                setPrompt(action)
              }
              className="rounded-full border border-white/10 bg-white/[0.03] px-4 py-2 text-xs text-white/60 transition-all hover:border-violet-500/30 hover:bg-violet-500/10 hover:text-white"
            >

              {action}

            </button>

          )
        )}

      </div>

      {response && (

        <div className="mt-6 rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-5">

          <div className="mb-3 flex items-center gap-3">

            <CheckCircle2 className="h-5 w-5 text-emerald-400" />

            <div className="text-sm uppercase tracking-[0.2em] text-emerald-400">

              AI Runtime Response

            </div>

          </div>

          <div className="mb-2 text-white">

            {response.prompt}

          </div>

          <div className="text-sm text-white/50">

            {response.output}

          </div>

        </div>

      )}

    </div>

  );

}
