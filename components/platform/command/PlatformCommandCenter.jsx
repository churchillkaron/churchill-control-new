"use client";

import { getActiveDomains } from "@/lib/platform/domains/domainRegistry";
import AIExecutionPanel from "@/components/platform/command/AIExecutionPanel";

/**
 * PLATFORM COMMAND CENTER
 * Clean version after UBTE + domain cleanup
 */

export default function PlatformCommandCenter() {

  const domains = getActiveDomains();

  return (
    <div className="w-full h-full">
      <div className="p-6 border-b border-white/10">
        <h1 className="text-white text-xl font-light">
          Command Center
        </h1>
      </div>

      <div className="p-6 grid grid-cols-2 gap-4">

        <div className="bg-white/5 rounded-xl p-4">
          <h2 className="text-white/70 text-sm mb-3">
            Active Domains
          </h2>

          <div className="space-y-2">
            {domains?.map((d) => (
              <div key={d.name} className="text-white/60 text-sm">
                {d.title}
              </div>
            ))}
          </div>
        </div>

        <AIExecutionPanel />

      </div>
    </div>
  );
}
