"use client";

export const dynamic = "force-dynamic";

import { useRouter } from "next/navigation";

export default function SubscribePage() {
  const router = useRouter();

  const activate = async () => {
    // temporary fake activation
    await fetch("/api/activate-subscription");

    router.push("/system-setup/step-1");
  };

  return (
    <main className="min-h-screen bg-[#F3EEE5] text-[#171614]">
      <div className="mx-auto flex min-h-screen max-w-[1180px] items-center px-5 py-16 sm:px-7 lg:px-10">
        <div className="grid w-full overflow-hidden rounded-[34px] border border-black/[0.08] bg-[#F9F5EF] shadow-[0_34px_100px_rgba(68,47,25,.12)] lg:grid-cols-[.92fr_1.08fr]">
          <div className="p-8 sm:p-12 lg:p-16">
            <div className="text-[9px] font-semibold uppercase tracking-[.24em] text-[#9A744B]">AVANTIQO / ACTIVATE</div>
            <h1 className="mt-5 text-[48px] font-medium leading-[.96] tracking-[-.055em] sm:text-[62px]">Activate your Avantiqo environment.</h1>
            <p className="mt-6 max-w-xl text-[14px] leading-7 text-[#6B645C]">Continue into setup and configure the organization, operating context and products you want to use first.</p>
            <button onClick={activate} className="mt-9 inline-flex h-11 items-center rounded-full bg-[#171614] px-5 text-[10px] font-semibold text-white shadow-[0_10px_28px_rgba(20,18,15,.16)]">Activate and continue →</button>
          </div>
          <div className="relative min-h-[420px] bg-[url('/art/commercial-start.jpg')] bg-cover bg-center">
            <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(255,255,255,.01),rgba(20,15,10,.22))]"/>
            <div className="absolute bottom-6 left-6 right-6 rounded-[22px] border border-white/72 bg-[#F8F1E8]/88 p-5 text-[#2B251F] backdrop-blur-xl">
              <div className="text-[7px] font-semibold uppercase tracking-[.20em] text-[#A36F39]">SETUP → VERIFY → GO LIVE</div>
              <div className="mt-2 text-[13px] leading-6 text-[#62594F]">Start focused. Add products, channels and intelligence as the operation needs them.</div>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}