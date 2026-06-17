"use client";

import { useState } from "react";

export default function OnboardingPage() {
  const [step, setStep] = useState(1);

  const [form, setForm] = useState({
    name: "",
    organizationType: "",
    country: "",

    ownerName: "",
    ownerEmail: "",
    ownerPhone: "",
  });

  const [loading, setLoading] =
    useState(false);

  const [result, setResult] =
    useState(null);

  const update = (
    key,
    value
  ) => {
    setForm(prev => ({
      ...prev,
      [key]: value,
    }));
  };

  const submit = async () => {
    try {
      setLoading(true);

      const res = await fetch(
        "/api/onboarding/provision",
        {
          method: "POST",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify(form),
        }
      );

      const data =
        await res.json();

      setResult(data);

      if (
        data?.redirect?.redirectTo
      ) {
        window.location.href =
          data.redirect.redirectTo;
      }

    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#030712] text-white flex items-center justify-center p-10">
      <div className="w-full max-w-xl bg-white/5 border border-white/10 rounded-2xl p-8">

        <div className="mb-6 text-sm text-white/50">
          Step {step} of 3
        </div>

        {step === 1 && (
          <div className="space-y-4">

            <input
              placeholder="Company Name"
              className="w-full rounded border border-white/10 bg-black/40 p-3"
              value={form.name}
              onChange={e =>
                update(
                  "name",
                  e.target.value
                )
              }
            />

            <select
              className="w-full rounded border border-white/10 bg-black/40 p-3"
              value={
                form.organizationType
              }
              onChange={e =>
                update(
                  "organizationType",
                  e.target.value
                )
              }
            >
              <option value="">
                Industry
              </option>
              <option value="restaurant">
                Restaurant
              </option>
              <option value="hotel">
                Hotel
              </option>
              <option value="agency">
                Agency
              </option>
            </select>

            <input
              placeholder="Business Country"
              className="w-full rounded border border-white/10 bg-black/40 p-3"
              value={form.country}
              onChange={e =>
                update(
                  "country",
                  e.target.value
                )
              }
            />

            <button
              onClick={() =>
                setStep(2)
              }
              className="w-full rounded bg-white p-3 text-black"
            >
              Continue
            </button>

          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">

            <input
              placeholder="Owner Name"
              className="w-full rounded border border-white/10 bg-black/40 p-3"
              value={form.ownerName}
              onChange={e =>
                update(
                  "ownerName",
                  e.target.value
                )
              }
            />

            <input
              placeholder="Owner Email"
              className="w-full rounded border border-white/10 bg-black/40 p-3"
              value={form.ownerEmail}
              onChange={e =>
                update(
                  "ownerEmail",
                  e.target.value
                )
              }
            />

            <input
              placeholder="Owner Phone"
              className="w-full rounded border border-white/10 bg-black/40 p-3"
              value={form.ownerPhone}
              onChange={e =>
                update(
                  "ownerPhone",
                  e.target.value
                )
              }
            />

            <button
              onClick={() =>
                setStep(3)
              }
              className="w-full rounded bg-white p-3 text-black"
            >
              Review
            </button>

          </div>
        )}

        {step === 3 && (
          <div className="space-y-4">

            <div className="rounded border border-white/10 bg-black/20 p-4 text-sm">

              <div>
                <strong>
                  Company:
                </strong>{" "}
                {form.name}
              </div>

              <div>
                <strong>
                  Industry:
                </strong>{" "}
                {
                  form.organizationType
                }
              </div>

              <div>
                <strong>
                  Country:
                </strong>{" "}
                {form.country}
              </div>

              <div>
                <strong>
                  Owner:
                </strong>{" "}
                {
                  form.ownerName
                }
              </div>

              <div>
                <strong>
                  Email:
                </strong>{" "}
                {
                  form.ownerEmail
                }
              </div>

              <div>
                <strong>
                  Phone:
                </strong>{" "}
                {
                  form.ownerPhone
                }
              </div>

            </div>

            <button
              onClick={submit}
              disabled={loading}
              className="w-full rounded bg-green-500 p-3 text-black"
            >
              {loading
                ? "Creating..."
                : "Create Organization"}
            </button>

            {result && (
              <div className="text-sm text-green-400">
                Created successfully
              </div>
            )}

          </div>
        )}

      </div>
    </div>
  );
}
