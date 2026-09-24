"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, CheckCircle2, LoaderCircle } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";

const SECTION_BY_PATH = [
  ["/commercial/marketing/brand", "brand"],
  ["/administration/modules", "modules"],
  ["/administration/users", "team"],
  ["/administration/roles-permissions", "roles_permissions"],
  ["/finance/configure", "finance"],
  ["/documents", "documents"],
  ["/administration/onboarding/payroll", "payroll"],
  ["/people/directory", "staff_portal"],
  ["/people/", "people"],
  ["/commercial/customers", "commercial"],
  ["/supply-chain/", "supply_chain"],
  ["/operations/channel-manager", "hotel_channels"],
  ["/supply-chain/procurement/supplier-access", "supplier_portal"],
  ["/operations/pos", "pos"],
  ["/operations/configuration", "operations"],
  ["/commercial/customers", "customer_portal"],
  ["/projects", "projects"],
  ["/administration/communications-setup", "communications"],
  ["/administration/payments", "payments"],
  ["/administration/business-locations", "locations"],
  ["/administration/integrations", "integrations"],
  ["/administration/domains", "domains"],
  ["/compliance", "compliance"],
  ["/administration/passkey-readiness", "passkeys"],
  ["/developers", "developer_api"],
  ["/administration/access-policy", "security"],
];

function setupSection(pathname) {
  const value = String(pathname || "");
  return SECTION_BY_PATH.find(([fragment]) => value.includes(fragment))?.[1] || null;
}

export default function OnboardingSetupReturnBar() {
  const pathname = usePathname();
  const router = useRouter();
  const [visible, setVisible] = useState(false);
  const [sectionKey, setSectionKey] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setVisible(params.get("onboarding") === "1");
    const requested = String(params.get("onboardingSection") || "").trim().toLowerCase();
    const allowed = new Set(SECTION_BY_PATH.map(([, key]) => key));
    setSectionKey(allowed.has(requested) ? requested : setupSection(pathname));
    setError("");
  }, [pathname]);

  const organizationId = useMemo(() => {
    const match = String(pathname || "").match(/^\/workspace\/([^/]+)/);
    return match?.[1] || null;
  }, [pathname]);

  const setupHref = organizationId ? `/workspace/${organizationId}/administration/onboarding` : null;

  async function skipSection() {
    if (!organizationId || !sectionKey || !setupHref || saving) return;
    try {
      setSaving(true);
      setError("");
      const response = await fetch("/api/onboarding/progress", {
        method:"POST",
        headers:{ "Content-Type":"application/json" },
        body:JSON.stringify({ organizationId, sectionKey, workflowState:"SKIPPED" }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || body?.success === false) throw new Error(body?.error || "Unable to skip this setup section");
      router.push(setupHref);
    } catch (skipError) {
      setError(skipError?.message || "Unable to skip this setup section");
    } finally {
      setSaving(false);
    }
  }

  if (!visible || !organizationId || String(pathname || "").includes("/administration/onboarding")) return null;

  return (
    <div className="border-b border-[#C9AD89]/20 bg-[#FBF6EF] px-4 py-2 md:px-6">
      <div className="mx-auto flex max-w-[1500px] flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2 text-[9px] text-[#776958]">
          <CheckCircle2 size={12} className="shrink-0 text-[#9A744B]" />
          <span className="truncate"><span className="font-semibold text-[#4F4235]">Organization setup</span> · Configure this area now or finish it later.</span>
          {error ? <span className="text-red-700">· {error}</span> : null}
        </div>
        <div className="flex items-center gap-3">
          <Link href={setupHref} className="inline-flex items-center gap-1 text-[8px] font-semibold text-[#765A3E] hover:text-[#4D3927]">
            <ArrowLeft size={9} /> Back to setup
          </Link>
          {sectionKey ? (
            <button type="button" onClick={skipSection} disabled={saving} className="inline-flex items-center gap-1 text-[8px] font-semibold text-[#8A8177] hover:text-[#544D45] disabled:opacity-40">
              {saving ? <LoaderCircle size={9} className="animate-spin" /> : null}
              {saving ? "Saving…" : "Skip this section"}
            </button>
          ) : null}
          <Link href={`/workspace/${organizationId}`} className="text-[8px] font-semibold text-[#8A8177] hover:text-[#544D45]">Finish later</Link>
        </div>
      </div>
    </div>
  );
}
