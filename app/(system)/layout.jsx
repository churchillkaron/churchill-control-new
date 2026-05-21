export const dynamic = "force-dynamic";

import PlatformShell
  from "@/components/platform/PlatformShell";

export default function SystemLayout({
  children,
}) {

  return (

    <PlatformShell>

      {children}

    </PlatformShell>

  );

}
