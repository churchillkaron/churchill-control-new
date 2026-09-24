export const dynamic = "force-dynamic";

import PlatformShell
  from "@/components/platform/PlatformShell";
import OnboardingSetupReturnBar from "@/components/workspace/administration/OnboardingSetupReturnBar";

export default function SystemLayout({
  children,
}) {

  return (

    <PlatformShell>

      <OnboardingSetupReturnBar />
      {children}

    </PlatformShell>

  );

}
