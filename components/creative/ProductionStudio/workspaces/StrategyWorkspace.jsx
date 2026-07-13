"use client";

import { useEffect, useState } from "react";

export default function StrategyWorkspace({
  runtime,
}) {

  const strategy =
    runtime.strategyRuntime?.current || null;

  const [form, setForm] = useState({
    positioning: "",
    audience_strategy: "",
    messaging: "",
    channels: "",
    budget_strategy: "",
    success_metrics: "",
  });

  useEffect(() => {

    if (!strategy) return;

    setForm({

      positioning:
        strategy.positioning || "",

      audience_strategy:
        strategy.audience_strategy || "",

      messaging:
        strategy.messaging || "",

      channels:
        Array.isArray(strategy.channels)
          ? strategy.channels.join(", ")
          : strategy.channels || "",

      budget_strategy:
        strategy.budget_strategy || "",

      success_metrics:
        strategy.success_metrics || "",

    });

  }, [strategy]);

  function Field({
    label,
    value,
    onChange,
  }) {

    return (

      <div>

        <div className="mb-2 text-xs uppercase tracking-[0.24em] text-white/40">
          {label}
        </div>

        <textarea
          rows={5}
          className="w-full rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 outline-none"
          value={value}
          onChange={onChange}
        />

      </div>

    );

  }

  return (

    <div className="h-full overflow-auto p-8">

      <div className="mb-8">

        <div className="text-xs uppercase tracking-[0.30em] text-[#c8a96a]">
          Creative Strategy
        </div>

        <div className="mt-2 text-3xl font-semibold">
          Strategic Direction
        </div>

      </div>

      <div className="grid grid-cols-2 gap-6">

        <Field
          label="Positioning"
          value={form.positioning}
          onChange={e =>
            setForm({
              ...form,
              positioning: e.target.value,
            })
          }
        />

        <Field
          label="Stakeholder Strategy"
          value={form.audience_strategy}
          onChange={e =>
            setForm({
              ...form,
              audience_strategy: e.target.value,
            })
          }
        />

        <Field
          label="Messaging"
          value={form.messaging}
          onChange={e =>
            setForm({
              ...form,
              messaging: e.target.value,
            })
          }
        />

        <Field
          label="Channels"
          value={form.channels}
          onChange={e =>
            setForm({
              ...form,
              channels: e.target.value,
            })
          }
        />

        <Field
          label="Budget Strategy"
          value={form.budget_strategy}
          onChange={e =>
            setForm({
              ...form,
              budget_strategy: e.target.value,
            })
          }
        />

        <Field
          label="Success Metrics"
          value={form.success_metrics}
          onChange={e =>
            setForm({
              ...form,
              success_metrics: e.target.value,
            })
          }
        />

      </div>

    </div>

  );

}
