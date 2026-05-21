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
    <div className="h-screen flex items-center justify-center bg-black text-white">
      <div className="p-10 bg-white/5 border border-white/10 rounded-2xl text-center">
        <h1 className="text-3xl mb-4">Activate Your System</h1>
        <p className="text-white/60 mb-6">
          Unlock full access to your business control system.
        </p>

        <button
          onClick={activate}
          className="bg-orange-500 text-black px-6 py-3 rounded-xl"
        >
          Activate Now
        </button>
      </div>
    </div>
  );
}