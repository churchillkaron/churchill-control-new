"use client";

import { useEffect, useState } from "react";

export default function BriefWorkspace({
  runtime,
}) {

  const brief =
    runtime.briefRuntime?.current || null;

  const [form, setForm] = useState({
    title: "",
    business_goal: "",
    creative_objective: "",
    target_audience: "",
    call_to_action: "",
    tone: "professional",
    emotion: "trust",
  });

  useEffect(() => {

    if (!brief) {
      return;
    }

    setForm({

      title:
        brief.title || "",

      business_goal:
        brief.business_goal || "",

      creative_objective:
        brief.creative_objective ||
        brief.creative_objective ||
        brief.campaign_goal ||
        "",

      target_audience:
        typeof brief.target_audience === "string"
          ? brief.target_audience
          : JSON.stringify(
              brief.target_audience || {},
              null,
              2,
            ),

      call_to_action:
        brief.call_to_action || "",

      tone:
        brief.tone || "professional",

      emotion:
        brief.emotion || "trust",

    });

  }, [brief]);

  function Field({
    label,
    value,
    onChange,
    textarea = false,
  }) {

    const cls =
      "mt-2 w-full rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 outline-none";

    return (

      <div>

        <div className="text-xs uppercase tracking-[0.22em] text-white/40">
          {label}
        </div>

        {textarea ? (

          <textarea
            rows={5}
            className={cls}
            value={value}
            onChange={onChange}
          />

        ) : (

          <input
            className={cls}
            value={value}
            onChange={onChange}
          />

        )}

      </div>

    );

  }

  return (

    <div className="h-full overflow-auto p-8">

      <div className="mb-8">

        <div className="text-xs uppercase tracking-[0.30em] text-[#c8a96a]">
          Creative Brief
        </div>

        <div className="mt-2 text-3xl font-semibold">
          {form.title || "Creative Brief"}
        </div>

      </div>

      <div className="grid grid-cols-2 gap-6">

        <Field
          label="Business Goal"
          textarea
          value={form.business_goal}
          onChange={e =>
            setForm({
              ...form,
              business_goal: e.target.value,
            })
          }
        />

        <Field
          label="Creative Objective"
          textarea
          value={form.creative_objective}
          onChange={e =>
            setForm({
              ...form,
              creative_objective: e.target.value,
            })
          }
        />

        <Field
          label="Target Audience"
          textarea
          value={form.target_audience}
          onChange={e =>
            setForm({
              ...form,
              target_audience: e.target.value,
            })
          }
        />

        <Field
          label="Call To Action"
          textarea
          value={form.call_to_action}
          onChange={e =>
            setForm({
              ...form,
              call_to_action: e.target.value,
            })
          }
        />

        <Field
          label="Tone"
          value={form.tone}
          onChange={e =>
            setForm({
              ...form,
              tone: e.target.value,
            })
          }
        />

        <Field
          label="Emotion"
          value={form.emotion}
          onChange={e =>
            setForm({
              ...form,
              emotion: e.target.value,
            })
          }
        />

      </div>

    </div>

  );

}
