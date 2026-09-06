import PlatformAcquisitionControlPanel from "@/components/platform/PlatformAcquisitionControlPanel";
import PlatformAcquisitionOperationsPanel from "@/components/platform/PlatformAcquisitionOperationsPanel";

export const dynamic = "force-dynamic";

export default function PlatformAcquisitionPage() {
  return (
    <main className="min-h-screen bg-[#F4F3EF] py-5">
      <PlatformAcquisitionControlPanel />
      <PlatformAcquisitionOperationsPanel />
    </main>
  );
}
